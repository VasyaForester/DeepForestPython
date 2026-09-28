from __future__ import annotations

import os
import secrets
from pathlib import Path

import yaml
from flask import Flask, jsonify, request, session
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from werkzeug.security import check_password_hash, generate_password_hash

from .grading import task_score, weighted_average
from .models import (
    Attempt,
    Base,
    Certificate,
    DiagnosticResult,
    Diploma,
    Draft,
    LessonProgress,
    ResetToken,
    SecurityEvent,
    TaskProgress,
    User,
    utcnow,
)

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content"
DATA = ROOT / "backend" / "data"


def load_lessons() -> list[dict]:
    lessons = []
    for path in sorted((CONTENT / "lessons").glob("*.yaml")):
        with path.open(encoding="utf-8") as handle:
            lessons.append(yaml.safe_load(handle))
    return lessons


def lesson_map() -> dict[str, dict]:
    return {lesson["id"]: lesson for lesson in load_lessons()}


def task_map() -> dict[str, tuple[dict, dict]]:
    found = {}
    for lesson in load_lessons():
        for task in lesson["tasks"]:
            found[task["id"]] = (lesson, task)
    return found


def create_app() -> Flask:
    DATA.mkdir(parents=True, exist_ok=True)
    secret_path = DATA / "secret.txt"
    if not secret_path.exists():
        secret_path.write_text(secrets.token_hex(32), encoding="utf-8")
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.environ.get("DFP_SECRET") or secret_path.read_text(encoding="utf-8").strip()
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    engine = create_engine(os.environ.get("DFP_DATABASE_URL", f"sqlite:///{DATA / 'app.db'}"))
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.extensions["db_factory"] = factory

    @app.get("/api/python/health")
    def health():
        return jsonify(ok=True)

    @app.post("/api/python/auth/register")
    def register():
        payload = request.get_json(force=True) or {}
        name = str(payload.get("name") or "").strip()
        email = str(payload.get("email") or "").strip().lower()
        password = str(payload.get("password") or "")
        if len(name) < 2 or "@" not in email or len(password) < 8:
            return jsonify(error="Укажите имя, почту и пароль от 8 символов"), 400
        with factory() as db:
            if db.scalar(select(User).where(User.email == email)):
                return jsonify(error="Такая почта уже зарегистрирована"), 409
            user = User(name=name, email=email, password_hash=generate_password_hash(password))
            db.add(user)
            db.commit()
            session["user_id"] = user.id
            return jsonify(user=_user_json(user))

    @app.post("/api/python/auth/login")
    def login():
        payload = request.get_json(force=True) or {}
        email = str(payload.get("email") or "").strip().lower()
        password = str(payload.get("password") or "")
        with factory() as db:
            user = db.scalar(select(User).where(User.email == email))
            if user is None or not check_password_hash(user.password_hash, password):
                return jsonify(error="Неверная почта или пароль"), 401
            session["user_id"] = user.id
            return jsonify(user=_user_json(user))

    @app.post("/api/python/auth/logout")
    def logout():
        session.clear()
        return jsonify(ok=True)

    @app.post("/api/python/auth/password-reset/request")
    def reset_request():
        payload = request.get_json(force=True) or {}
        email = str(payload.get("email") or "").strip().lower()
        with factory() as db:
            user = db.scalar(select(User).where(User.email == email))
            body = {"ok": True, "message": "Если почта зарегистрирована, создан код сброса."}
            if user is None:
                return jsonify(body)
            token = secrets.token_urlsafe(18)
            db.add(ResetToken(user_id=user.id, token=token))
            db.commit()
            if os.environ.get("DFP_ENV", "development") == "development":
                body["dev_token"] = token
            return jsonify(body)

    @app.post("/api/python/auth/password-reset/confirm")
    def reset_confirm():
        payload = request.get_json(force=True) or {}
        token = str(payload.get("token") or "")
        password = str(payload.get("password") or "")
        if len(password) < 8:
            return jsonify(error="Пароль должен быть не короче 8 символов"), 400
        with factory() as db:
            row = db.scalar(select(ResetToken).where(ResetToken.token == token))
            if row is None:
                return jsonify(error="Код сброса не найден"), 400
            user = db.get(User, row.user_id)
            user.password_hash = generate_password_hash(password)
            db.delete(row)
            db.commit()
            return jsonify(ok=True)

    @app.get("/api/python/me")
    def me():
        with factory() as db:
            user = _current_user(db)
            return jsonify(user=_user_json(user) if user else None)

    @app.get("/api/python/progress")
    def progress():
        with factory() as db:
            user = _current_user(db)
            if user is None:
                return jsonify(error="Нужна регистрация"), 401
            return jsonify(**_progress_payload(db, user))

    @app.put("/api/python/progress/lesson/<lesson_id>")
    def put_lesson(lesson_id: str):
        lessons = lesson_map()
        if lesson_id not in lessons:
            return jsonify(error="Урок не найден"), 404
        payload = request.get_json(force=True) or {}
        status = payload.get("status")
        if status not in {"in_progress", "skipped", "completed"}:
            return jsonify(error="Неизвестный статус"), 400
        with factory() as db:
            user = _require_user(db)
            if isinstance(user, tuple):
                return user
            if not _prereqs_open(db, user.id, lessons[lesson_id]):
                return jsonify(error="Сначала завершите или пропустите предыдущие темы"), 403
            if status == "completed" and not _lesson_tasks_passed(db, user.id, lessons[lesson_id]):
                return jsonify(error="Сначала решите все задания урока"), 400
            row = _lesson_row(db, user.id, lesson_id)
            row.status = status
            if status == "completed":
                row.grade = _lesson_grade(db, user.id, lessons[lesson_id])
                row.completed_at = utcnow()
            elif status == "skipped":
                row.grade = None
                row.completed_at = None
            db.commit()
            return jsonify(**_progress_payload(db, user))

    @app.put("/api/python/task/<task_id>/draft")
    def put_draft(task_id: str):
        if task_id not in task_map():
            return jsonify(error="Задание не найдено"), 404
        payload = request.get_json(force=True) or {}
        code = str(payload.get("code") or "")[:20000]
        with factory() as db:
            user = _require_user(db)
            if isinstance(user, tuple):
                return user
            row = db.scalar(select(Draft).where(Draft.user_id == user.id, Draft.task_id == task_id))
            if row is None:
                row = Draft(user_id=user.id, task_id=task_id, code=code)
                db.add(row)
            else:
                row.code = code
                row.updated_at = utcnow()
            db.commit()
            return jsonify(ok=True)

    @app.post("/api/python/task/<task_id>/hint")
    def use_hint(task_id: str):
        if task_id not in task_map():
            return jsonify(error="Задание не найдено"), 404
        with factory() as db:
            user = _require_user(db)
            if isinstance(user, tuple):
                return user
            row = _task_row(db, user.id, task_id)
            if row.hints_used >= 3:
                return jsonify(error="Подсказки закончились"), 400
            row.hints_used += 1
            db.commit()
            return jsonify(hints_used=row.hints_used)

    @app.post("/api/python/task/<task_id>/solution")
    def reveal_solution(task_id: str):
        if task_id not in task_map():
            return jsonify(error="Задание не найдено"), 404
        with factory() as db:
            user = _require_user(db)
            if isinstance(user, tuple):
                return user
            row = _task_row(db, user.id, task_id)
            if row.attempt_count < 3 and not row.passed:
                return jsonify(error="Решение откроется после трёх неудачных попыток"), 403
            row.solution_seen = True
            db.commit()
            return jsonify(solution_seen=True)

    @app.post("/api/python/task/<task_id>/attempt")
    def attempt(task_id: str):
        found = task_map().get(task_id)
        if found is None:
            return jsonify(error="Задание не найдено"), 404
        lesson, task = found
        payload = request.get_json(force=True) or {}
        with factory() as db:
            user = _require_user(db)
            if isinstance(user, tuple):
                return user
            if not _prereqs_open(db, user.id, lesson):
                return jsonify(error="Задания этой темы пока закрыты"), 403
            progress = _task_row(db, user.id, task_id)
            progress.attempt_count += 1
            passed, tests_passed, tests_total = _grade_payload(task, payload)
            code = str(payload.get("code") or "")[:20000]
            if payload.get("event"):
                db.add(SecurityEvent(user_id=user.id, kind=str(payload["event"])[:40], detail=task_id))
            score = task_score(1 if passed else 0, progress.attempt_count, progress.hints_used, progress.solution_seen)
            if passed:
                progress.passed = True
                progress.best_score = max(progress.best_score, score)
            progress.last_code = code
            db.add(
                Attempt(
                    user_id=user.id,
                    task_id=task_id,
                    code=code,
                    passed=passed,
                    tests_passed=tests_passed,
                    tests_total=tests_total,
                    score=score if passed else 0,
                )
            )
            lesson_row = _lesson_row(db, user.id, lesson["id"])
            if lesson_row.status == "not_started":
                lesson_row.status = "in_progress"
            if _lesson_tasks_passed(db, user.id, lesson):
                lesson_row.status = "completed"
                lesson_row.grade = _lesson_grade(db, user.id, lesson)
                lesson_row.completed_at = utcnow()
            db.commit()
            return jsonify(passed=passed, score=score if passed else 0, attempt_count=progress.attempt_count, **_progress_payload(db, user))

    @app.post("/api/python/security-event")
    def security_event():
        payload = request.get_json(force=True) or {}
        kind = str(payload.get("kind") or "")[:40]
        if kind not in {"sandbox_timeout", "blocked_import", "worker_crash"}:
            return jsonify(error="Неизвестное событие"), 400
        with factory() as db:
            user = _current_user(db)
            db.add(SecurityEvent(user_id=user.id if user else None, kind=kind, detail=str(payload.get("detail") or "")[:240]))
            db.commit()
        return jsonify(ok=True)

    @app.post("/api/python/diagnostic")
    def diagnostic():
        with (CONTENT / "diagnostic.yaml").open(encoding="utf-8") as handle:
            spec = yaml.safe_load(handle)
        payload = request.get_json(force=True) or {}
        answers = payload.get("answers") or {}
        correct = 0
        misses = []
        for question in spec["questions"]:
            if answers.get(question["id"]) == question["answer"]:
                correct += 1
            else:
                misses.append(question["suggests"])
        suggested = misses[0] if misses else spec["questions"][-1]["suggests"]
        with factory() as db:
            user = _current_user(db)
            db.add(
                DiagnosticResult(
                    user_id=user.id if user else None,
                    correct=correct,
                    total=len(spec["questions"]),
                    suggested_lesson_id=suggested,
                )
            )
            db.commit()
        return jsonify(correct=correct, total=len(spec["questions"]), suggested_lesson_id=suggested)

    @app.get("/api/python/certificates")
    def certificates():
        with factory() as db:
            user = _require_user(db)
            if isinstance(user, tuple):
                return user
            return jsonify(certificates=_issue_ready(db, user))

    @app.get("/api/python/diploma")
    def diploma():
        with factory() as db:
            user = _require_user(db)
            if isinstance(user, tuple):
                return user
            certs = _issue_ready(db, user)
            published = [item for item in _course_sections() if item["status"] == "published"]
            ready = all(any(cert["section_id"] == section["id"] for cert in certs) for section in published)
            row = db.scalar(select(Diploma).where(Diploma.user_id == user.id))
            if ready and row is None:
                row = Diploma(user_id=user.id, diploma_number=f"DFP-{user.id:05d}")
                db.add(row)
                db.commit()
            return jsonify(
                ready=ready,
                diploma=_diploma_json(row) if row else None,
                gpa=_course_gpa(db, user.id),
                name=user.name,
            )

    return app


