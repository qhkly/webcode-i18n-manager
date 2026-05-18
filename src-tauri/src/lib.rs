mod commands;
use commands::i18n_commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            i18n_load_settings,
            i18n_save_settings,
            i18n_scan,
            i18n_add_missing_keys,
            i18n_clear_wrong_value,
            i18n_translate,
            i18n_translation_status,
            i18n_translation_clear_progress,
            i18n_scan_dead_keys,
            i18n_scan_antipatterns,
            i18n_delete_dead_keys,
            i18n_fix_chinese_fallbacks,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {});
}
