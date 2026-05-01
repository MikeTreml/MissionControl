# Babysitter E2E Artifacts Review

Reviewed source: `C:\Users\Treml\source\repos\babysitter\e2e-artifacts`

## Useful Material Moved

- `workspace/request.task.md`: browser-game request fixture used by an E2E workspace.
- `pi-workspace/request.task.md`: same browser-game request fixture for the Pi workspace path.
- `session-create-internal/AGENTS.md`: CI guardrails for the session-create E2E scenario.

The complete moved file list is in `MOVED_FILES.txt`.

## Main Takeaways

- These artifacts are small but useful as test fixtures for validating session creation and local workspace behavior.
- The duplicated `request.task.md` files are intentional enough to keep because they represent separate harness/workspace paths.
- The `AGENTS.md` file is the useful contract: build the smallest local browser game, keep work inside the workspace, and finish only after local openability plus basic verification artifacts exist.