def _course_sections() -> list[dict]:
    with (CONTENT / "course.yaml").open(encoding="utf-8") as handle:
        return yaml.safe_load(handle)["sections"]


def _user_json(user: User) -> dict:
    return {"id": user.id, "name": user.name, "email": user.email}


def _current_user(db: Session) -> User | None:
    user_id = session.get("user_id")
    if not user_id:
        return None
    return db.get(User, user_id)


def _require_user(db: Session):
    user = _current_user(db)
    if user is None:
        return jsonify(error="Нужна регистрация"), 401
    return user


def _lesson_row(db: Session, user_id: int, lesson_id: str) -> LessonProgress:
    row = db.scalar(select(LessonProgress).where(LessonProgress.user_id == user_id, LessonProgress.lesson_id == lesson_id))
    if row is None:
        row = LessonProgress(user_id=user_id, lesson_id=lesson_id, status="in_progress")
        db.add(row)
        db.flush()
    return row


def _task_row(db: Session, user_id: int, task_id: str) -> TaskProgress:
    row = db.scalar(select(TaskProgress).where(TaskProgress.user_id == user_id, TaskProgress.task_id == task_id))
    if row is None:
        row = TaskProgress(user_id=user_id, task_id=task_id)
        db.add(row)
        db.flush()
    return row


