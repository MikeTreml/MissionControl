import { useEffect, useMemo, useState } from "react";
import type { TestPresetInfo, TestRunSnapshot, TestRunnerEvent } from "../global";

function statusClass(status: TestRunSnapshot["status"]): string {
  return `test-lab-status test-lab-status-${status}`;
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
        <section className="card test-lab-error">
          {error}
        </section>
      )}

      <div className="test-lab-layout">
        <section className="card test-lab-presets">
          {grouped.map(([group, groupPresets]) => (
            <div key={group} className="test-lab-group">
              <div className="section-label">{group}</div>
              {groupPresets.map((preset) => (
                <div key={preset.id} className="test-lab-preset">
                  <div className="test-lab-preset-head">
                    <div className="test-lab-min">
                      <div className="test-lab-preset-name">{preset.name}</div>
                      <div className="muted test-lab-small">{preset.description}</div>
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
                  <code className="test-lab-muted-code">
                    {preset.cwd}
                  </code>
                  <code className="test-lab-code">
                    {[preset.command, ...preset.args].join(" ")}
                  </code>
                  {preset.expectedReportPath && (
                    <code className="test-lab-muted-code">
                      report: {preset.expectedReportPath}
                    </code>
                  )}
                </div>
              ))}
            </div>
          ))}
        </section>

        <section className="card test-lab-runs">
          <div className="test-lab-runs-head">
            <div>
              <h2 className="test-lab-runs-title">Runs</h2>
              {selectedRun && (
                <div className="muted test-lab-small">
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

          <div className="test-lab-run-list">
            {runs.map((run) => (
              <button
                key={run.id}
                className={run.id === selectedRun?.id ? "button" : "button ghost"}
                type="button"
                onClick={() => setSelectedRunId(run.id)}
              >
                <span className={statusClass(run.status)}>●</span>
                <span>{presets.find((preset) => preset.id === run.presetId)?.name ?? run.presetId}</span>
                <span className="muted">{formatDuration(run)}</span>
              </button>
            ))}
            {runs.length === 0 && <span className="muted">No runs yet.</span>}
          </div>

          {selectedRun && (
            <>
              <div className="test-lab-meta-grid">
                <Meta label="Status" value={selectedRun.status} status={selectedRun.status} />
                <Meta label="Exit" value={selectedRun.exitCode === undefined ? "-" : String(selectedRun.exitCode)} />
                <Meta label="Duration" value={formatDuration(selectedRun)} />
                <Meta label="Started" value={new Date(selectedRun.startedAt).toLocaleTimeString()} />
              </div>
              <pre className="test-lab-output">
                {selectedRun.output || "(waiting for output)"}
              </pre>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Meta({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status?: TestRunSnapshot["status"];
}): JSX.Element {
  return (
    <div className="test-lab-meta">
      <div className="muted test-lab-meta-label">{label}</div>
      <div className={`test-lab-meta-value${status ? ` test-lab-status-${status}` : ""}`}>
        {value}
      </div>
    </div>
  );
}
