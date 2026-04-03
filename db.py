"""SQLite database layer for DSA Tester."""

import asyncio
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "dsa.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL DEFAULT 'default',
    elo        REAL    NOT NULL DEFAULT 800.0,
    created_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id                 INTEGER PRIMARY KEY,
    user_id            INTEGER REFERENCES users(id),
    question_id        TEXT    NOT NULL,
    topic              TEXT    NOT NULL,
    difficulty         TEXT    NOT NULL,
    question_elo       REAL    NOT NULL,
    language           TEXT    NOT NULL,
    code               TEXT,
    explanation        TEXT,
    pass_rate          REAL,
    explanation_score  REAL,
    speed_bonus        REAL,
    final_score        REAL,
    elo_before         REAL,
    elo_after          REAL,
    elapsed_seconds    INTEGER,
    started_at         TEXT    NOT NULL,
    completed_at       TEXT
);
"""


def _init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(_SCHEMA)
    conn.commit()


def _get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    _init_db(conn)
    return conn


# --- synchronous helpers (called via asyncio.to_thread) ---

def _get_or_create_user(name: str = "default") -> dict:
    conn = _get_conn()
    try:
        row = conn.execute("SELECT * FROM users WHERE name = ?", (name,)).fetchone()
        if row is None:
            now = datetime.now(timezone.utc).isoformat()
            cur = conn.execute(
                "INSERT INTO users (name, elo, created_at) VALUES (?, 800.0, ?)",
                (name, now),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)
    finally:
        conn.close()


def _update_user_elo(user_id: int, new_elo: float) -> None:
    conn = _get_conn()
    try:
        conn.execute("UPDATE users SET elo = ? WHERE id = ?", (new_elo, user_id))
        conn.commit()
    finally:
        conn.close()


def _create_session(
    user_id: int,
    question_id: str,
    topic: str,
    difficulty: str,
    question_elo: float,
    language: str,
) -> int:
    conn = _get_conn()
    try:
        now = datetime.now(timezone.utc).isoformat()
        cur = conn.execute(
            """INSERT INTO sessions
               (user_id, question_id, topic, difficulty, question_elo, language, started_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (user_id, question_id, topic, difficulty, question_elo, language, now),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def _complete_session(
    session_id: int,
    code: str,
    explanation: str,
    pass_rate: float,
    explanation_score: float,
    speed_bonus: float,
    final_score: float,
    elo_before: float,
    elo_after: float,
    elapsed_seconds: int,
) -> None:
    conn = _get_conn()
    try:
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            """UPDATE sessions SET
               code=?, explanation=?, pass_rate=?, explanation_score=?,
               speed_bonus=?, final_score=?, elo_before=?, elo_after=?,
               elapsed_seconds=?, completed_at=?
               WHERE id=?""",
            (
                code, explanation, pass_rate, explanation_score,
                speed_bonus, final_score, elo_before, elo_after,
                elapsed_seconds, now, session_id,
            ),
        )
        conn.commit()
    finally:
        conn.close()


def _get_history(user_id: int, limit: int = 20) -> list[dict]:
    conn = _get_conn()
    try:
        rows = conn.execute(
            """SELECT started_at as date, topic, difficulty, elo_after,
                      (elo_after - elo_before) as delta
               FROM sessions
               WHERE user_id = ? AND completed_at IS NOT NULL
               ORDER BY started_at DESC LIMIT ?""",
            (user_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def _sessions_today(user_id: int) -> int:
    conn = _get_conn()
    try:
        today = datetime.now(timezone.utc).date().isoformat()
        count = conn.execute(
            "SELECT COUNT(*) FROM sessions WHERE user_id = ? AND started_at LIKE ?",
            (user_id, f"{today}%"),
        ).fetchone()[0]
        return count
    finally:
        conn.close()


# --- async wrappers ---

async def get_or_create_user(name: str = "default") -> dict:
    return await asyncio.to_thread(_get_or_create_user, name)


async def update_user_elo(user_id: int, new_elo: float) -> None:
    await asyncio.to_thread(_update_user_elo, user_id, new_elo)


async def create_session(
    user_id: int,
    question_id: str,
    topic: str,
    difficulty: str,
    question_elo: float,
    language: str,
) -> int:
    return await asyncio.to_thread(_create_session, user_id, question_id, topic, difficulty, question_elo, language)


async def complete_session(session_id: int, **kwargs) -> None:
    await asyncio.to_thread(_complete_session, session_id, **kwargs)


async def get_history(user_id: int, limit: int = 20) -> list[dict]:
    return await asyncio.to_thread(_get_history, user_id, limit)


async def sessions_today(user_id: int) -> int:
    return await asyncio.to_thread(_sessions_today, user_id)