def _prereqs_open(db: Session, user_id: int, lesson: dict) -> bool:
    rows = {
        row.lesson_id: row.status
        for row in db.scalars(select(LessonProgress).where(LessonProgress.user_id == user_id))
    }
    return all(rows.get(req) in {"completed", "skipped"} for req in lesson.get("prerequisites") or [])


def _lesson_tasks_passed(db: Session, user_id: int, lesson: dict) -> bool:
    needed = {task["id"] for task in lesson["tasks"]}
    passed = {
        row.task_id
        for row in db.scalars(select(TaskProgress).where(TaskProgress.user_id == user_id, TaskProgress.passed.is_(True)))
    }
    return needed <= passed


def _lesson_grade(db: Session, user_id: int, lesson: dict) -> float | None:
    items = []
    for task in lesson["tasks"]:
        row = db.scalar(select(TaskProgress).where(TaskProgress.user_id == user_id, TaskProgress.task_id == task["id"]))
        if row and row.passed:
            items.append((row.best_score, float(task["difficulty"])))
    return weighted_average(items)


def _course_gpa(db: Session, user_id: int) -> float | None:
    lessons = {lesson["id"]: lesson for lesson in load_lessons()}
    items = []
    for row in db.scalars(select(LessonProgress).where(LessonProgress.user_id == user_id, LessonProgress.status == "completed")):
        lesson = lessons.get(row.lesson_id)
        if lesson and row.grade is not None:
            items.append((row.grade, float(lesson["weight"])))
    return weighted_average(items)


