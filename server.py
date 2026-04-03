"""FastAPI server for DSA Tester."""

import asyncio
import json
import logging
import random
from collections.abc import AsyncGenerator

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

import desilvaware.dsa_tester.db as db
from desilvaware.dsa_tester.elo import (
    composite_score,
    question_elo_for_difficulty,
    select_difficulty,
    update_elo,
)
from desilvaware.dsa_tester.models import (
    HistoryResponse,
    HistorySession,
    StatusResponse,
    SubmitRequest,
)
from desilvaware.dsa_tester.question_gen import (
    TOPICS,
    evaluate_explanation,
    generate_question,
)
from desilvaware.dsa_tester.runner import run_code

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="DSA Tester API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory session store: session_id -> question dict
_question_cache: dict[int, dict] = {}


@app.get("/api/status", response_model=StatusResponse)
async def get_status() -> StatusResponse:
    user = await db.get_or_create_user()
    today_count = await db.sessions_today(user["id"])
    return StatusResponse(status="ok", elo=user["elo"], sessions_today=today_count)


@app.get("/api/question")
async def get_question(topic: str = Query(default="random")) -> dict:
    user = await db.get_or_create_user()
    difficulty = select_difficulty(user["elo"])
    q_elo = question_elo_for_difficulty(difficulty)

    if topic == "random":
        topic = random.choice(TOPICS)

    question = await asyncio.to_thread(generate_question, topic, difficulty, q_elo)
    question["question_elo"] = q_elo

    # Create a session record
    session_id = await db.create_session(
        user_id=user["id"],
        question_id=question.get("id", "unknown"),
        topic=topic,
        difficulty=difficulty,
        question_elo=q_elo,
        language="python",
    )
    question["session_id"] = session_id

    # Cache question (with hidden test cases) for submission
    _question_cache[session_id] = question

    # Return question without hidden test cases
    public_question = {k: v for k, v in question.items() if k != "hidden_test_cases"}
    return public_question


async def _submit_stream(req: SubmitRequest) -> AsyncGenerator[str, None]:
    """SSE generator for submit endpoint."""

    def sse(data: dict) -> str:
        return f"data: {json.dumps(data)}\n\n"

    question = _question_cache.get(req.session_id)
    if question is None:
        yield sse({"event": "error", "message": "Session not found"})
        return

    all_test_cases = question.get("test_cases", []) + question.get("hidden_test_cases", [])
    time_limit = question.get("time_limit_seconds", 5)
    total = len(all_test_cases)

    yield sse({"event": "running", "case": 0, "total": total})

    # Run code in thread
    results = await asyncio.to_thread(
        run_code, req.language, req.code, all_test_cases, time_limit
    )

    passed_count = 0
    for result in results:
        if result.passed:
            passed_count += 1
        event_data: dict = {
            "event": "case_result",
            "case": result.case_number,
            "passed": result.passed,
            "elapsed_ms": result.elapsed_ms,
        }
        if result.error:
            event_data["error"] = result.error
        yield sse(event_data)

    pass_rate = passed_count / total if total > 0 else 0.0

    yield sse({"event": "evaluating_explanation"})

    # Evaluate explanation
    explanation_score = await asyncio.to_thread(
        evaluate_explanation, question, req.code, req.explanation, pass_rate
    )

    # Speed bonus: check if solved within expected time
    expected_time = time_limit * len(all_test_cases) * 10  # rough heuristic
    speed_bonus = 1.0 if req.elapsed_seconds <= expected_time else 0.0

    score = composite_score(pass_rate, explanation_score, speed_bonus)

    user = await db.get_or_create_user()
    elo_before = user["elo"]
    q_elo = question.get("question_elo", 1200.0)
    difficulty = question.get("difficulty", "medium")
    new_elo, delta = update_elo(elo_before, q_elo, score, difficulty)

    # Persist results
    await db.complete_session(
        session_id=req.session_id,
        code=req.code,
        explanation=req.explanation,
        pass_rate=pass_rate,
        explanation_score=explanation_score,
        speed_bonus=speed_bonus,
        final_score=score,
        elo_before=elo_before,
        elo_after=new_elo,
        elapsed_seconds=req.elapsed_seconds,
    )
    await db.update_user_elo(user["id"], new_elo)

    yield sse({
        "event": "complete",
        "pass_rate": pass_rate,
        "explanation_score": explanation_score,
        "elo_before": round(elo_before),
        "elo_after": round(new_elo),
        "delta": round(delta),
    })


@app.post("/api/submit")
async def submit(req: SubmitRequest) -> StreamingResponse:
    return StreamingResponse(
        _submit_stream(req),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/history", response_model=HistoryResponse)
async def get_history() -> HistoryResponse:
    user = await db.get_or_create_user()
    rows = await db.get_history(user["id"])
    sessions = [
        HistorySession(
            date=r["date"],
            topic=r["topic"],
            difficulty=r["difficulty"],
            elo_after=r["elo_after"],
            delta=r["delta"],
        )
        for r in rows
    ]
    return HistoryResponse(sessions=sessions)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("desilvaware.dsa_tester.server:app", host="127.0.0.1", port=8001, reload=True)
