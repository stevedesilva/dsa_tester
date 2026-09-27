"""Self-contained LLM client and response parsing for the web application."""

import json
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI


@lru_cache(maxsize=1)
def get_openai_client() -> OpenAI:
    """Load this project's environment and reuse its client across requests."""
    load_dotenv(Path(__file__).parent / ".env")
    return OpenAI()


def extract_json(text: str) -> dict:
    """Parse an object, allowing Markdown fences or surrounding model prose."""
    decoder = json.JSONDecoder()
    for index, character in enumerate(text):
        if character != "{":
            continue
        try:
            value, _ = decoder.raw_decode(text, index)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
    raise ValueError("LLM response did not contain a valid JSON object")