def _progress_payload(db: Session, user: User) -> dict:
    lessons = [
        {
            "lesson_id": row.lesson_id,
            "status": row.status,
            "grade": row.grade,
        }
        for row in db.scalars(select(LessonProgress).where(LessonProgress.user_id == user.id))
    ]
    tasks = [
        {
            "task_id": row.task_id,
            "best_score": row.best_score,
            "attempt_count": row.attempt_count,
            "hints_used": row.hints_used,
            "solution_seen": row.solution_seen,
            "passed": row.passed,
            "last_code": row.last_code,
        }
        for row in db.scalars(select(TaskProgress).where(TaskProgress.user_id == user.id))
    ]
    drafts = [
        {"task_id": row.task_id, "code": row.code}
        for row in db.scalars(select(Draft).where(Draft.user_id == user.id))
    ]
    return {"lessons": lessons, "tasks": tasks, "drafts": drafts, "gpa": _course_gpa(db, user.id)}


def _grade_payload(task: dict, payload: dict) -> tuple[bool, int, int]:
    if task["type"] in {"choice", "predict_output"}:
        answer = payload.get("answer")
        passed = answer == task["answer"]
        return passed, int(passed), 1
    results = payload.get("results") or []
    if not isinstance(results, list) or len(results) != len(task.get("tests") or []):
        return False, 0, len(task.get("tests") or [])
    passed_count = sum(1 for item in results if item.get("passed") is True)
    total = len(results)
    return passed_count == total and total > 0, passed_count, total


def _issue_ready(db: Session, user: User) -> list[dict]:
    issued = []
    published_sections = [item for item in _course_sections() if item["status"] == "published"]
    lessons = load_lessons()
    for section in published_sections:
        section_lessons = [lesson for lesson in lessons if lesson["section"] == section["id"]]
        rows = {
            row.lesson_id: row
            for row in db.scalars(select(LessonProgress).where(LessonProgress.user_id == user.id))
        }
        if section_lessons and all(rows.get(lesson["id"]) and rows[lesson["id"]].status == "completed" for lesson in section_lessons):
            cert = db.scalar(select(Certificate).where(Certificate.user_id == user.id, Certificate.section_id == section["id"]))
            if cert is None:
                cert = Certificate(user_id=user.id, section_id=section["id"], certificate_number=f"DFS-{section['id'][:3].upper()}-{user.id:05d}")
                db.add(cert)
                db.commit()
            issued.append({"section_id": cert.section_id, "number": cert.certificate_number, "issued_at": cert.issued_at.isoformat()})
    return issued


def _diploma_json(row: Diploma) -> dict:
    return {"number": row.diploma_number, "issued_at": row.issued_at.isoformat()}


app = create_app()
