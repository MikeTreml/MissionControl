# Babysitter Packages Review

Reviewed source: `C:\Users\Treml\source\repos\babysitter\packages`

## Useful Material Copied

- `sdk/`: public SDK contracts, CLI command surface, harness discovery/adapters, prompt templates, plugin docs, and deterministic test harness docs.
- `observer-dashboard/`: run parser, cache, watcher, API routes, dashboard types, config loading, and source discovery.
- `catalog/docs/requirements/`: process library catalog requirements, API/data-model notes, and UI/UX requirements.
- `catalog/docs/improvements/`: catalog quality, architecture, performance, security, DX, and documentation review notes.
- `babysitter/README.md`: metapackage installation note.

The complete copied file list is in `COPIED_FILES.txt`.

## Main Takeaways

- The SDK is already the useful integration layer. Mission Control should prefer the exported contracts in `sdk/src/index.ts`, `runtime/types.ts`, `tasks/types.ts`, `storage/types.ts`, and `harness/types.ts` instead of duplicating Babysitter run/task models.
- `sdk/src/cli/main.ts` contains the most current command inventory. It is newer and broader than the older docs, especially around sessions, profiles, process libraries, plugins, harness commands, MCP serving, and token stats.
- Harness discovery is important for Mission Control runtime settings. `sdk/src/harness/discovery.ts` shows the known harnesses, CLI commands, session environment variables, and capabilities.
- The observer dashboard is directly reusable for Mission Control's run monitoring. `parser.ts`, `run-cache.ts`, `watcher.ts`, and the API routes already implement incremental journal parsing, pending breakpoint detection, stale/orphaned run detection, config-driven source discovery, and streamable run updates.
- The catalog application source itself is less useful because it is a standalone Next app and some docs recommend SQLite. For Mission Control, the requirement and improvement docs are useful as product/reference material, but the implementation approach should be adapted to MC's file-first model.

## Less Useful / Skipped

- `packages/catalog/README.md` is stock Next.js boilerplate.
- Generated or narrow unit tests were not copied unless the adjacent source/docs were the better contract reference.
- Full app scaffolding, React pages, and styling from the standalone package apps were not copied because Mission Control already has its own Electron/React structure.
