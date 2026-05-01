Reproduce the CI failure on the hyper-param sweep.

Background: nightly job `nightly-sweep` started failing on Wednesday.
Logs show pytest exits 1 on `tests/sweep_test.py::test_grid_search`
but only when `--seed 0` is set. Locally it passes.

Goal: reproduce, identify root cause, propose a fix.
