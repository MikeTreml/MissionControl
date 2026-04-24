# Workflows

Each subfolder is one workflow. Folder layout:

```
<CODE>-<slug>/
  workflow.json        <- REQUIRED. { code, name, description }
  process.js           <- PROPOSED (unwired). babysitter process — the executable pipeline.
                          See F-feature/process.js for the reference shape.
  prompts/             <- FUTURE. Per-role overrides if a workflow wants a
                          workflow-specific prompt for a role.
```

Rules enforced by the loader at boot:

- Folder name must look like `<CODE>-<slug>` where `<CODE>` is one uppercase letter.
- The `code` in `workflow.json` must match the folder prefix.
- `code` must be unique across all workflows — duplicates fail hard.

To add a new workflow, drop in a new folder and restart the app. No UI needed.

When pi + babysitter wire up (see `docs/WORKFLOW-EXECUTION.md`), `process.js`
is what actually runs. `workflow.json` stays as metadata (name, description,
a future `process` pointer field).
