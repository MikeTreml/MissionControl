Switch backtest seed to deterministic mode.

The replay harness was using `random.seed(time.time())` which made
back-tests non-reproducible. Use a fixed seed configured per scenario.
