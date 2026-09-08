use crate::db;
use encoding_rs::GBK;
use reqwest::{Client, multipart};
use serde::Serialize;
use std::sync::Mutex;
use std::time::Instant;
use tauri::State;

#[derive(Debug, Clone, Serialize)]
pub struct SyncResult {
    pub success: bool,
    pub status: u16,
    /// 本次同步的 MAC 条数
    pub count: usize,
    /// 服务器响应（已按 GB2312 解码）
    pub response: String,
    /// 耗时（毫秒）
    pub duration_ms: u128,
    pub error: Option<String>,
}

fn setting_str(settings: &serde_json::Value, key: &str) -> String {
    settings
        .get(key)
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string()
}

/// 生成 mac.conf 内容（与 absort.js 一致：`{mac} {工号}-{姓名}`，换行分隔）
pub fn build_conf(records: &[db::MacRecord]) -> String {
    records
        .iter()
        .map(|r| format!("{} {}-{}", r.mac, r.staff_id, r.name))
        .collect::<Vec<_>>()
        .join("\n")
}

#[tauri::command]
pub async fn sync_now(state: State<'_, Mutex<rusqlite::Connection>>) -> Result<SyncResult, String> {
    // 先在锁内取出设置与数据，避免长时间占用数据库锁
    let (settings, records) = {
        let conn = state.lock().map_err(|e| e.to_string())?;
        let settings = db::read_settings(&conn);
        let records = conn
            .prepare("SELECT id, mac, name, staff_id, remark, created_at, updated_at FROM mac_records ORDER BY id")
            .and_then(|mut stmt| {
                stmt.query_map([], |row| {
                    Ok(db::MacRecord {
                        id: row.get(0)?,
                        mac: row.get(1)?,
                        name: row.get(2)?,
                        staff_id: row.get(3)?,
                        remark: row.get(4)?,
                        created_at: row.get(5)?,
                        updated_at: row.get(6)?,
                    })
                })
                .map(|rows| rows.flatten().collect::<Vec<_>>())
            })
            .map_err(|e| e.to_string())?;
        (settings, records)
    };

    let result = do_sync(&settings, &records).await;

    // 写同步日志
    if let Ok(conn) = state.lock() {
        db::write_sync_log(
            &conn,
            result.success,
            result.count as i64,
            result.error.as_deref().unwrap_or("ok"),
            &result.response,
        );
    }
    Ok(result)
}

async fn do_sync(settings: &serde_json::Value, records: &[db::MacRecord]) -> SyncResult {
    let start = Instant::now();
    let server_url = setting_str(settings, "server_url")
        .trim_end_matches('/')
        .to_string();
    let username = setting_str(settings, "username");
    let password = setting_str(settings, "password");
    let auth_type_name = setting_str(settings, "auth_type_name");
    let verify_code = setting_str(settings, "verify_code");
    let email_code = setting_str(settings, "email_code");
    let action = setting_str(settings, "action");
    let palang = setting_str(settings, "palang");

    let count = records.len();
    let fail = |err: String| SyncResult {
        success: false,
        status: 0,
        count,
        response: String::new(),
        duration_ms: start.elapsed().as_millis(),
        error: Some(err),
    };

    if server_url.is_empty() {
        return fail("未配置服务器地址".into());
    }
    if username.is_empty() || password.is_empty() {
        return fail("未配置用户名或密码".into());
    }
    if records.is_empty() {
        return fail("本地没有 MAC 数据，请先添加或导入".into());
    }

    // 服务器为自签名 HTTPS 证书，必须跳过证书校验（与原脚本 NODE_TLS_REJECT_UNAUTHORIZED=0 一致）
    let client = match Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(std::time::Duration::from_secs(60))
        .build()
    {
        Ok(c) => c,
        Err(e) => return fail(format!("创建 HTTP 客户端失败: {e}")),
    };

    // 1. 登录
    let login_url = format!("{server_url}/login/user.cgi");
    let login_res = client
        .post(&login_url)
        .query(&[
            ("username", username.as_str()),
            ("password", password.as_str()),
            ("auth_type_name", auth_type_name.as_str()),
            ("verify_code", verify_code.as_str()),
            ("email_code", email_code.as_str()),
            ("action", action.as_str()),
            ("palang", palang.as_str()),
        ])
        .header("content-type", "text/html; charset=GB2312")
        .header("Referer", format!("{server_url}/login/login.cgi"))
        .send()
        .await;

    let login_res = match login_res {
        Ok(r) => r,
        Err(e) => return fail(format!("登录请求失败: {e}")),
    };
    let login_status = login_res.status().as_u16();
    if login_status >= 400 {
        return fail(format!("登录失败，HTTP {login_status}"));
    }

    // 从 set-cookie 提取会话（取第一个 cookie 的第一段）
    let session_cookie = login_res
        .headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok())
        .find_map(|v| v.split(';').next())
        .unwrap_or("")
        .to_string();
    if session_cookie.is_empty() {
        return fail("登录响应中没有 set-cookie，可能用户名/密码或登录参数错误".into());
    }
    let cookie = format!("palang={palang}; {session_cookie}");

    // 2. 生成 mac.conf 内容并编码为 GB2312
    let conf = build_conf(records);
    let (conf_bytes, _, had_errors) = GBK.encode(&conf);
    if had_errors {
        return fail("mac.conf 内容包含无法编码为 GB2312 的字符".into());
    }

    // 3. 上传（multipart，字段与 absort.js 中的抓包一致）
    let fake_path = multipart::Part::text("C:\\fakepath\\mac.conf")
        .mime_str("text/plain")
        .unwrap();
    let action_part = multipart::Part::text("import_freemac");
    let type_part = multipart::Part::text("cover");
    let file_part = multipart::Part::bytes(conf_bytes.into_owned())
        .file_name("mac.conf")
        .mime_str("application/octet-stream")
        .unwrap();
    let form = multipart::Form::new()
        .part("file", fake_path)
        .part("action", action_part)
        .part("type", type_part)
        .part("file", file_part);

    let upload_url = format!("{server_url}/cgi-bin/App/webauth2.0/ajax_freemac");
    let upload_res = client
        .post(&upload_url)
        .header("Cookie", cookie)
        .header("X-Requested-With", "XMLHttpRequest")
        .header("Accept", "application/json, text/javascript, */*; q=0.01")
        .header(
            "Referer",
            format!("{server_url}/cgi-bin/App/webauth2.0/webmain"),
        )
        .multipart(form)
        .send()
        .await;

    let upload_res = match upload_res {
        Ok(r) => r,
        Err(e) => return fail(format!("上传请求失败: {e}")),
    };
    let status = upload_res.status().as_u16();
    let body = upload_res.bytes().await.unwrap_or_default();
    // 响应按 GB2312 解码
    let (text, _, _) = GBK.decode(&body);

    let success = status == 200 && !text.is_empty();
    SyncResult {
        success,
        status,
        count,
        response: text.into_owned(),
        duration_ms: start.elapsed().as_millis(),
        error: if success {
            None
        } else {
            Some(format!("上传返回 HTTP {status}"))
        },
    }
}
