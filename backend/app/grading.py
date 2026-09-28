"""Оценка 0.0–4.0. Сложность задания — вес, а не множитель балла."""

from __future__ import annotations

ATTEMPT_STEP = 0.025
ATTEMPT_FLOOR = 0.70
HINT_PENALTY = 0.03
HINT_FLOOR = 0.85
SOLUTION_FACTOR = 0.95


def attempt_factor(attempt_number: int) -> float:
    if attempt_number < 1:
        raise ValueError("attempt_number starts at 1")
    return max(ATTEMPT_FLOOR, 1.0 - ATTEMPT_STEP * (attempt_number - 1))


def hint_factor(hints_used: int) -> float:
    return max(HINT_FLOOR, 1.0 - HINT_PENALTY * max(0, hints_used))


def solution_factor(solution_seen: bool) -> float:
    return SOLUTION_FACTOR if solution_seen else 1.0


def task_score(correctness: float, attempt_number: int, hints_used: int, solution_seen: bool) -> float:
    bounded = min(1.0, max(0.0, correctness))
    raw = 4.0 * bounded * attempt_factor(attempt_number) * hint_factor(hints_used) * solution_factor(solution_seen)
    return round(raw, 2)


def weighted_average(items: list[tuple[float, float]]) -> float | None:
    weight = sum(item[1] for item in items)
    if weight <= 0 or not items:
        return None
    total = sum(score * item_weight for score, item_weight in items)
    return round(total / weight, 2)
