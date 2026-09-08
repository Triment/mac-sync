use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

/// 一条 MAC 记录，对应 Excel（宿舍网络MAC地址收集.xlsx）中的列：
/// 第 1 列(索引0) = 姓名，第 2 列(索引1) = 工号，第 4 列(索引3) = MAC 地址（大写）
/// 同步到设备的 mac.conf 行格式为：`{mac} {工号}-{姓名}`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MacRecord {
    pub id: i64,
    pub mac: String,
    pub name: String,
    pub staff_id: String,
    pub remark: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewMacRecord {
    pub mac: String,
    pub name: String,
    pub staff_id: String,
    #[serde(default)]
    pub remark: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncLog {
    pub id: i64,
    pub time: String,
    pub success: bool,
    pub count: i64,
    pub message: String,
    pub response: String,
}

pub fn init(path: &std::path::Path) -> Result<Connection, rusqlite::Error> {
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS mac_records (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            mac         TEXT NOT NULL,
            name        TEXT NOT NULL DEFAULT '',
            staff_id    TEXT NOT NULL DEFAULT '',
            remark      TEXT NOT NULL DEFAULT '',
            created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sync_log (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            time     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            success  INTEGER NOT NULL DEFAULT 0,
            count    INTEGER NOT NULL DEFAULT 0,
            message  TEXT NOT NULL DEFAULT '',
            response TEXT NOT NULL DEFAULT ''
        );",
    )?;
    Ok(conn)
}

// ---------- 设置 ----------

/// 默认设置（与 absort.js 中的调用参数一致）
pub fn default_settings() -> serde_json::Value {
    serde_json::json!({
        "server_url": "",
        "username": "",
        "password": "",
        "auth_type_name": "local",
        "verify_code": "",
        "email_code": "",
        "action": "local_login",
        "palang": "ch",
        "remember": true,
        "auto_sync": false
    })
}

pub fn read_settings(conn: &Connection) -> serde_json::Value {
    let mut settings = default_settings();
    if let Ok(mut stmt) = conn.prepare("SELECT key, value FROM settings") {
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        });
        if let Ok(rows) = rows {
            for (key, raw) in rows.flatten() {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) {
                    if let Some(obj) = settings.as_object_mut() {
                        obj.insert(key, value);
                    }
                }
            }
        }
    }
    // 未记住密码时不返回已存密码
    if settings.get("remember") != Some(&serde_json::Value::Bool(true)) {
        if let Some(obj) = settings.as_object_mut() {
            obj.insert("password".into(), serde_json::json!(""));
        }
    }
    settings
}

#[tauri::command]
pub fn get_settings(state: State<'_, Mutex<Connection>>) -> Result<serde_json::Value, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    Ok(read_settings(&conn))
}

