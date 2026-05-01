### 2026-04-30 14:25:00 UTC
Cycle 1 started — running `pytest tests/sweep_test.py -k sweep --seed 0`

### 2026-05-01 02:25:00 UTC
Cycle 2 — confirmed the failure reproduces on a clean checkout (3/3 attempts)

### 2026-05-01 09:25:00 UTC
Cycle 3 — bisecting commit range main..origin/main

### 2026-05-01 14:23:48 UTC
Cycle 4 — narrowed to commit a3c1f9: parallel grid eval breaks deterministic seed propagation

