"""Subprocess code executor for Python, Java, and Go."""

import json
import subprocess
import textwrap
import time

from desilvaware.dsa_tester.models import TestResult


def _build_python_harness(user_code: str, test_cases: list[dict]) -> str:
    """Build a Python test harness that prints PASS/FAIL for each case."""
    cases_repr = repr(test_cases)
    return textwrap.dedent(f"""\
import json, sys

{user_code}

test_cases = {cases_repr}
for i, tc in enumerate(test_cases, 1):
    inp = tc["input"]
    expected = tc["expected"]
    try:
        result = solution(**inp)
        if result == expected:
            print(f"PASS:{{i}}")
        else:
            print(f"FAIL:{{i}}:expected {{json.dumps(expected)}} got {{json.dumps(result)}}")
    except Exception as e:
        print(f"FAIL:{{i}}:exception {{e}}")
""")


def _build_java_harness(user_code: str, test_cases: list[dict]) -> str:
    """Build a Java test harness (simplified for integer array problems)."""
    json.dumps(test_cases)
    return textwrap.dedent(f"""\
import java.util.*;

public class Solution {{
    {user_code}

    public static void main(String[] args) {{
        // Simplified: print UNSUPPORTED for Java (full impl requires build system)
        System.out.println("UNSUPPORTED:Java harness requires manual setup");
    }}
}}
""")


def _build_go_harness(user_code: str, test_cases: list[dict]) -> str:
    """Build a Go test harness."""
    return textwrap.dedent(f"""\
package main

import "fmt"

{user_code}

func main() {{
    fmt.Println("UNSUPPORTED:Go harness requires manual setup")
}}
""")


def run_python(user_code: str, test_cases: list[dict], time_limit: int = 5) -> list[TestResult]:
    """Execute Python code against test cases."""
    harness = _build_python_harness(user_code, test_cases)
    results = []
    start = time.monotonic()
    try:
        proc = subprocess.run(
            ["python3", "-c", harness],
            timeout=time_limit,
            capture_output=True,
            text=True,
        )
        elapsed_total = int((time.monotonic() - start) * 1000)
        output_lines = proc.stdout.strip().split("\n") if proc.stdout.strip() else []
        stderr = proc.stderr.strip()

        for i, _tc in enumerate(test_cases, 1):
            # Find matching output line
            line = next(
                (ln for ln in output_lines if ln.startswith(f"PASS:{i}") or ln.startswith(f"FAIL:{i}")),
                None,
            )
            if line is None:
                error = stderr[:200] if stderr else "No output"
                results.append(TestResult(case_number=i, passed=False, elapsed_ms=elapsed_total, error=error))
            elif line.startswith(f"PASS:{i}"):
                results.append(TestResult(case_number=i, passed=True, elapsed_ms=elapsed_total))
            else:
                error = line[len(f"FAIL:{i}:"):] if ":" in line[5:] else "Wrong answer"
                results.append(TestResult(case_number=i, passed=False, elapsed_ms=elapsed_total, error=error))
    except subprocess.TimeoutExpired:
        elapsed_total = time_limit * 1000
        for i, _ in enumerate(test_cases, 1):
            results.append(TestResult(case_number=i, passed=False, elapsed_ms=elapsed_total, error="Time limit exceeded"))
    except Exception as e:
        for i, _ in enumerate(test_cases, 1):
            results.append(TestResult(case_number=i, passed=False, elapsed_ms=0, error=str(e)))
    return results


def run_code(language: str, user_code: str, test_cases: list[dict], time_limit: int = 5) -> list[TestResult]:
    """Dispatch code execution to the appropriate language runner."""
    if language == "python":
        return run_python(user_code, test_cases, time_limit)
    # Java and Go: return unsupported for now
    results = []
    for i, _ in enumerate(test_cases, 1):
        results.append(TestResult(
            case_number=i,
            passed=False,
            elapsed_ms=0,
            error=f"{language} execution not yet supported in this environment",
        ))
    return results
