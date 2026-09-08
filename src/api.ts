import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  MacRecord,
  NewMacRecord,
  SyncLog,
  SyncResult,
} from "./types";

export const getSettings = () => invoke<AppSettings>("get_settings");

export const saveSettings = (settings: Partial<AppSettings>) =>
  invoke<void>("save_settings", { settings });

export const listMacs = () => invoke<MacRecord[]>("list_macs");

export const addMac = (record: NewMacRecord) =>
  invoke<void>("add_mac", { record });

export const updateMac = (id: number, record: NewMacRecord) =>
  invoke<void>("update_mac", { id, record });

export const deleteMacs = (ids: number[]) =>
  invoke<number>("delete_macs", { ids });

export const clearMacs = () => invoke<void>("clear_macs");

export const bulkAddMacs = (records: NewMacRecord[]) =>
  invoke<number>("bulk_add_macs", { records });

export const listSyncLogs = () => invoke<SyncLog[]>("list_sync_logs");

export const syncNow = () => invoke<SyncResult>("sync_now");
