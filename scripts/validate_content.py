"""Проверяет уроки и прогоняет решения задач системным Python."""

from __future__ import annotations

import subprocess
import sys
import textwrap
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
REQUIRED_LESSON = ["id", "slug", "section", "title", "order", "weight", "prerequisites", "goal", "theory", "examples", "outcomes", "resources", "tasks"]
REQUIRED_TASK = ["id", "type", "title", "difficulty", "prompt", "hints", "solution", "explanation"]


def load(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return yaml.safe_load(handle)


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
    ids = {lesson["id"] for lesson in lessons}
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
            if req not in ids:
                errors.append(f"{lesson['id']} missing prerequisite {req}")
            else:
                current = next(item for item in lessons if item["id"] == req)
                if current["order"] >= lesson["order"] and current["section"] == lesson["section"]:
                    errors.append(f"{lesson['id']} prerequisite {req} is not earlier")
        for example in lesson.get("examples") or []:
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
            if task["type"] == "code":
                for test in task.get("tests") or []:
                    try:
                        actual = run_code(textwrap.dedent(task["solution"]), test.get("stdin") or "")
                    except Exception as exc:  # noqa: BLE001
                        errors.append(f"{task['id']} solution failed: {exc}")
                        continue
                    if actual != test["expected_stdout"]:
                        errors.append(f"{task['id']} stdout {actual!r} != {test['expected_stdout']!r}")
            elif task["type"] in {"choice", "predict_output"} and task.get("solution") != task.get("answer"):
                errors.append(f"{task['id']} solution/answer mismatch")
    if errors:
        print("\n".join(errors))
        return 1
    print(f"content ok, lessons={len(lessons)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
