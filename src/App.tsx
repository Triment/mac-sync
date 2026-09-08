import { useCallback, useEffect, useState } from "react";
import MacTable from "./components/MacTable";
import SettingsPanel from "./components/SettingsPanel";
import SyncPanel from "./components/SyncPanel";
import * as api from "./api";
import type {
  AppSettings,
  MacRecord,
  NewMacRecord,
  SyncLog,
  SyncResult,
} from "./types";

interface Toast {
  kind: "ok" | "fail";
  text: string;
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [records, setRecords] = useState<MacRecord[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((kind: "ok" | "fail", text: string) => {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const refreshRecords = useCallback(async () => {
    try {
      setRecords(await api.listMacs());
    } catch (e) {
      showToast("fail", "读取数据失败: " + String(e));
    }
  }, [showToast]);

  const refreshLogs = useCallback(async () => {
    try {
      setLogs(await api.listSyncLogs());
    } catch {
      // 日志加载失败不提示，避免干扰
    }
  }, []);

  useEffect(() => {
    api
      .getSettings()
      .then(setSettings)
      .catch((e) => showToast("fail", "读取设置失败: " + String(e)));
    refreshRecords();
    refreshLogs();
  }, [refreshRecords, refreshLogs, showToast]);

  /** 执行一次同步并刷新结果与日志 */
  const runSync = useCallback(async (): Promise<SyncResult | null> => {
    setSyncing(true);
    try {
      const r = await api.syncNow();
      setResult(r);
      refreshLogs();
      showToast(
        r.success ? "ok" : "fail",
        r.success ? `同步成功（${r.count} 条）` : `同步失败：${r.error ?? r.status}`,
      );
      return r;
    } catch (e) {
      const msg = String(e);
      showToast("fail", "同步失败: " + msg);
      setResult({
        success: false,
        status: 0,
        count: 0,
        response: "",
        duration_ms: 0,
        error: msg,
      });
      refreshLogs();
      return null;
    } finally {
      setSyncing(false);
    }
  }, [refreshLogs, showToast]);

  /** 数据变更后：刷新列表，并在开启自动同步时触发同步 */
  const afterChange = useCallback(async () => {
    await refreshRecords();
    if (settings?.auto_sync) {
      await runSync();
    }
  }, [refreshRecords, runSync, settings?.auto_sync]);

  const handleSaveSettings = useCallback(
    async (s: Partial<AppSettings>) => {
      try {
        await api.saveSettings(s);
        const merged = await api.getSettings();
        setSettings(merged);
        showToast("ok", "设置已保存");
      } catch (e) {
        showToast("fail", "保存设置失败: " + String(e));
        throw e;
      }
    },
    [showToast],
  );

  const handleAdd = useCallback(
    async (record: NewMacRecord) => {
      try {
        await api.addMac(record);
        showToast("ok", "已添加");
        await afterChange();
      } catch (e) {
        showToast("fail", String(e));
        throw e;
      }
    },
    [afterChange, showToast],
  );

  const handleUpdate = useCallback(
    async (id: number, record: NewMacRecord) => {
      try {
        await api.updateMac(id, record);
        showToast("ok", "已更新");
        await afterChange();
      } catch (e) {
        showToast("fail", String(e));
        throw e;
      }
    },
    [afterChange, showToast],
  );

  const handleDelete = useCallback(
    async (ids: number[]) => {
      try {
        const n = await api.deleteMacs(ids);
        showToast("ok", `已删除 ${n} 条`);
        await afterChange();
      } catch (e) {
        showToast("fail", "删除失败: " + String(e));
        await refreshRecords();
      }
    },
    [afterChange, refreshRecords, showToast],
  );

  const handleClear = useCallback(async () => {
    try {
      await api.clearMacs();
      showToast("ok", "已清空");
      await afterChange();
    } catch (e) {
      showToast("fail", "清空失败: " + String(e));
    }
  }, [afterChange, showToast]);

  const handleImport = useCallback(
    async (items: NewMacRecord[]) => {
      if (items.length === 0) {
        showToast("fail", "Excel 中没有解析到 MAC 数据（请确认列格式）");
        return;
      }
      try {
        const n = await api.bulkAddMacs(items);
        showToast("ok", `导入完成：解析 ${items.length} 条，新增 ${n} 条（重复已跳过）`);
        await afterChange();
      } catch (e) {
        showToast("fail", "导入失败: " + String(e));
        await refreshRecords();
      }
    },
    [afterChange, refreshRecords, showToast],
  );

  const badgeClass = syncing
    ? "sync-badge busy"
    : result
      ? `sync-badge ${result.success ? "ok" : "fail"}`
      : "sync-badge";
  const badgeText = syncing
    ? "同步中…"
    : result
      ? result.success
        ? "已同步"
        : "同步失败"
      : "尚未同步";

  return (
    <div className="app">
      <header className="header">
        <h1>MAC 同步管理</h1>
        <span className={badgeClass}>{badgeText}</span>
        <div className="spacer" />
        <button
          className="primary"
          onClick={() => runSync()}
          disabled={syncing}
        >
          {syncing ? "同步中…" : "⟳ 立即同步"}
        </button>
      </header>

      <div className="main">
        <aside className="sidebar">
          <SettingsPanel settings={settings} onSave={handleSaveSettings} />
        </aside>

        <main className="content">
          <MacTable
            records={records}
            onAdd={handleAdd}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onClear={handleClear}
            onImport={handleImport}
          />
          <SyncPanel
            syncing={syncing}
            onSync={() => runSync()}
            result={result}
            logs={logs}
            autoSync={settings?.auto_sync ?? false}
            onAutoSyncChange={(v) => {
              if (settings) {
                setSettings({ ...settings, auto_sync: v });
                handleSaveSettings({ auto_sync: v }).catch(() => {});
              }
            }}
          />
        </main>
      </div>

      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
    </div>
  );
}
