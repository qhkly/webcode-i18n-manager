(function () {
  const tauriInvoke = window.__TAURI__?.core?.invoke;
  const tauriDialog = window.__TAURI__?.dialog;
  const tauriEvent = window.__TAURI__?.event;

  // Fallback settings for browser mode
  const fallbackSettings = {
    project_path: "",
    gemini_api_key: "",
    gemini_model: "gemini-2.5-flash",
  };

  function invoke(command, args) {
    if (!tauriInvoke) {
      // Browser mode: log and return mock data
      console.log(`[Bridge] ${command}`, args);
      if (command === "i18n_load_settings") return Promise.resolve(fallbackSettings);
      if (command === "i18n_save_settings") return Promise.resolve();
      if (command === "i18n_scan") {
        return Promise.resolve({
          locales: [],
          hardcoded: [],
          missing: [],
          wrong_lang: [],
        });
      }
      if (command === "i18n_translation_status") {
        return Promise.resolve({
          api_key_source: "none",
          model: "gemini-2.5-flash",
        });
      }
      if (command === "i18n_scan_dead_keys") return Promise.resolve([]);
      if (command === "i18n_scan_antipatterns") return Promise.resolve([]);
      if (command === "i18n_add_missing_keys") return Promise.resolve(["Mock: Keys added"]);
      if (command === "i18n_clear_wrong_value") return Promise.resolve("Mock: Value cleared");
      if (command === "i18n_delete_dead_keys") return Promise.resolve("Mock: Keys deleted");
      if (command === "i18n_fix_chinese_fallbacks") return Promise.resolve("Mock: Fixed");
      if (command === "i18n_translate") {
        return Promise.resolve({
          translated: 0,
          failed_batches: 0,
          written_total: 0,
          total_keys: 0,
        });
      }
      return Promise.reject(new Error("Tauri bridge is unavailable"));
    }
    return tauriInvoke(command, args);
  }

  // Event listener wrapper
  function listen(eventName, callback) {
    if (!tauriEvent) {
      console.log(`[Bridge] Would listen to ${eventName}`);
      return () => {}; // Return noop cleanup function
    }
    return tauriEvent.listen(eventName, callback);
  }

  // Dialog wrapper
  function openDialog(options) {
    if (!tauriDialog?.open) {
      console.log("[Bridge] Would open dialog", options);
      return Promise.resolve(null);
    }
    return tauriDialog.open(options);
  }

  // ─── Settings ───────────────────────────────────────────────────────────────────
  function loadSettings() {
    return invoke("i18n_load_settings");
  }

  function saveSettings(settings) {
    return invoke("i18n_save_settings", { settings });
  }

  // ─── Scan ───────────────────────────────────────────────────────────────────────
  function scan(projectPath) {
    return invoke("i18n_scan", { projectPath });
  }

  function scanDeadKeys(projectPath) {
    return invoke("i18n_scan_dead_keys", { projectPath });
  }

  function scanAntipatterns(projectPath) {
    return invoke("i18n_scan_antipatterns", { projectPath });
  }

  function translationStatus(projectPath) {
    return invoke("i18n_translation_status", { projectPath });
  }

  // ─── Fix ─────────────────────────────────────────────────────────────────────────
  function addMissingKeys(fixes) {
    return invoke("i18n_add_missing_keys", { fixes });
  }

  function clearWrongValue(localePath, keys) {
    return invoke("i18n_clear_wrong_value", { localePath, keys });
  }

  function deleteDeadKeys(projectPath, keys) {
    return invoke("i18n_delete_dead_keys", { projectPath, keys });
  }

  function fixChineseFallbacks(projectPath) {
    return invoke("i18n_fix_chinese_fallbacks", { projectPath });
  }

  // ─── Translate ───────────────────────────────────────────────────────────────────
  function translate(projectPath, targetLang, keys, sample, overwrite) {
    return invoke("i18n_translate", {
      projectPath,
      targetLang,
      keys,
      sample,
      overwrite,
    });
  }

  function clearTranslationProgress(projectPath, targetLang) {
    return invoke("i18n_translation_clear_progress", { projectPath, targetLang });
  }

  // ─── Events ──────────────────────────────────────────────────────────────────────
  function onTranslateProgress(callback) {
    return listen("i18n:translate:progress", callback);
  }

  // ─── Dialog ──────────────────────────────────────────────────────────────────────
  function pickDirectory(defaultPath) {
    return openDialog({
      multiple: false,
      directory: true,
      defaultPath: defaultPath || undefined,
    });
  }

  function pickFile(defaultPath) {
    return openDialog({
      multiple: false,
      directory: false,
      defaultPath: defaultPath || undefined,
    });
  }

  // ─── Export ──────────────────────────────────────────────────────────────────────
  window.Bridge = {
    // Settings
    loadSettings,
    saveSettings,

    // Scan
    scan,
    scanDeadKeys,
    scanAntipatterns,
    translationStatus,

    // Fix
    addMissingKeys,
    clearWrongValue,
    deleteDeadKeys,
    fixChineseFallbacks,

    // Translate
    translate,
    clearTranslationProgress,

    // Events
    onTranslateProgress,

    // Dialog
    pickDirectory,
    pickFile,
  };

  console.log("[Bridge] Initialized" + (tauriInvoke ? " (Tauri mode)" : " (Browser mode)"));
})();
