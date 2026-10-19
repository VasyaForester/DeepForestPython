import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("task_checks", ROOT / "frontend" / "public" / "task_checks.py")
checks = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(checks)


def test_exact_rejects_extra_output():
    assert checks.compare_stdout("15\n", "15\n", "exact")
    assert not checks.compare_stdout("15\nещё\n", "15\n", "exact")


def test_set_ignores_order_only():
    assert checks.compare_stdout("б\nа\n", "а\nб\n", "set")
    assert not checks.compare_stdout("а\n", "а\nб\n", "set")


def test_comment_is_required_and_a_string_does_not_count():
    rule = [{"kind": "comment", "contains": "год отчёта"}]
    assert checks.structure_error("print(2026)\n", rule)
    assert checks.structure_error('print("# год отчёта")\n', rule)
    assert checks.structure_error("print(2026)\n# год отчёта\n", rule) == ""
    assert checks.structure_error("print(2026)\n#год отчёта\n", rule) == ""


def test_reassignment_is_not_the_same_as_printing_the_answer():
    rule = [{"kind": "assign", "name": "total", "min": 2}, {"kind": "state", "name": "total", "equals": 15}]
    assert checks.requirement_error("print(15)\n", rule)
    assert checks.requirement_error("total = 15\nprint(total)\n", rule)
    assert checks.requirement_error("total = 10\ntotal = 16\nprint(15)\n", rule)
    assert checks.requirement_error("total = 10\ntotal = 15.0\nprint(total)\n", rule)
    assert checks.requirement_error("total = 10\ntotal = total + 5\nprint(total)\n", rule) == ""
    assert checks.requirement_error("total = 10\ntotal += 5\nprint(total)\n", rule) == ""


def test_floor_division_output_is_not_truncation_toward_zero():
    assert not checks.compare_stdout("-3\n", "-4\n", "exact")
