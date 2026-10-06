"""Проверяет уроки и прогоняет решения задач системным Python.

Ученик выполняет код в Pyodide, не в этом интерпретаторе. Пока вызовы
ограничены общим набором builtins и методами объектов.
Новый builtin или импорт валидатор не пропускает, пока его не проверят
тем же рантаймом, что и в браузере. Методы вроде str.split и list.append
разрешены: это операции над уже полученным значением.
"""

from __future__ import annotations

import ast
import re
import subprocess
import sys
import textwrap
from pathlib import Path

import yaml

from build_course_manifest import OUT, build_manifest, dump_manifest

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
REQUIRED_LESSON = ["id", "slug", "section", "title", "order", "weight", "prerequisites", "goal", "theory", "examples", "outcomes", "resources", "tasks"]
REQUIRED_TASK = ["id", "type", "title", "difficulty", "prompt", "hints", "solution", "explanation"]
STUDENT_RUNTIME = "Pyodide 0.27.7"
SHARED_CALLS = {
    "print",
    "input",
    "int",
    "float",
    "str",
    "bool",
    "type",
    "round",
    "abs",
    "range",
    "len",
    "list",
    "tuple",
    "set",
    "dict",
    "sorted",
    "min",
    "max",
    "sum",
    "enumerate",
    "zip",
    "reversed",
}


def shared_with_student_runtime(code: str, label: str, errors: list[str]) -> None:
    try:
        tree = ast.parse(textwrap.dedent(code))
    except SyntaxError as exc:
        errors.append(f"{label} syntax: {exc}")
        return
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            errors.append(f"{label}: импорт вне общего набора с {STUDENT_RUNTIME}")
        elif isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name) and func.id in SHARED_CALLS:
                continue
            if isinstance(func, ast.Attribute):
                continue
            name = func.id if isinstance(func, ast.Name) else "вызов"
            errors.append(f"{label}: {name} вне общего набора с {STUDENT_RUNTIME}")


