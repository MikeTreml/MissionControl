# Codespaces

Use Codespaces as a backup development environment when you are away from your main computer.

## Start

Open GitHub, select Code, then Codespaces, then create a codespace.

## Common checks

```bash
npm run typecheck
```

```bash
npm run test:workflow
```

```bash
npm run smoke
```

```bash
npm run build
```

```bash
npm run doctor
```

## Recommended quick validation

For small edits:

```bash
npm run typecheck && npm run test:workflow
```

For larger changes:

```bash
npm run doctor
```

## Notes

Codespaces is useful for quick fixes, review, validation, and pull requests.

Avoid using it for local Windows path testing, D365FO local package indexing, or long-running local orchestration experiments.
