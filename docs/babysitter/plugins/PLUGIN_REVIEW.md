# Babysitter Plugins Review

Reviewed source: `C:\Users\Treml\source\repos\babysitter\plugins`

## Useful Material Copied

- `babysitter/`: Claude Code plugin manifest, README, babysit skill, command docs, hook registry, hook scripts, and health/install scripts.
- `babysitter-pi/`: Pi package manifest, README, AGENTS instructions, command mirrors, skill mirrors, extension entrypoint, install/uninstall CLI scripts, and command sync script.
- `a5c/marketplace/`: official marketplace manifest and install/configure/uninstall instructions for the marketplace plugins.

The complete copied file list is in `COPIED_FILES.txt`.

## Main Takeaways

- `plugins/babysitter` is the canonical Claude Code hook package. It delegates actual runtime behavior to the SDK CLI via `babysitter hook:run`, which is the right model for Mission Control to mirror: keep harness glue thin and centralize orchestration logic in the SDK/runtime layer.
- The Claude plugin only registers `SessionStart` and `Stop` in `plugin.json`, but `hooks/hooks.json` also documents `UserPromptSubmit` and `PreToolUse`. Mission Control should treat hook support as harness-specific capabilities rather than assuming one universal hook set.
- The active orchestration contract is one phase per harness turn. The plugin README explicitly says not to document multi-iteration loops inside a single turn. This matches Mission Control's workflow handoff model and is worth preserving.
- `babysitter-pi` is intentionally thin. `extensions/index.ts` forwards slash commands to Pi skills; it does not implement run mutation or a custom loop driver. That is a useful pattern for MC integrations: command aliases should dispatch to existing skill/runtime surfaces, not fork runtime behavior.
- The command docs under `babysitter/commands` are valuable UX references for MC command design: `call`, `plan`, `resume`, `doctor`, `observe`, `plugins`, `retrospect`, `cleanup`, `forever`, `assimilate`, `user-install`, and `project-install`.
- The marketplace manifest is useful as a catalog model. It describes plugin metadata fields MC could surface: `name`, `description`, `latestVersion`, `versions`, `packagePath`, `tags`, and `author`.
- Marketplace plugin instruction docs are mixed. Useful concepts include agentsh sandbox integration, observer/status-line/welcome hooks, plugin lifecycle flows, and prompt/dev-browser/qmd capabilities. Many install docs are long, harness-specific procedural scripts and should be adapted rather than copied directly into MC behavior.

## Most Relevant Files

- `babysitter/plugin.json`
- `babysitter/README.md`
- `babysitter/hooks/hooks.json`
- `babysitter/hooks/babysitter-session-start-hook.sh`
- `babysitter/hooks/babysitter-stop-hook.sh`
- `babysitter/skills/babysit/SKILL.md`
- `babysitter/commands/plugins.md`
- `babysitter/commands/doctor.md`
- `babysitter/commands/observe.md`
- `babysitter-pi/package.json`
- `babysitter-pi/README.md`
- `babysitter-pi/AGENTS.md`
- `babysitter-pi/extensions/index.ts`
- `babysitter-pi/scripts/sync-command-docs.cjs`
- `a5c/marketplace/marketplace.json`

## Less Useful / Skipped

- `babysitter-pi/package-lock.json` was skipped.
- `babysitter-pi/test/` was skipped for now; the implementation and docs provide the useful integration contract.
- No `node_modules` or generated dependency artifacts were copied.
