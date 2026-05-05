import { useEffect, useMemo, useState } from "react";
import type { TestPresetInfo, TestRunSnapshot, TestRunnerEvent } from "../global";

function statusColor(status: TestRunSnapshot["status"]): string {
  switch (status) {
    case "passed":
      return "var(--success)";
    case "failed":
      return "var(--danger)";
    case "cancelled":
      return "var(--warning)";
    case "running":
      return "var(--accent)";
  }
}

function formatDuration(run: TestRunSnapshot): string {
  const start = Date.parse(run.startedAt);
  const end = run.finishedAt ? Date.parse(run.finishedAt) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "";
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export function TestLab(): JSX.Element {
  const [presets, setPresets] = useState<TestPresetInfo[]>([]);
  const [runs, setRuns] = useState<TestRunSnapshot[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
    return window.mc.onTestEvent((event) => {
      handleEvent(event);
    });
  }, []);

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? runs[0] ?? null,
    [runs, selectedRunId],
  );

  const grouped = useMemo(() => {
    const groups = new Map<string, TestPresetInfo[]>();
    for (const preset of presets) {
      const list = groups.get(preset.group) ?? [];
      list.push(preset);
      groups.set(preset.group, list);
    }
    return [...groups.entries()];
  }, [presets]);

  async function refresh(): Promise<void> {
    try {
      const [nextPresets, nextRuns] = await Promise.all([
        window.mc.listTestPresets(),
        window.mc.listTestRuns(),
      ]);
      setPresets(nextPresets);
      setRuns(nextRuns);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleEvent(event: TestRunnerEvent): void {
    if (event.type === "started") {
      setRuns((current) => [event.run, ...current.filter((run) => run.id !== event.run.id)]);
      setSelectedRunId(event.run.id);
      return;
    }
    if (event.type === "output") {
      setRuns((current) =>
        current.map((run) =>
          run.id === event.runId ? { ...run, output: run.output + event.text } : run,
        ),
      );
      return;
    }
    if (event.type === "finished") {
      setRuns((current) =>
        current.map((run) => (run.id === event.run.id ? event.run : run)),
      );
    }
  }

  async function startPreset(presetId: string): Promise<void> {
    try {
      const run = await window.mc.startTestRun(presetId);
      setRuns((current) => [run, ...current.filter((candidate) => candidate.id !== run.id)]);
      setSelectedRunId(run.id);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function cancelRun(runId: string): Promise<void> {
    try {
      const run = await window.mc.cancelTestRun(runId);
      if (run) {
        setRuns((current) => current.map((candidate) => (candidate.id === run.id ? run : candidate)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Test Lab</h1>
          <div className="subline">Mission Control and Babysitter local test presets</div>
        </div>
        <button className="button ghost" type="button" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>

      {error && (
        <section className="card" style={{ color: "var(--danger)", marginBottom: 14 }}>
          {error}
        </section>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(360px, 0.9fr) minmax(0, 1.4fr)", gap: 14 }}>
        <section className="card" style={{ display: "grid", gap: 14, alignContent: "start" }}>
          {grouped.map(([group, groupPresets]) => (
            <div key={group} style={{ display: "grid", gap: 8 }}>
              <div className="section-label">{group}</div>
              {groupPresets.map((preset) => (
                <div
                  key={preset.id}
                  style={{
                    display: "grid",
                    gap: 8,
                    padding: 10,
                    background: "var(--panel)",
                    borderRadius: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{preset.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{preset.description}</div>
                    </div>
                    <button
                      className="button"
                      type="button"
                      disabled={preset.cwdExists === false}
                      onClick={() => void startPreset(preset.id)}
                    >
                      {preset.kind === "server" ? "Start" : "Run"}
                    </button>
                  </div>
                  <code style={{ color: "var(--muted)", wordBreak: "break-word" }}>
                    {preset.cwd}
                  </code>
                  <code style={{ wordBreak: "break-word" }}>
                    {[preset.command, ...preset.args].join(" ")}
                  </code>
                  {preset.expectedReportPath && (
                    <code style={{ color: "var(--muted)", wordBreak: "break-word" }}>
                      report: {preset.expectedReportPath}
                    </code>
                  )}
                </div>
              ))}
            </div>
          ))}
        </section>

        <section className="card" style={{ display: "grid", gap: 12, alignContent: "start", minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16 }}>Runs</h2>
              {selectedRun && (
                <div className="muted" style={{ fontSize: 12 }}>
                  {selectedRun.commandLine}
                </div>
              )}
            </div>
            {selectedRun?.status === "running" && (
              <button className="button ghost" type="button" onClick={() => void cancelRun(selectedRun.id)}>
                Cancel
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {runs.map((run) => (
              <button
                key={run.id}
                className={run.id === selectedRun?.id ? "button" : "button ghost"}
                type="button"
                onClick={() => setSelectedRunId(run.id)}
                style={{ display: "flex", gap: 8, alignItems: "center" }}
              >
                <span style={{ color: statusColor(run.status), fontWeight: 800 }}>●</span>
                <span>{presets.find((preset) => preset.id === run.presetId)?.name ?? run.presetId}</span>
                <span className="muted">{formatDuration(run)}</span>
              </button>
            ))}
            {runs.length === 0 && <span className="muted">No runs yet.</span>}
          </div>

          {selectedRun && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                <Meta label="Status" value={selectedRun.status} color={statusColor(selectedRun.status)} />
                <Meta label="Exit" value={selectedRun.exitCode === undefined ? "-" : String(selectedRun.exitCode)} />
                <Meta label="Duration" value={formatDuration(selectedRun)} />
                <Meta label="Started" value={new Date(selectedRun.startedAt).toLocaleTimeString()} />
              </div>
              <pre
                style={{
                  margin: 0,
                  minHeight: 420,
                  maxHeight: "58vh",
                  overflow: "auto",
                  padding: 12,
                  background: "var(--canvas)",
                  color: "var(--text)",
                  borderRadius: 8,
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {selectedRun.output || "(waiting for output)"}
              </pre>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Meta({ label, value, color }: { label: string; value: string; color?: string }): JSX.Element {
  return (
    <div style={{ background: "var(--panel)", borderRadius: 8, padding: 10, minWidth: 0 }}>
      <div className="muted" style={{ fontSize: 11 }}>{label}</div>
      <div style={{ color, fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis" }}>
        {value}
      </div>
    </div>
  );
}