def load(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def flag_unquoted_hashes(path: Path, errors: list[str]) -> None:
    """Пробел и # в обычной строке YAML начинают комментарий и обрезают текст."""
    literal_floor: int | None = None
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        indent = len(line) - len(line.lstrip(" "))
        if literal_floor is not None:
            if not line.strip() or indent > literal_floor:
                continue
            literal_floor = None
        if not line.strip():
            continue
        if re.search(r"[>|]\s*(?:#.*)?$", line.rstrip()):
            literal_floor = indent
            continue
        visible = re.sub(r'"(?:\\.|[^"\\])*"', '""', line)
        visible = re.sub(r"'(?:[^']|'')*'", "''", visible)
        if re.search(r"(^|\s)#", visible):
            errors.append(f"{path.name}:{number} символ # вне кавычек обрежет значение")


def check_choice(task: dict, errors: list[str]) -> None:
    options = task.get("options")
    if not isinstance(options, list) or len(options) < 2:
        errors.append(f"{task.get('id')} needs at least 2 options")
        return
    ids: list[str] = []
    for option in options:
        if not isinstance(option, dict) or not option.get("id") or not str(option.get("text", "")).strip():
            errors.append(f"{task.get('id')} option needs id and text")
            continue
        ids.append(str(option["id"]))
        label = str(option["text"]).strip()
        if ids.count(str(option["id"])) > 1:
            errors.append(f"{task.get('id')} duplicate option id {option['id']}")
    if len({str(option.get("text", "")).strip() for option in options if isinstance(option, dict)}) != len(options):
        errors.append(f"{task.get('id')}: одинаковые варианты ответа")
    if task.get("answer") not in ids:
        errors.append(f"{task.get('id')} answer {task.get('answer')!r} is not an option")
    if task.get("solution") != task.get("answer"):
        errors.append(f"{task.get('id')} solution/answer mismatch")


def run_code(code: str, stdin: str) -> str:
    completed = subprocess.run(
        [sys.executable, "-I", "-c", code],
        input=stdin,
        text=True,
        capture_output=True,
        timeout=5,
        check=False,
    )
    if completed.returncode != 0:
        raise AssertionError(completed.stderr or completed.stdout)
    return completed.stdout


def main() -> int:
    errors: list[str] = []
    course = load(CONTENT / "course.yaml")
    section_ids = {item["id"] for item in course["sections"]}
    lessons = [load(path) for path in sorted((CONTENT / "lessons").glob("*.yaml"))]
    for path in sorted(CONTENT.rglob("*.yaml")):
        flag_unquoted_hashes(path, errors)
    ids = [lesson["id"] for lesson in lessons]
    if len(set(ids)) != len(ids):
        errors.append("duplicate lesson id")
    slugs = [lesson.get("slug") for lesson in lessons]
    if len(set(slugs)) != len(slugs):
        errors.append("duplicate lesson slug")
    task_ids: list[str] = []
    by_section: dict[str, list[dict]] = {}
    id_set = set(ids)
    section_orders = [section.get("order") for section in course["sections"]]
    if sorted(section_orders) != list(range(1, len(section_orders) + 1)):
        errors.append("section order must be 1..N without gaps")
    for section in course["sections"]:
        by_section[section["id"]] = []
    for lesson in lessons:
        by_section.setdefault(lesson.get("section"), []).append(lesson)
    for section in course["sections"]:
        group = by_section[section["id"]]
        orders = [item.get("order") for item in group]
        if section["status"] == "published":
            if len(group) != section["planned_lessons"]:
                errors.append(f"{section['id']} published count {len(group)} != planned_lessons {section['planned_lessons']}")
            if sorted(orders) != list(range(1, len(group) + 1)):
                errors.append(f"{section['id']} lesson order must be 1..N")
        elif group:
            errors.append(f"{section['id']} is {section['status']} but has {len(group)} lessons")
    for lesson in lessons:
        for key in REQUIRED_LESSON:
            if key not in lesson:
                errors.append(f"{lesson.get('id')} missing {key}")
        if lesson.get("section") not in section_ids:
            errors.append(f"{lesson['id']} unknown section")
        if not (2 <= len(lesson.get("theory") or []) <= 4):
            errors.append(f"{lesson['id']} theory must be 2-4 paragraphs")
        if not (4 <= len(lesson.get("tasks") or []) <= 10):
            errors.append(f"{lesson['id']} needs 4-10 tasks")
        for req in lesson.get("prerequisites") or []:
            if req not in id_set:
                errors.append(f"{lesson['id']} missing prerequisite {req}")
            else:
                current = next(item for item in lessons if item["id"] == req)
                if current["order"] >= lesson["order"] and current["section"] == lesson["section"]:
                    errors.append(f"{lesson['id']} prerequisite {req} is not earlier")
        for example in lesson.get("examples") or []:
            shared_with_student_runtime(example["code"], f"{lesson['id']} example", errors)
            try:
                run_code(example["code"], example.get("stdin") or "")
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{lesson['id']} example failed: {exc}")
        for task in lesson["tasks"]:
            for key in REQUIRED_TASK:
                if key not in task:
                    errors.append(f"{task.get('id')} missing {key}")
            if not (1 <= len(task.get("hints") or []) <= 3):
                errors.append(f"{task.get('id')} needs 1-3 hints")
            task_ids.append(task.get("id"))
            if task["type"] == "code":
                tests = task.get("tests") or []
                if not tests:
                    errors.append(f"{task.get('id')} needs tests")
                for test in tests:
                    if "expected_stdout" not in test:
                        errors.append(f"{task.get('id')} test missing expected_stdout")
                shared_with_student_runtime(task["solution"], task["id"], errors)
                for test in tests:
                    try:
                        actual = run_code(textwrap.dedent(task["solution"]), test.get("stdin") or "")
                    except Exception as exc:  # noqa: BLE001
                        errors.append(f"{task['id']} solution failed: {exc}")
                        continue
                    if actual != test["expected_stdout"]:
                        errors.append(f"{task['id']} stdout {actual!r} != {test['expected_stdout']!r}")
            elif task["type"] in {"choice", "predict_output"}:
                check_choice(task, errors)
            else:
                errors.append(f"{task.get('id')} unknown type {task.get('type')}")
    if len(set(task_ids)) != len(task_ids):
        errors.append("duplicate task id")
    diagnostic = load(CONTENT / "diagnostic.yaml")
    for question in diagnostic.get("questions") or []:
        options = question.get("options") or []
        seen = []
        for option in options:
            label = str(option).strip()
            if label in seen:
                errors.append(f"{question.get('id')}: одинаковые варианты ответа ({label})")
            seen.append(label)
        if not isinstance(question.get("answer"), int) or not 0 <= question["answer"] < len(options):
            errors.append(f"{question.get('id')} answer is outside options")
        if question.get("suggests") not in id_set:
            errors.append(f"{question.get('id')} suggests unknown lesson")
    if OUT.is_file():
        actual = OUT.read_text(encoding="utf-8").replace("\r\n", "\n")
        expected = dump_manifest(build_manifest())
        if actual != expected:
            errors.append("manifest.json устарел относительно YAML: запустите python scripts/build_course_manifest.py")
    else:
        errors.append("manifest.json отсутствует: запустите python scripts/build_course_manifest.py")
    if errors:
        print("\n".join(errors))
        return 1
    print(f"content ok, lessons={len(lessons)}, cpython={sys.version.split()[0]}, student={STUDENT_RUNTIME}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
