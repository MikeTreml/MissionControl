# Agent file template

This is the canonical shape for a library agent. New agents copy this
shape; existing agents converge to it as they're touched.

## File location and naming

```
library/specializations/<topic>/agents/<slug>/<slug>.md
```

- Filename matches the folder name (no separate `AGENT.md`).
- No companion `README.md` — the agent file is the only file an agent folder needs.
- `<slug>` is the kebab-case identifier used in workflows
  (`agent: { name: '<slug>' }` and `metadata: { skills: [...] }`).

## Naming rules for `<slug>`

**Drop generic role tiers** — they're decoration, never load-bearing:

| Drop | Examples |
|---|---|
| Tier suffixes (when decorative) | `-expert`, `-specialist`, `-architect`, `-engineer`, `-designer`, `-developer` |

**Keep** when load-bearing:

| Keep | When |
|---|---|
| Hardware / platform prefix | `gpu-`, `cpu-`, `embedded-`, `web-`, `mobile-`, `desktop-` — tells you where the work runs |
| Behavior verb | `-hunter`, `-validator`, `-router`, `-classifier` — implies an active capability |
| Real contrast pair | `code-reviewer` + `code-implementer` — both exist with distinct roles |

**Drop** subdiscipline prefixes when they functionally overlap:
`algorithm-`, `cuda-`, `hpc-` collapse together when they cover the same
job from different angles. Lean toward one merged agent rather than three
near-duplicates.

**Disambiguate by human name only when needed:** `gpu-perf-frank`
(cautious / correctness-first) vs `gpu-perf-diana` (aggressive /
speed-first). Don't add a name unless you genuinely want two voices.

## File shape

```yaml
---
name: <slug>                  # required, matches folder + filename
domain: <topic>               # required, single field — e.g. "high-performance-computing"
description: <one line>       # required, used by the catalog
---

# <Human Name> — <one-line role>

(One paragraph setting the persona's voice and scope.)

## Working style

- 3 to 6 bullets that **actually change behavior**.
- Verbs, not adjectives. "Validate against a known reference" beats
  "rigorous and thorough".
- Skip claims that don't change behavior ("10+ years experience",
  "PhD in computational science").
- Reference the safety rules in `library/specializations/_shared/generic.md`
  for verification, honest exit, ambiguity handling.

## Output

(Optional. Drop this section if the workflow always specifies the output
format itself.)
```

## What NOT to put in an agent file

- Code samples (the agent already knows the language).
- "Years of experience" claims (don't change behavior).
- Author / version frontmatter (`metadata.author`, `metadata.version`,
  `backlog-id`).
- "Process Integration" lists (those live in the process files that
  reference the agent).
- Long expertise tables (use the description + 5 bullets).

## Reference example

See `library/specializations/_shared/generic.md` for the safety overlay
spec. After running the cleanup workflow, see any agent under
`library/specializations/gpu-programming/agents/` for a concrete migrated
example.
