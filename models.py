"""Pydantic models for DSA Tester API."""

from pydantic import BaseModel


class SubmitRequest(BaseModel):
    session_id: int
    language: str  # 'python' | 'java' | 'go'
    code: str
    explanation: str
    elapsed_seconds: int = 0


class TestResult(BaseModel):
    case_number: int
    passed: bool
    elapsed_ms: int
    error: str | None = None


class StatusResponse(BaseModel):
    status: str
    elo: float
    sessions_today: int


class HistorySession(BaseModel):
    date: str
    topic: str
    difficulty: str
    elo_after: float | None
    delta: float | None


class HistoryResponse(BaseModel):
    sessions: list[HistorySession]