#[tauri::command]
pub fn save_settings(
    state: State<'_, Mutex<Connection>>,
    settings: serde_json::Value,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let obj = settings.as_object().ok_or("设置格式错误")?;
    let mut current = read_settings(&conn);
    let current_obj = current
        .as_object_mut()
        .ok_or("设置格式错误")?;
    for (k, v) in obj {
        // 密码为空且未勾选记住密码时保留原密码
        if k == "password" && v.as_str() == Some("") {
            continue;
        }
        current_obj.insert(k.clone(), v.clone());
    }
    let merged = current;
    for (k, v) in merged.as_object().unwrap() {
        conn.execute(
            "INSERT INTO settings(key, value) VALUES(?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = ?2",
            params![k, v.to_string()],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------- MAC 记录 ----------

fn row_to_record(row: &rusqlite::Row) -> rusqlite::Result<MacRecord> {
    Ok(MacRecord {
        id: row.get(0)?,
        mac: row.get(1)?,
        name: row.get(2)?,
        staff_id: row.get(3)?,
        remark: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

#[tauri::command]
pub fn list_macs(state: State<'_, Mutex<Connection>>) -> Result<Vec<MacRecord>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, mac, name, staff_id, remark, created_at, updated_at FROM mac_records ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], row_to_record)
        .map_err(|e| e.to_string())?;
    Ok(rows.flatten().collect())
}

fn validate_mac(mac: &str) -> Result<String, String> {
    let mac = mac.trim().to_string();
    if mac.is_empty() {
        return Err("MAC 地址不能为空".into());
    }
    let normalized: String = mac.to_lowercase();
    let re = regex_lite();
    if !re.is_match(&normalized) {
        return Err(format!("MAC 地址格式不正确: {mac}"));
    }
    Ok(normalized)
}

// 简单的 MAC 格式校验（xx:xx:... / xx-xx-... / 纯十六进制）
fn regex_lite() -> &'static regex_lite::Regex {
    use std::sync::OnceLock;
    static RE: OnceLock<regex_lite::Regex> = OnceLock::new();
    RE.get_or_init(|| {
        regex_lite::Regex::new(r"^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$|^[0-9a-f]{12}$").unwrap()
    })
}

fn insert_record(conn: &Connection, r: &NewMacRecord) -> Result<(), String> {
    let mac = validate_mac(&r.mac)?;
    conn.execute(
        "INSERT INTO mac_records(mac, name, staff_id, remark) VALUES(?1, ?2, ?3, ?4)",
        params![mac, r.name.trim(), r.staff_id.trim(), r.remark.trim()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn add_mac(state: State<'_, Mutex<Connection>>, record: NewMacRecord) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    insert_record(&conn, &record)
}

#[tauri::command]
pub fn update_mac(
    state: State<'_, Mutex<Connection>>,
    id: i64,
    record: NewMacRecord,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let mac = validate_mac(&record.mac)?;
    let n = conn
        .execute(
            "UPDATE mac_records SET mac=?1, name=?2, staff_id=?3, remark=?4,
             updated_at=datetime('now','localtime') WHERE id=?5",
            params![
                mac,
                record.name.trim(),
                record.staff_id.trim(),
                record.remark.trim(),
                id
            ],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("记录不存在".into());
    }
    Ok(())
}

#[tauri::command]
pub fn delete_macs(state: State<'_, Mutex<Connection>>, ids: Vec<i64>) -> Result<usize, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let mut n = 0;
    for id in ids {
        n += conn
            .execute("DELETE FROM mac_records WHERE id=?1", params![id])
            .map_err(|e| e.to_string())?;
    }
    Ok(n)
}

#[tauri::command]
pub fn clear_macs(state: State<'_, Mutex<Connection>>) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM mac_records", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 批量导入（Excel 导入用），自动按 MAC 去重，返回新增条数
#[tauri::command]
pub fn bulk_add_macs(
    state: State<'_, Mutex<Connection>>,
    records: Vec<NewMacRecord>,
) -> Result<usize, String> {
    let mut conn = state.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut seen = std::collections::HashSet::new();
    // 已存在的 MAC 也跳过
    {
        let mut stmt = tx
            .prepare("SELECT mac FROM mac_records")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        for mac in rows.flatten() {
            seen.insert(mac.to_lowercase());
        }
    }
    let mut count = 0;
    let mut errors: Vec<String> = Vec::new();
    for r in &records {
        let mac = match validate_mac(&r.mac) {
            Ok(m) => m,
            Err(e) => {
                errors.push(e);
                continue;
            }
        };
        if !seen.insert(mac.clone()) {
            continue; // 重复 MAC 跳过
        }
        tx.execute(
            "INSERT INTO mac_records(mac, name, staff_id, remark) VALUES(?1, ?2, ?3, ?4)",
            params![mac, r.name.trim(), r.staff_id.trim(), r.remark.trim()],
        )
        .map_err(|e| e.to_string())?;
        count += 1;
    }
    tx.commit().map_err(|e| e.to_string())?;
    if count == 0 && !errors.is_empty() {
        return Err(errors.join("; "));
    }
    Ok(count)
}

// ---------- 同步日志 ----------

#[tauri::command]
pub fn list_sync_logs(state: State<'_, Mutex<Connection>>) -> Result<Vec<SyncLog>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, time, success, count, message, response FROM sync_log ORDER BY id DESC LIMIT 50")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(SyncLog {
                id: row.get(0)?,
                time: row.get(1)?,
                success: row.get::<_, i64>(2)? != 0,
                count: row.get(3)?,
                message: row.get(4)?,
                response: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.flatten().collect())
}

pub fn write_sync_log(
    conn: &Connection,
    success: bool,
    count: i64,
    message: &str,
    response: &str,
) {
    let _ = conn.execute(
        "INSERT INTO sync_log(success, count, message, response) VALUES(?1, ?2, ?3, ?4)",
        params![success as i64, count, message, response],
    );
}
