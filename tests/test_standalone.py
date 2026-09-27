"""Verify the extracted backend without sibling projects or live API calls."""

import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from dsa_tester import db, llm, question_gen, server


@pytest.mark.parametrize("response", [
    '{"score": 0.8}',
    '```json\n{"score": 0.8}\n```',
    'Here is the result: {"score": 0.8} Done.',
])
def test_extract_json_returns_parsed_object(response):
    assert llm.extract_json(response) == {"score": 0.8}


def test_extract_json_rejects_invalid_response():
    with pytest.raises(ValueError, match="valid JSON object"):
        llm.extract_json("No JSON here")


def test_client_loads_local_environment_and_is_cached(monkeypatch):
    load = Mock()
    factory = Mock()
    monkeypatch.setattr(llm, "load_dotenv", load)
    monkeypatch.setattr(llm, "OpenAI", factory)
    llm.get_openai_client.cache_clear()
    try:
        assert llm.get_openai_client() is llm.get_openai_client()
        factory.assert_called_once_with()
        load.assert_called_once_with(llm.Path(llm.__file__).parent / ".env")
    finally:
        llm.get_openai_client.cache_clear()


def test_question_generation_and_evaluation_use_local_json_parser(monkeypatch):
    client = Mock()
    client.chat.completions.create.side_effect = [
        SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(
            content='```json\n{"id": "echo", "title": "Echo"}\n```',
        ))]),
        SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(
            content='{"score": 0.9}',
        ))]),
    ]
    monkeypatch.setattr(question_gen, "get_openai_client", lambda: client)
    question = question_gen.generate_question("arrays", "easy", 800)
    assert question["id"] == "echo"
    assert question["hidden_test_cases"] == []
    assert question_gen.evaluate_explanation(question, "code", "explanation", 1) == 0.9


def test_api_generates_runs_and_persists_session_without_external_projects(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "dsa.db")
    monkeypatch.setattr(server, "_question_cache", {})
    monkeypatch.setattr(server, "generate_question", lambda *args: {
        "id": "echo", "title": "Echo", "difficulty": "easy",
        "test_cases": [{"input": {"value": 2}, "expected": 2}],
        "hidden_test_cases": [{"input": {"value": -1}, "expected": -1}],
        "time_limit_seconds": 5,
    })
    monkeypatch.setattr(server, "evaluate_explanation", lambda *args: 1.0)

    with TestClient(server.app) as client:
        assert client.get("/api/status").json()["elo"] == 800
        response = client.get("/api/question?topic=arrays")
        assert response.status_code == 200
        question = response.json()
        assert "hidden_test_cases" not in question
        server._question_cache.clear()  # Reload the persisted question after a restart.
        response = client.post("/api/submit", json={
            "session_id": question["session_id"], "language": "python",
            "code": "def solution(value):\n    return value",
            "explanation": "Return the value", "elapsed_seconds": 1,
        })
        assert response.status_code == 200
        events = [json.loads(line.removeprefix("data: "))
                  for line in response.text.splitlines() if line.startswith("data: ")]
        cases = [event for event in events if event["event"] == "case_result"]
        assert len(cases) == 2
        assert all(case["passed"] for case in cases)
        assert events[-1]["event"] == "complete"
        assert events[-1]["pass_rate"] == 1
        assert client.get("/api/status").json()["elo"] > 800
        assert len(client.get("/api/history").json()["sessions"]) == 1
