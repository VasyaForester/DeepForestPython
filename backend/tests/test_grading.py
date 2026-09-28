from app.grading import attempt_factor, hint_factor, task_score, weighted_average


def test_attempt_decay_has_floor():
    assert attempt_factor(1) == 1
    assert attempt_factor(2) == 0.975
    assert attempt_factor(30) == 0.7


def test_hints_and_solution_reduce_score():
    perfect = task_score(1, 1, 0, False)
    hinted = task_score(1, 1, 1, False)
    revealed = task_score(1, 1, 0, True)
    assert perfect == 4
    assert hinted < perfect
    assert revealed == 3.8


def test_skipped_lessons_are_excluded_by_caller():
    assert weighted_average([(4, 1), (2, 1)]) == 3
    assert weighted_average([]) is None
