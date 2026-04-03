"""LLM-based question generation for DSA Tester."""

import logging

from arena.judge import extract_json
from arena.providers import _get_openai_client

logger = logging.getLogger(__name__)

QUESTION_MODEL = "gpt-4o-mini"
EVAL_MODEL = "gpt-4o-mini"

TOPICS = [
    "arrays", "strings", "linked lists", "trees", "graphs",
    "dynamic programming", "sorting", "binary search", "stacks", "queues",
    "hash maps", "heaps", "recursion", "backtracking", "bit manipulation",
]

_QUESTION_SYSTEM = """You are an expert algorithm problem designer.
Generate a LeetCode-style coding question as a JSON object with EXACTLY this structure:
{
  "id": "kebab-case-id",
  "title": "Problem Title",
  "difficulty": "<difficulty>",
  "topic": "<topic>",
  "elo": <integer elo value>,
  "description": "Full problem description with context",
  "examples": [{"input": "...", "output": "..."}],
  "constraints": ["constraint 1", "constraint 2"],
  "function_signatures": {
    "python": "def solution(...) -> ...:",
    "java": "public ... solution(...) {",
    "go": "func solution(...) ... {"
  },
  "test_cases": [
    {"input": {...}, "expected": ...},
    {"input": {...}, "expected": ...},
    {"input": {...}, "expected": ...}
  ],
  "hidden_test_cases": [
    {"input": {...}, "expected": ...},
    {"input": {...}, "expected": ...},
    {"input": {...}, "expected": ...}
  ],
  "time_limit_seconds": 5
}
Return ONLY the JSON object, no additional text."""

_EVAL_SYSTEM = """You are an expert code reviewer evaluating algorithm solutions.
Score the explanation from 0.0 to 1.0 based on:
- Correctness of the described approach
- Clarity of explanation
- Awareness of time and space complexity
Return ONLY a JSON object: {"score": <float>}"""


def generate_question(topic: str, difficulty: str, question_elo: float) -> dict:
    """Generate a DSA question using LLM. Returns parsed question dict."""
    client = _get_openai_client(base_url=None, api_key=None)
    prompt = (
        f"Generate a {difficulty} difficulty coding problem about {topic}. "
        f"The question difficulty Elo should be approximately {question_elo:.0f}. "
        f"Include exactly 3 visible test_cases and 3 hidden_test_cases."
    )
    response = client.chat.completions.create(
        model=QUESTION_MODEL,
        messages=[
            {"role": "system", "content": _QUESTION_SYSTEM},
            {"role": "user", "content": prompt},
        ],
        temperature=0.8,
        max_tokens=2000,
    )
    raw = response.choices[0].message.content or ""
    question = extract_json(raw)
    if not isinstance(question, dict):
        raise ValueError(f"LLM returned invalid question JSON: {raw[:200]}")
    # Ensure required fields have defaults
    question.setdefault("time_limit_seconds", 5)
    question.setdefault("hidden_test_cases", [])
    return question


def evaluate_explanation(
    question: dict,
    code: str,
    explanation: str,
    pass_rate: float,
) -> float:
    """Score explanation quality 0.0-1.0 using LLM."""
    client = _get_openai_client(base_url=None, api_key=None)
    prompt = (
        f"Problem: {question.get('title', 'Unknown')}\n"
        f"Description: {question.get('description', '')[:500]}\n\n"
        f"User's code:\n```\n{code[:1000]}\n```\n\n"
        f"User's explanation: {explanation[:500]}\n\n"
        f"Test pass rate: {pass_rate:.0%}\n\n"
        "Score the explanation quality 0.0-1.0."
    )
    response = client.chat.completions.create(
        model=EVAL_MODEL,
        messages=[
            {"role": "system", "content": _EVAL_SYSTEM},
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
        max_tokens=100,
    )
    raw = response.choices[0].message.content or ""
    try:
        result = extract_json(raw)
        if isinstance(result, dict):
            return float(result.get("score", 0.5))
    except Exception:
        pass
    return 0.5
