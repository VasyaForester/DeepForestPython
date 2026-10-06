"""Собирает content/*.yaml в frontend/src/content/manifest.json."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
OUT = ROOT / "frontend" / "src" / "content" / "manifest.json"


def load_yaml(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"{path} должен быть объектом YAML")
    return data


def build_manifest() -> dict:
    course = load_yaml(CONTENT / "course.yaml")
    section_order = {section["id"]: section["order"] for section in course["sections"]}
    lessons = []
    for path in sorted((CONTENT / "lessons").glob("*.yaml")):
        lesson = load_yaml(path)
        lesson["source"] = path.name
        lessons.append(lesson)
    lessons.sort(key=lambda item: (section_order[item["section"]], item["order"]))
    diagnostic = load_yaml(CONTENT / "diagnostic.yaml")
    references = []
    seen = set()
    for lesson in lessons:
        for item in lesson.get("introduces") or []:
            if item["id"] in seen:
                continue
            seen.add(item["id"])
            references.append({**item, "lesson_id": lesson["id"], "lesson_slug": lesson["slug"], "lesson_title": lesson["title"]})
    search = []
    for lesson in lessons:
        blob = " ".join(lesson.get("theory") or [])
        search.append(
            {
                "lesson_id": lesson["id"],
                "slug": lesson["slug"],
                "title": lesson["title"],
                "section": lesson["section"],
                "tags": lesson.get("tags") or [],
                "snippet": " ".join(blob.split())[:220],
            }
        )
    return {"course": course, "lessons": lessons, "diagnostic": diagnostic, "references": references, "search": search}


def dump_manifest(manifest: dict) -> str:
    return json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"


def main() -> None:
    text = dump_manifest(build_manifest())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {OUT} lessons={len(json.loads(text)['lessons'])}")


if __name__ == "__main__":
    sys.exit(main())
