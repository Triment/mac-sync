import type { SyncLog, SyncResult } from "../types";

interface Props {
  syncing: boolean;
  onSync: () => void;
  result: SyncResult | null;
  logs: SyncLog[];
  autoSync: boolean;
  onAutoSyncChange: (v: boolean) => void;
}

export default function SyncPanel({
  syncing,
  onSync,
  result,
  logs,
  autoSync,
  onAutoSyncChange,
}: Props) {
  return (
    <div className="card">
      <h2>同步</h2>
      <div className="result-summary">
        <button className="primary" onClick={onSync} disabled={syncing}>
          {syncing ? "同步中…" : "⟳ 立即同步"}
        </button>
        <label className="checkbox-field" style={{ margin: 0 }}>
          <input
            type="checkbox"
            checked={autoSync}
            onChange={(e) => onAutoSyncChange(e.target.checked)}
          />
          修改数据后自动同步
        </label>
        <div className="spacer" style={{ flex: 1 }} />
        {result && (
          <>
            <span className={`status ${result.success ? "ok" : "fail"}`}>
              {result.success ? "✓ 同步成功" : "✗ 同步失败"}
            </span>
            <span className="meta">
              {result.count} 条 · HTTP {result.status} · {result.duration_ms} ms
            </span>
          </>
        )}
      </div>

      {result?.error && <p className="error-text">{result.error}</p>}

      {result?.response && (
        <pre className="response">{result.response}</pre>
      )}

      {logs.length > 0 && (
        <div className="log-list">
          {logs.map((log) => (
            <div className="log-item" key={log.id}>
              <span className={`mark ${log.success ? "ok" : "fail"}`} />
              <span style={{ width: 150 }}>{log.time}</span>
              <span>{log.count} 条</span>
              <span
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={log.message}
              >
                {log.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
