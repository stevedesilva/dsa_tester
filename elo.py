"""Elo rating calculation for DSA Tester."""

import random

# Difficulty bands
DIFFICULTY_BANDS = {
    "easy":   {"elo_range": (800,  1200), "k": 32},
    "medium": {"elo_range": (1200, 1600), "k": 24},
    "hard":   {"elo_range": (1600, 2000), "k": 16},
    "expert": {"elo_range": (2000, 2400), "k": 12},
}


def select_difficulty(user_elo: float) -> str:
    """Select difficulty based on user Elo with weighted random selection."""
    if user_elo < 1000:
        return "easy"
    elif user_elo < 1400:
        return random.choices(["medium", "easy"], weights=[70, 30])[0]
    elif user_elo < 1800:
        return random.choices(["hard", "medium"], weights=[70, 30])[0]
    else:
        return random.choices(["expert", "hard"], weights=[70, 30])[0]


def question_elo_for_difficulty(difficulty: str) -> float:
    """Return a random question Elo within the difficulty band."""
    lo, hi = DIFFICULTY_BANDS[difficulty]["elo_range"]
    return random.uniform(lo, hi)


def composite_score(pass_rate: float, explanation_quality: float, speed_bonus: float) -> float:
    """Compute composite score 0.0-1.0."""
    return (pass_rate * 0.6) + (explanation_quality * 0.3) + (speed_bonus * 0.1)


def compute_elo_delta(user_elo: float, question_elo: float, score: float, difficulty: str) -> float:
    """Compute Elo delta using standard formula."""
    k = DIFFICULTY_BANDS[difficulty]["k"]
    expected = 1 / (1 + 10 ** ((question_elo - user_elo) / 400))
    return k * (score - expected)


def update_elo(user_elo: float, question_elo: float, score: float, difficulty: str) -> tuple[float, float]:
    """Return (new_elo, delta)."""
    delta = compute_elo_delta(user_elo, question_elo, score, difficulty)
    new_elo = max(100.0, user_elo + delta)
    return new_elo, delta
