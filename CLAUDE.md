# DSA Tester — Claude Code Rules

## Overview

Daily DSA practice tool. FastAPI backend (port 8001) + React/MUI/Monaco frontend (port 5174).
Each session: LLM generates a LeetCode-style question calibrated to the user's Elo → user writes a solution → subprocess runs it against hidden test cases → LLM scores the explanation → Elo updates and persists to SQLite.

## Run Commands

### First-time setup

```bash
# 1. Install Python dependencies (from project root)
uv sync

# 2. Install frontend dependencies
cd desilvaware/dsa_tester/frontend && npm install

# 3. Copy and populate environment variables
cp .env.example .env
# Add at minimum: OPENAI_API_KEY=sk-...
```

### Start the app (two terminals)

**Terminal 1 — backend:**
```bash
# From project root
uv run python desilvaware/dsa_tester/server.py
# Listening on http://127.0.0.1:8001
```

**Terminal 2 — frontend:**
```bash
cd desilvaware/dsa_tester/frontend
npm run dev
# → http://localhost:5174
```

Open http://localhost:5174 in your browser.

### Tests

```bash
uv run pytest tests/dsa_tester/ -v
```

## File Map

| File | Responsibility |
|---|---|
| `server.py` | FastAPI app, CORS, SSE streaming, in-memory question cache |
| `db.py` | SQLite via `asyncio.to_thread` — users + sessions tables |
| `elo.py` | Difficulty bands, composite score, Elo update formula |
| `question_gen.py` | LLM question generation + explanation evaluation (GPT-4o-mini) |
| `runner.py` | Subprocess executor — Python harness, Java/Go stubs |
| `models.py` | Pydantic request/response models |
| `data/dsa.db` | SQLite DB (auto-created on first run) |
| `frontend/src/App.tsx` | Root state machine |
| `frontend/src/api.ts` | fetch + ReadableStream SSE client |

## Architecture Rules

- **DB calls** — always use `asyncio.to_thread()`. Never call sqlite3 directly from async code.
- **LLM clients** — reuse `arena.providers._get_openai_client()` (cached). Never create a new OpenAI client directly.
- **JSON extraction** — use `arena.judge.extract_json()` to parse LLM output. Never `json.loads()` raw LLM text.
- **Question cache** — `_question_cache` in `server.py` holds the full question (including hidden test cases) keyed by `session_id`. Only the public question (minus `hidden_test_cases`) is sent to the frontend.
- **SSE format** — `data: {json}\n\n`. Use the `sse()` helper in `_submit_stream`. POST endpoint uses `StreamingResponse`; `EventSource` is not usable for POST.
- **Code execution** — always use a fresh subprocess with `capture_output=True, text=True`. Never `exec()` or `eval()` user code in-process.

## Elo System

```
score     = pass_rate×0.6 + explanation_quality×0.3 + speed_bonus×0.1
expected  = 1 / (1 + 10^((question_elo - user_elo) / 400))
new_elo   = user_elo + K × (score - expected)
```

Difficulty → K-factor: easy=32, medium=24, hard=16, expert=12.
Elo floor is 100. Never allow `new_elo < 100`.

## Difficulty Selection

| User Elo | Distribution |
|---|---|
| < 1000 | 100% Easy |
| 1000–1400 | 70% Medium / 30% Easy |
| 1400–1800 | 70% Hard / 30% Medium |
| 1800+ | 70% Expert / 30% Hard |

## API Contract

| Endpoint | Method | Notes |
|---|---|---|
| `/api/status` | GET | Returns `{status, elo, sessions_today}` |
| `/api/question` | GET | `?topic=random` — generates + caches question, creates session row |
| `/api/submit` | POST | SSE stream — events: `running`, `case_result`, `evaluating_explanation`, `complete` |
| `/api/history` | GET | Last 20 completed sessions for default user |

## Frontend Rules

- State machine lives in `App.tsx`: `idle → question_loaded → coding → submitting → results → (new question)`
- All MUI components — no raw HTML styling outside of `sx` props.
- SSE is consumed via `api.ts:submitSolution()` as an async generator using `fetch` + `ReadableStream`.
- `TimerBar` uses `useEffect` interval — always clean up with `clearInterval` on unmount.
- Language change resets the code editor to the new function signature stub.

## Extending

**Add a new language runner:**
1. Add a `run_<lang>()` function in `runner.py` that builds a harness, invokes subprocess, and returns `list[TestResult]`.
2. Add the language to the `run_code()` dispatcher.
3. Add the language to `LanguageSelector.tsx` and the `monacoLang` map in `CodeEditor.tsx`.
4. Add the language to the `Language` type in `types.ts`.

**Add a new API endpoint:**
1. Add the route to `server.py`.
2. Add a Pydantic model to `models.py` if needed.
3. Add a fetch function to `frontend/src/api.ts`.

**Change Elo parameters:**
- Edit `DIFFICULTY_BANDS` in `elo.py` — K-factors and Elo ranges are defined there.
- Composite score weights are in `composite_score()` — must sum to 1.0.

## Validation

```bash
uv run ruff check desilvaware/dsa_tester/
uv run pytest tests/dsa_tester/ -q
```
