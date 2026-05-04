# Electron Architecture Playbook

Use this reference when a request spans architecture, security, IPC, performance, and platform design.

## Task-Type Checklist

### Architecture Review

- Map process responsibilities: main, preload, renderer, shared, utility/worker.
- Find state ownership boundaries and cross-process data flow.
- Check whether filesystem, shell, network credential, and OS integrations stay outside renderer code.
- Identify where project-wide contracts live: IPC channel names, schemas, result types, error types.
- Flag duplicated platform logic and hidden global state.

### IPC Design

- Define channels by capability, not by implementation detail.
- Prefer `invoke/handle` for command-response calls.
- Use explicit event subscription APIs for long-running work, progress, cancellation, and streamed updates.
- Include request schema, response schema, authorization rule, error shape, and cancellation behavior per channel.
- Avoid sending huge objects repeatedly; use file-backed artifacts, IDs, incremental deltas, or streams where practical.

Example contract:

```ts
type IpcCommand<Req, Res> = {
  channel: string;
  request: Req;
  response: Res;
  permission: "project-read" | "project-write" | "system";
};
```

### Security Audit

- BrowserWindow options: `contextIsolation`, `nodeIntegration`, `sandbox`, `webSecurity`, `allowRunningInsecureContent`.
- Preload API: no direct `ipcRenderer`, no broad send/invoke wrappers, no arbitrary channel names.
- Main handlers: validate path access, command arguments, URLs, and user-controlled data.
- Navigation: guard `will-navigate`, `setWindowOpenHandler`, external URL opening.
- Protocols: register privileged schemes deliberately; prevent arbitrary local file exposure.
- Distribution: code signing, notarization, updater signature validation, artifact integrity.

### Performance Analysis

- Startup: measure app ready time, first BrowserWindow creation, first paint, renderer hydration.
- Main process: remove synchronous file scans/imports from startup path.
- Renderer: inspect bundle size, route splitting, expensive initial data loads.
- IPC: check payload size, call frequency, and listener cleanup.
- Memory: inspect BrowserWindow references, event listeners, caches, native handles, and webContents lifecycle.

### Cross-Platform Design

- Windows: installer behavior, app user model ID, file associations, notifications, path length, elevation boundaries.
- macOS: signing, notarization, hardened runtime, entitlements, app sandbox tradeoffs, menu conventions.
- Linux: AppImage/deb/rpm differences, desktop files, tray availability, sandbox/package manager constraints.
- Native modules: ABI compatibility, rebuild strategy, CI matrix, fallback behavior.

### Migration Planning

- Identify current and target Electron versions.
- Check Node, Chromium, V8, and Electron breaking changes.
- Review deprecated APIs: `remote`, old webPreferences, protocol APIs, packaging config.
- Plan staged rollout: dependency upgrade, build config, security defaults, smoke tests, installer validation.

## Decision Heuristics

- Use utility processes or workers when CPU work can block UI or main orchestration.
- Use preload APIs instead of renderer-side Node access, even for trusted local apps.
- Use schemas at IPC boundaries when handlers write files, spawn processes, touch credentials, or mutate app state.
- Use platform adapters when the same feature has different OS APIs.
- Keep packaging, updater, and signing decisions aligned; updater design depends on artifact and signature strategy.

## Architecture Output Prompts

For reviews, include:

- Current architecture map.
- Highest-risk issues.
- Target architecture.
- Incremental migration plan.
- Tests or smoke checks to prove the change.

For new designs, include:

- Process diagram.
- IPC contract table.
- Security defaults.
- Data/state ownership.
- Packaging and update assumptions.
