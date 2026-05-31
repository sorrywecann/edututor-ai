# Golden Dataset — EduTutor.AI

354 questions across 5 CS university subjects (STU curriculum).
Used for RAG pipeline validation and Hit Rate benchmarking.

## Subjects

| Code | Subject | Questions | File |
|------|---------|-----------|------|
| OOP  | Objektovo orientovane programovanie | 71 | `oop.json` |
| PRPR | Proceduralne programovanie | 71 | `prpr.json` |
| DSA  | Datove struktury a algoritmy | 71 | `dsa.json` |
| IAU  | Inteligentna analyza udajov | 71 | `iau.json` |
| MA   | Matematicka analyza | 70 | `ma.json` |

## Golden 30

`golden_30.json` contains 6 curated questions per subject (30 total) used
for the primary Hit Rate benchmark. Target: >90% Hit Rate at top-5 retrieval.

## Schema

```json
{
  "id": "OOP-001",
  "question": "...",
  "expected_keywords": ["trieda", "objekt"],
  "difficulty": "easy|medium|hard",
  "subject": "OOP"
}
```

## Validation

```bash
python scripts/validate_golden_dataset.py --validate-schema
python scripts/validate_golden_dataset.py --test-rag --backend http://localhost:8000
```
