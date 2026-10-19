"""Общие проверки заданий для валидатора и браузерного Python.

exact сравнивает весь вывод. set сравнивает непустые строки без учёта порядка.
requires отдельно проверяет учебную цель: комментарий, число присваиваний
или значение имени после выполнения.
"""

from __future__ import annotations

import ast
import io
import sys
import tokenize


def compare_stdout(actual: str, expected: str, mode: str | None = "exact") -> bool:
    if mode in (None, "", "exact"):
        return actual == expected
    if mode == "set":
        return _lines(actual) == _lines(expected)
    raise ValueError(f"unknown compare mode {mode}")


def requirement_error(code: str, requires: list | None, stdin: str = "") -> str:
    note = structure_error(code, requires)
    if note or not requires:
        return note
    states = [rule for rule in requires if isinstance(rule, dict) and rule.get("kind") == "state"]
    if not states:
        return ""
    try:
        namespace = _run_namespace(code, stdin)
    except SyntaxError as exc:
        return f"Синтаксическая ошибка: {exc.msg}"
    except Exception as exc:  # noqa: BLE001
        return f"Код не выполнился: {exc}"
    for rule in states:
        name = str(rule.get("name") or "")
        if name not in namespace:
            return f"После выполнения нет имени {name}."
        actual = namespace[name]
        if "equals" in rule and not _same(actual, rule["equals"]):
            return f"После выполнения {name} равно {actual!r}, ожидалось {rule['equals']!r}."
    return ""


def structure_error(code: str, requires: list | None) -> str:
    if not requires:
        return ""
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        return f"Синтаксическая ошибка: {exc.msg}"
    comments = _comments(code)
    for rule in requires:
        if not isinstance(rule, dict):
            return "Требование к коду записано неверно."
        kind = rule.get("kind")
        if kind == "state":
            continue
        if kind == "comment":
            needle = str(rule.get("contains") or "").strip()
            if not needle or not any(needle in item for item in comments):
                return f"В коде нужен комментарий с текстом «{needle}»."
        elif kind == "assign":
            name = str(rule.get("name") or "")
            minimum = int(rule.get("min", 1))
            found = _assign_count(tree, name)
            if found < minimum:
                return f"Имя {name} нужно присвоить не меньше {minimum} раз, сейчас {found}."
        else:
            return f"Неизвестное требование {kind}."
    return ""


def _run_namespace(code: str, stdin: str) -> dict:
    namespace: dict = {"__name__": "__main__"}
    saved_in, saved_out = sys.stdin, sys.stdout
    sys.stdin = io.StringIO(stdin)
    sys.stdout = io.StringIO()
    try:
        exec(compile(code, "main.py", "exec"), namespace, namespace)
    finally:
        sys.stdin = saved_in
        sys.stdout = saved_out
    return namespace


def _same(actual: object, expected: object) -> bool:
    return type(actual) is type(expected) and actual == expected


def _lines(text: str) -> set[str]:
    return {line.strip() for line in text.splitlines() if line.strip()}


def _comments(code: str) -> list[str]:
    found: list[str] = []
    try:
        tokens = tokenize.generate_tokens(io.StringIO(code).readline)
        for token in tokens:
            if token.type == tokenize.COMMENT:
                found.append(token.string.lstrip("#").strip())
    except tokenize.TokenError:
        return found
    return found


def _assign_count(tree: ast.AST, name: str) -> int:
    count = 0
    for node in ast.walk(tree):
        targets: list[ast.AST] = []
        if isinstance(node, ast.Assign):
            targets = list(node.targets)
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            targets = [node.target]
        elif isinstance(node, ast.AugAssign):
            targets = [node.target]
        for target in targets:
            if isinstance(target, ast.Name) and target.id == name:
                count += 1
    return count
