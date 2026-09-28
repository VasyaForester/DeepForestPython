from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import create_app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DFP_DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setenv("DFP_SECRET", "test-secret")
    monkeypatch.chdir(tmp_path)
    application = create_app()
    application.config["TESTING"] = True
    return application.test_client()


def register(client, email="a@example.com"):
    return client.post("/api/python/auth/register", json={"name": "Аня", "email": email, "password": "secret123"})


def test_skip_unlocks_next_and_is_excluded_from_gpa(client):
    register(client)
    skipped = client.put("/api/python/progress/lesson/python.basics.first-program", json={"status": "skipped"})
    assert skipped.status_code == 200
    assert skipped.json["gpa"] is None
    closed = client.post("/api/python/task/python.basics.variables.t1/attempt", json={"answer": "b"})
    assert closed.status_code == 200
    assert closed.json["passed"] is True


def test_complete_requires_tasks(client):
    register(client)
    response = client.put("/api/python/progress/lesson/python.basics.first-program", json={"status": "completed"})
    assert response.status_code == 400
