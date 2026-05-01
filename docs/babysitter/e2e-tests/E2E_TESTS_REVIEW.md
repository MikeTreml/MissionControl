# Babysitter E2E Tests Review

Reviewed source: `C:\Users\Treml\source\repos\babysitter\e2e-tests`

## Useful Material Moved

- `docker/`: Dockerfiles, Vitest config, harness helpers, structural tests, stop-hook tests, SDK CLI tests, plugin lifecycle tests, and full-run orchestration tests.
- `fixtures/`: representative task prompts, Claude settings, and the tic-tac-toe process fixture.
- `scripts/`: shell entrypoints for Claude plugin E2E runs, resume testing, and Docker tic-tac-toe orchestration.

The complete moved file list is in `MOVED_FILES.txt`.

## Main Takeaways

- This directory is useful as executable documentation for Babysitter harness behavior. It covers Claude Code, Codex, Cursor, Gemini CLI, GitHub cloud agent, Pi, and oh-my-pi.
- The Docker tests define the practical acceptance contract for integration: harness discovery, plugin install/session lifecycle, stop-hook behavior, SDK CLI behavior, full run creation, resume behavior, and secure sandbox checks.
- `docker/vitest.config.ts` writes JSON results to `../../e2e-artifacts/test-results.json`, which links this directory to the moved `e2e-artifacts` fixtures.
- `fixtures/tic-tac-toe/tic-tac-toe.process.js` is a useful process example because it shows a two-step agent workflow: build files, then verify them.
- `scripts/docker-e2e-tic-tac-toe.sh` is the most complete shell-level E2E contract. It validates plugin structure, SDK session commands, stop-hook lifecycle, fixture setup, optional live Claude execution, and output verification.

## Most Relevant Files

- `docker/orchestration.test.ts`
- `docker/stop-hook.test.ts`
- `docker/sdk-cli.test.ts`
- `docker/plugin-lifecycle.test.ts`
- `docker/plugin-install-session.test.ts`
- `docker/pi-workflow.test.ts`
- `docker/pi-harness.test.ts`
- `docker/codex-full-run.test.ts`
- `docker/codex-babysitter-full-runner.js`
- `docker/live-e2e-run.ts`
- `docker/helpers-harness.ts`
- `docker/vitest.config.ts`
- `fixtures/tic-tac-toe/tic-tac-toe.process.js`
- `scripts/docker-e2e-tic-tac-toe.sh`

## Notes For Mission Control

- Treat these as reference tests, not production app code.
- The test suite is valuable for designing MC's Babysitter integration checks and diagnostics.
- Some files assume Docker, shell tools, Claude/Pi/Codex CLIs, or API keys. Adapt the assertions to MC's Electron test harness before trying to run them directly.
