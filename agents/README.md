# Agents

Every agent — whether it's a primary role (Planner, Developer, Reviewer,
Surgeon) or a spawnable subagent (RepoMapper, DocRefresher) — lives here
as a folder with an `agent.json`.

Layout:

```
<slug>/
  agent.json      <- REQUIRED: { slug, code, name, title, description, primaryModel, fallbackModels, permissions, promptFile }
  prompt.md       <- optional system prompt / instructions
```

Fields:

- **`name`** — the specific variant. "Python Dev", "X++ Reviewer", "RepoMapper".
- **`title`** — soft category for grouping in the UI. Multiple agents can share a
  title: "Python Dev" and "C# Dev" both have title "Developer"; a generic and
  a best-practice reviewer both have title "Reviewer". Empty = ungrouped.
- **`description`** — free text. What this variant is good at.

Rules enforced at boot:

- Folder name must match `slug` in `agent.json`.
- `code` must be unique across all agents. It's used in task-linked file
  names (e.g. `DA-015F-p` = Planner's output for task DA-015F).
- Convention: **1-char code** = primary role; **2-4 chars** = subagent.

Adding an agent: drop a folder, restart. No code change, no UI form.

Model selection lives in each agent file (`primaryModel` + `fallbackModels`)
and references entries from the model roster (`<userData>/models.json`).
If a referenced model id isn't in the roster, pi will fail at run time
with a clear error.
