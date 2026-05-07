# Completion checklist

Before yielding non-trivial code changes:
- Run targeted smoke/typecheck for touched layer.
- For main/preload/shared changes: `npm run typecheck:node` and relevant `src/main/*.smoke.ts` if added/modified.
- For renderer changes: `npm run typecheck:web`; consider `npm run build` for routing/preload/API changes.
- For cross-layer IPC changes: run `npm run typecheck` when feasible.
- For new/changed main stores: add/update a colocated `.smoke.ts` and run it with `node --experimental-strip-types`.
- For library changes: run `npm run build-library-index`.
- For high-confidence final gate before commit: `npm run doctor`.

Do not suppress tests, fabricate outputs, commit secrets, or programmatically delete persisted data except via explicit user-initiated delete flows. Do not commit while tests fail.