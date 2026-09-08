export interface MacRecord {
  id: number;
  mac: string;
  name: string;
  staff_id: string;
  remark: string;
  created_at: string;
  updated_at: string;
}

export interface NewMacRecord {
  mac: string;
  name: string;
  staff_id: string;
  remark?: string;
}

export interface AppSettings {
  server_url: string;
  username: string;
  password: string;
  auth_type_name: string;
  verify_code: string;
  email_code: string;
  action: string;
  palang: string;
  /** 记住账号密码 */
  remember: boolean;
  /** 修改数据后自动同步 */
  auto_sync: boolean;
}

export interface SyncResult {
  success: boolean;
  status: number;
  count: number;
  response: string;
  duration_ms: number;
  error: string | null;
}

export interface SyncLog {
  id: number;
  time: string;
  success: boolean;
  count: number;
  message: string;
  response: string;
}
