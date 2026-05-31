#!/usr/bin/env python3
"""Golden Dataset validator — schema checks and optional RAG Hit Rate testing."""
import argparse
import json
import sys
from pathlib import Path

DATASET_DIR = Path(__file__).resolve().parent.parent / "test-files" / "golden_dataset"
SUBJECTS = ["oop", "prpr", "dsa", "iau", "ma"]
REQUIRED_KEYS = {"id", "question", "expected_keywords", "difficulty", "subject"}
VALID_DIFFICULTIES = {"easy", "medium", "hard"}


def validate_schema() -> bool:
    ok = True
    total = 0
    for subj in SUBJECTS:
        fpath = DATASET_DIR / f"{subj}.json"
        if not fpath.exists():
            print(f"  MISSING: {fpath.name}")
            ok = False
            continue
        data = json.loads(fpath.read_text(encoding="utf-8"))
        count = len(data)
        total += count
        errors = []
        for i, q in enumerate(data):
            missing = REQUIRED_KEYS - set(q.keys())
            if missing:
                errors.append(f"  [{q.get('id', i)}] missing keys: {missing}")
            if q.get("difficulty") not in VALID_DIFFICULTIES:
                errors.append(f"  [{q.get('id', i)}] invalid difficulty: {q.get('difficulty')}")
        if errors:
            print(f"  {subj.upper()}: {count} questions, {len(errors)} errors")
            for e in errors[:5]:
                print(e)
            ok = False
        else:
            print(f"  {subj.upper()}: {count} questions OK")

    golden = DATASET_DIR / "golden_30.json"
    if golden.exists():
        g = json.loads(golden.read_text(encoding="utf-8"))
        print(f"  GOLDEN_30: {len(g)} questions")
        total += 0
    else:
        print("  MISSING: golden_30.json")
        ok = False

    print(f"\n  Total questions: {total}")
    return ok


def test_rag(backend: str) -> None:
    import httpx

    golden = DATASET_DIR / "golden_30.json"
    if not golden.exists():
        print("golden_30.json not found")
        return
    questions = json.loads(golden.read_text(encoding="utf-8"))
    hits = 0
    for q in questions:
        try:
            resp = httpx.post(
                f"{backend}/api/v1/chat",
                json={"message": q["question"]},
                timeout=30.0,
            )
            if resp.status_code == 200:
                body = resp.json()
                answer = body.get("response", "").lower()
                matched = any(kw.lower() in answer for kw in q["expected_keywords"])
                if matched:
                    hits += 1
                    print(f"  HIT  [{q['id']}]")
                else:
                    print(f"  MISS [{q['id']}]")
            else:
                print(f"  ERR  [{q['id']}] HTTP {resp.status_code}")
        except Exception as exc:
            print(f"  ERR  [{q['id']}] {exc}")

    rate = hits / len(questions) * 100 if questions else 0
    print(f"\n  Hit Rate: {hits}/{len(questions)} = {rate:.1f}%")

    report = DATASET_DIR / "validation_report.md"
    report.write_text(
        f"# Golden Dataset Validation Report\n\n"
        f"- Questions tested: {len(questions)}\n"
        f"- Hits: {hits}\n"
        f"- Hit Rate: {rate:.1f}%\n"
        f"- Backend: {backend}\n",
        encoding="utf-8",
    )
    print(f"  Report saved to {report}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Golden Dataset Validator")
    parser.add_argument("--validate-schema", action="store_true", help="Check JSON schema (offline)")
    parser.add_argument("--test-rag", action="store_true", help="Run RAG Hit Rate test (needs backend)")
    parser.add_argument("--backend", default="http://localhost:8000", help="Backend URL")
    args = parser.parse_args()

    if not args.validate_schema and not args.test_rag:
        args.validate_schema = True

    if args.validate_schema:
        print("Schema validation:")
        if not validate_schema():
            sys.exit(1)

    if args.test_rag:
        print("\nRAG Hit Rate test:")
        test_rag(args.backend)
