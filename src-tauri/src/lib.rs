mod db;
mod sync;

use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let conn = db::init(&data_dir.join("syncmac.db"))
                .map_err(|e| format!("初始化数据库失败: {e}"))?;
            app.manage(Mutex::new(conn));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::get_settings,
            db::save_settings,
            db::list_macs,
            db::add_mac,
            db::update_mac,
            db::delete_macs,
            db::clear_macs,
            db::bulk_add_macs,
            db::list_sync_logs,
            sync::sync_now,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
