(window.i18n = {
  zh: {
    // App
    pageTitle: "i18n 检查工具",
    titlebarText: "i18n 检查工具",

    // Settings panel
    settingsProjectPath: "项目路径",
    settingsPathPlaceholder: "/path/to/webclaw-launcher-tauri",
    settingsBrowse: "浏览…",
    settingsGeminiKey: "Gemini API Key",
    settingsGeminiKeyPlaceholder: "留空回退: GOOGLE_API_KEYS 环境变量 → 内置默认 key（多 key 逗号分隔）",
    settingsModel: "翻译模型",
    settingsModelDefault: "默认 (gemini-2.5-flash)",
    settingsModelFlash: "gemini-2.5-flash（推荐，便宜）",
    settingsModelPro: "gemini-2.5-pro（贵 10×，仅用于难翻译术语）",
    settingsSave: "保存设置",
    settingsCancel: "取消",

    // Locale bar
    loadedLanguages: "已加载语言：",

    // Toolbar
    scanBtn: "扫描",
    settingsBtn: "设置",

    // Tabs
    tabHardcoded: "硬编码字符串",
    tabMissing: "缺失翻译",
    tabWrong: "语言错误",
    tabDead: "死键",
    tabAntiPattern: "反模式",

    // Tab 1: Hardcoded
    filterHardcodedPlaceholder: "搜索文件名或内容…",
    langJS: "JS",
    langHTML: "HTML",
    langRust: "Rust",
    langShell: "Shell",
    includeComments: "含注释",
    colFile: "文件",
    colLine: "行号",
    colType: "类型",
    colChinese: "中文内容",
    colContext: "代码上下文",
    emptyHardcoded: "未发现硬编码中文字符串",
    countFormat: "{0} 处",
    countFilterFormat: "{0} / {1} 处",

    // Tab 2: Missing
    allMissingLanguages: "所有缺失语言",
    filterMissingKeyPlaceholder: "搜索键名或内容…",
    translateSelected: "翻译选中",
    translateLocale: "翻译此语种全部缺失",
    fillBlank: "补全为空白",
    preparing: "准备中…",
    closePanel: "关闭面板",
    closeBtn: "×",
    colKey: "键名",
    colZhValue: "中文值",
    colEnValue: "英文值",
    colMissingLanguages: "缺失语言",
    emptyMissing: "所有键均已在各语言中配置",
    translateSelectedTitle: "使用 Gemini 翻译选中的键",
    translateLocaleTitle: "翻译当前筛选语言所有缺失键",
    noApiKeyTitle: "请先到设置页配置 Gemini API Key",
    fillBlankBtn: "补全为空白",
    fillBlankWithCount: "补全为空白 ({0} 项)",
    translateSelectedWithCount: "翻译选中 ({0})",
    translateLocaleWithCount: "翻译此语种全部缺失 ({0})",
    preparingTranslate: "准备翻译 {0}…",
    startTranslateLog: "开始翻译 {0}{1}",
    translateDoneLog: "翻译完成，正在重新扫描…",
    translateFailedLog: "{0} 翻译失败: {1}",
    addingKeysLog: "正在添加 {0} 个键…",
    fillFailedLog: "修复失败: {0}",

    // Tab 3: Wrong
    allLanguages: "所有语言",
    allProblemTypes: "所有问题类型",
    sameAsEnglish: "与英文相同",
    containsChinese: "含中文字符",
    clearFiltered: "清空筛选",
    retranslateSelected: "翻译选中",
    retranslateFiltered: "翻译筛选全部",
    colLanguage: "语言",
    colCurrentValue: "当前值（错误）",
    colEnRef: "英文参考值",
    colProblemType: "问题类型",
    colAction: "操作",
    emptyWrong: "未发现语言配置错误",
    clearBtn: "清空",
    clearWithCount: "清空筛选 ({0})",
    retranslateSelectedWithCount: "翻译选中 ({0})",
    retranslateFilteredWithCount: "翻译筛选全部 ({0})",
    noApiKeyHint: "请先到设置页配置 Gemini API Key",
    retranslateSelectedTitle: "使用 Gemini 重新翻译选中的值",
    retranslateFilteredTitle: "翻译当前筛选条件下所有错误值",
    preparingRetranslate: "准备重译 {0} 项（{1} 个语种）…",
    clearingLog: "正在清空 {0} 个错误值…",
    clearFailedLog: "清空失败: {0}",
    sameAsEnglishLabel: "与英文相同",
    containsChineseLabel: "含中文字符",

    // Tab 4: Dead keys
    filterDeadPlaceholder: "搜索键名或中文值…",
    scanDeadKeys: "扫描死键",
    deleteSelected: "删除选中",
    deadHint: '死键 = zh-CN 中存在但代码里没引用的键。带 <code>${"${...}"}</code> 模板拼接的动态键会启发式跳过（按前缀匹配）。删除前自动备份到 <code>.i18n-backup/</code>。',
    colDeadKey: "键名",
    colDeadZhValue: "中文值",
    emptyDead: "未发现死键（请先点击「扫描死键」）",
    scanningDeadLog: "扫描死键…",
    scanDeadCompleteLog: "扫描完成 — 发现 {0} 个死键",
    scanDeadFailedLog: "扫描死键失败: {0}",
    deleteConfirm: "将从所有 locale 文件删除 {0} 个键，并备份到 .i18n-backup/。继续？",
    deletingLog: "删除 {0} 个死键…",
    deleteFailedLog: "删除失败: {0}",
    countDeadFormat: "{0} 个",
    countDeadFilterFormat: "{0} / {1} 个",
    deleteSelectedWithCount: "删除选中 ({0})",

    // Tab 5: Anti-patterns
    allAntiPatterns: "所有反模式",
    chineseFallback: "中文兜底 (|| '中文')",
    keyLeadingSpace: "key 前导空格",
    undefinedKey: "未定义的 key",
    scanAntiPatterns: "扫描反模式",
    fixChineseFallbacks: "批量自动修复中文兜底",
    antiPatternHint: '自动修复仅处理 <code>t(\'xxx\') || \'中文\'</code> 这种兜底（删除后半段，因 i18n 已有 zh-CN 顶层回退）。<code>key_leading_space</code> 和 <code>undefined_key</code> 需手动修。',
    colAntiFile: "文件",
    colAntiLine: "行号",
    colAntiType: "类型",
    colAntiKey: "key",
    colAntiContext: "代码上下文",
    emptyAntiPattern: "未发现反模式（请先点击「扫描反模式」）",
    scanningAntiPatternLog: "扫描反模式…",
    scanAntiPatternCompleteLog: "扫描完成 — 发现 {0} 处反模式",
    scanAntiPatternFailedLog: "扫描反模式失败: {0}",
    fixConfirm: '将自动删除所有 t(...) || "中文" 模式的后半段（保留 t() 调用，依赖 zh-CN 顶层回退）。文件会备份到 .i18n-backup/。继续？',
    fixingAntiPatternLog: "修复中文兜底反模式…",
    fixAntiPatternFailedLog: "修复失败: {0}",
    countAntiFormat: "{0} 处",
    countAntiFilterFormat: "{0} / {1} 处",
    batchFixFormat: "批量自动修复中文兜底 ({0})",

    // Log panel
    logPanel: "操作日志",
    logArrowUp: "▲",
    logArrowDown: "▼",

    // Scanning overlay
    scanningOverlay: "正在扫描…",

    // Theme
    themeSystem: "跟随系统",
    themeLight: "浅色",
    themeDark: "深色",

    // Misc
    browseFailed: "浏览文件夹失败: {0}",
    settingsSaved: "设置已保存",
    saveSettingsFailed: "保存设置失败: {0}",
    notConfigured: "未配置项目路径",
    apiStatusUser: "用户配置",
    apiStatusEnv: "环境变量",
    apiStatusDefault: "内置默认",
    apiStatusNone: "未配置",
    apiStatusTitle: "翻译模型: {0}\nAPI Key 来源: {1}",
    apiStatusHint: "\n\n提示：未填写 API Key 也未读到 GOOGLE_API_KEYS 环境变量，正在使用内置默认 key（与 webclaw-launcher-tauri 共享）。",
    startScanLog: "开始扫描…",
    scanCompleteLog: "扫描完成 — 硬编码: {0}, 缺失翻译: {1}, 语言错误: {2}",
    scanFailedLog: "扫描失败: {0}",
    keysCountFormat: "{0} 个键",
    countItemsFormat: "{0} 处",
    countItemsFilterFormat: "{0} / {1} 处",
    pleaseConfigApiKey: "请先到设置页配置 Gemini API Key",
    retranslateDoneLog: "重译完成，正在重新扫描…",
    retranslateFailedLog: "{0} 重译失败: {0}",

    // Language toggle
    langToggleToEn: "切换到英文",
    langToggleToZh: "切换到中文",

    // Rust/Shell kind labels
    kindRustError: "Rust 错误",
    kindRustVisible: "Rust 可见",
    kindRustInternal: "Rust 内部",
    kindRustComment: "Rust 注释",
    kindRustDocComment: "Rust 文档",
    kindShellOutput: "Shell 输出",
    kindShellInternal: "Shell 内部",
    kindShellComment: "Shell 注释",

    // Anti-pattern kind labels
    kindChineseFallback: "中文兜底",
    kindKeyLeadingSpace: "key 前导空格",
    kindUndefinedKey: "未定义 key",

    // Translation progress
    translateProgressStart: "{0}: {1} 个键 / {2} 批",
    translateProgressStartLine: "[{0}] 开始 — {1} 键 / {2} 批",
    translateProgressBatch: "{0}: 批次 {1}/{2} 完成",
    translateProgressBatchLine: "[{0}] 批次 {1}/{2}: {3}/{4}",
    translateProgressRetry: "[{0}] 批次 {1} 重试 {2}: {3}",
    translateProgressBatchFailed: "[{0}] 批次 {1} 失败: {2}",
    translateProgressDone: "{0}: {1}/{2} 已写入",
    translateProgressDoneLine: "[{0}] 完成 — {1}/{2}",

    // Report log
    reportLog: "{0}: 新译 {1} 条 / 失败 {2} 批 / 写入 {3}/{4}",
    retranslateReportLog: "{0}: 新译 {1} / 失败批次 {2}",
  },

  en: {
    // App
    pageTitle: "i18n Checker",
    titlebarText: "i18n Checker",

    // Settings panel
    settingsProjectPath: "Project Path",
    settingsPathPlaceholder: "/path/to/webclaw-launcher-tauri",
    settingsBrowse: "Browse…",
    settingsGeminiKey: "Gemini API Key",
    settingsGeminiKeyPlaceholder: "Leave empty to fallback: GOOGLE_API_KEYS env → built-in defaults (comma-separated)",
    settingsModel: "Translation Model",
    settingsModelDefault: "Default (gemini-2.5-flash)",
    settingsModelFlash: "gemini-2.5-flash (recommended, cheaper)",
    settingsModelPro: "gemini-2.5-pro (10× cost, only for difficult terms)",
    settingsSave: "Save Settings",
    settingsCancel: "Cancel",

    // Locale bar
    loadedLanguages: "Loaded languages:",

    // Toolbar
    scanBtn: "Scan",
    settingsBtn: "Settings",

    // Tabs
    tabHardcoded: "Hardcoded Strings",
    tabMissing: "Missing Translations",
    tabWrong: "Language Errors",
    tabDead: "Dead Keys",
    tabAntiPattern: "Anti-patterns",

    // Tab 1: Hardcoded
    filterHardcodedPlaceholder: "Search file name or content…",
    langJS: "JS",
    langHTML: "HTML",
    langRust: "Rust",
    langShell: "Shell",
    includeComments: "Include Comments",
    colFile: "File",
    colLine: "Line",
    colType: "Type",
    colChinese: "Chinese Text",
    colContext: "Code Context",
    emptyHardcoded: "No hardcoded Chinese strings found",
    countFormat: "{0} items",
    countFilterFormat: "{0} / {1} items",

    // Tab 2: Missing
    allMissingLanguages: "All Missing Languages",
    filterMissingKeyPlaceholder: "Search key or content…",
    translateSelected: "Translate Selected",
    translateLocale: "Translate All Missing for This Language",
    fillBlank: "Fill as Blank",
    preparing: "Preparing…",
    closePanel: "Close Panel",
    closeBtn: "×",
    colKey: "Key",
    colZhValue: "Chinese Value",
    colEnValue: "English Value",
    colMissingLanguages: "Missing Languages",
    emptyMissing: "All keys are configured in all languages",
    translateSelectedTitle: "Translate selected keys using Gemini",
    translateLocaleTitle: "Translate all missing keys for the current filtered language",
    noApiKeyTitle: "Please configure Gemini API Key in Settings first",
    fillBlankBtn: "Fill as Blank",
    fillBlankWithCount: "Fill as Blank ({0})",
    translateSelectedWithCount: "Translate Selected ({0})",
    translateLocaleWithCount: "Translate All Missing ({0})",
    preparingTranslate: "Preparing to translate {0}…",
    startTranslateLog: "Starting translation for {0}{1}",
    translateDoneLog: "Translation done, re-scanning…",
    translateFailedLog: "{0} translation failed: {1}",
    addingKeysLog: "Adding {0} keys…",
    fillFailedLog: "Fix failed: {0}",

    // Tab 3: Wrong
    allLanguages: "All Languages",
    allProblemTypes: "All Problem Types",
    sameAsEnglish: "Same as English",
    containsChinese: "Contains Chinese Characters",
    clearFiltered: "Clear Filtered",
    retranslateSelected: "Translate Selected",
    retranslateFiltered: "Translate All Filtered",
    colLanguage: "Language",
    colCurrentValue: "Current Value (Error)",
    colEnRef: "English Reference",
    colProblemType: "Problem Type",
    colAction: "Action",
    emptyWrong: "No language configuration errors found",
    clearBtn: "Clear",
    clearWithCount: "Clear Filtered ({0})",
    retranslateSelectedWithCount: "Translate Selected ({0})",
    retranslateFilteredWithCount: "Translate All Filtered ({0})",
    noApiKeyHint: "Please configure Gemini API Key in Settings first",
    retranslateSelectedTitle: "Re-translate selected values using Gemini",
    retranslateFilteredTitle: "Translate all error values under current filter",
    preparingRetranslate: "Preparing to re-translate {0} items ({1} languages)…",
    clearingLog: "Clearing {0} error values…",
    clearFailedLog: "Clear failed: {0}",
    sameAsEnglishLabel: "Same as English",
    containsChineseLabel: "Contains Chinese Characters",

    // Tab 4: Dead keys
    filterDeadPlaceholder: "Search key or Chinese value…",
    scanDeadKeys: "Scan Dead Keys",
    deleteSelected: "Delete Selected",
    deadHint: 'Dead keys = keys present in zh-CN but not referenced in code. Dynamic keys with <code>${"${...}"}</code> templates are heuristically skipped (prefix matching). Auto-backup to <code>.i18n-backup/</code> before deletion.',
    colDeadKey: "Key",
    colDeadZhValue: "Chinese Value",
    emptyDead: "No dead keys found (click \"Scan Dead Keys\" first)",
    scanningDeadLog: "Scanning dead keys…",
    scanDeadCompleteLog: "Scan complete — found {0} dead keys",
    scanDeadFailedLog: "Scan dead keys failed: {0}",
    deleteConfirm: "This will delete {0} keys from all locale files and backup to .i18n-backup/. Continue?",
    deletingLog: "Deleting {0} dead keys…",
    deleteFailedLog: "Delete failed: {0}",
    countDeadFormat: "{0} keys",
    countDeadFilterFormat: "{0} / {1} keys",
    deleteSelectedWithCount: "Delete Selected ({0})",

    // Tab 5: Anti-patterns
    allAntiPatterns: "All Anti-patterns",
    chineseFallback: "Chinese Fallback (|| '中文')",
    keyLeadingSpace: "Key Leading Space",
    undefinedKey: "Undefined Key",
    scanAntiPatterns: "Scan Anti-patterns",
    fixChineseFallbacks: "Batch Auto-fix Chinese Fallbacks",
    antiPatternHint: 'Auto-fix only handles <code>t(\'xxx\') || \'中文\'</code> pattern (removes the fallback, relies on zh-CN top-level fallback). <code>key_leading_space</code> and <code>undefined_key</code> need manual fixes.',
    colAntiFile: "File",
    colAntiLine: "Line",
    colAntiType: "Type",
    colAntiKey: "Key",
    colAntiContext: "Code Context",
    emptyAntiPattern: "No anti-patterns found (click \"Scan Anti-patterns\" first)",
    scanningAntiPatternLog: "Scanning anti-patterns…",
    scanAntiPatternCompleteLog: "Scan complete — found {0} anti-patterns",
    scanAntiPatternFailedLog: "Scan anti-patterns failed: {0}",
    fixConfirm: 'This will auto-remove the fallback part of all t(...) || "中文" patterns (keeping t() call, relying on zh-CN top-level fallback). Files will be backed up to .i18n-backup/. Continue?',
    fixingAntiPatternLog: "Fixing Chinese fallback anti-patterns…",
    fixAntiPatternFailedLog: "Fix failed: {0}",
    countAntiFormat: "{0} items",
    countAntiFilterFormat: "{0} / {1} items",
    batchFixFormat: "Batch Auto-fix Chinese Fallbacks ({0})",

    // Log panel
    logPanel: "Operation Log",
    logArrowUp: "▲",
    logArrowDown: "▼",

    // Scanning overlay
    scanningOverlay: "Scanning…",

    // Theme
    themeSystem: "Follow System",
    themeLight: "Light",
    themeDark: "Dark",

    // Misc
    browseFailed: "Failed to browse folder: {0}",
    settingsSaved: "Settings saved",
    saveSettingsFailed: "Failed to save settings: {0}",
    notConfigured: "No project path configured",
    apiStatusUser: "User Config",
    apiStatusEnv: "Environment Variable",
    apiStatusDefault: "Built-in Default",
    apiStatusNone: "Not Configured",
    apiStatusTitle: "Translation Model: {0}\nAPI Key Source: {1}",
    apiStatusHint: "",
    startScanLog: "Starting scan…",
    scanCompleteLog: "Scan complete — Hardcoded: {0}, Missing: {1}, Language Errors: {2}",
    scanFailedLog: "Scan failed: {0}",
    keysCountFormat: "{0} keys",
    countItemsFormat: "{0} items",
    countItemsFilterFormat: "{0} / {1} items",
    pleaseConfigApiKey: "Please configure Gemini API Key in Settings first",
    retranslateDoneLog: "Re-translation done, re-scanning…",
    retranslateFailedLog: "{0} re-translation failed: {1}",

    // Language toggle
    langToggleToEn: "Switch to English",
    langToggleToZh: "Switch to Chinese",

    // Rust/Shell kind labels
    kindRustError: "Rust Error",
    kindRustVisible: "Rust Visible",
    kindRustInternal: "Rust Internal",
    kindRustComment: "Rust Comment",
    kindRustDocComment: "Rust Doc Comment",
    kindShellOutput: "Shell Output",
    kindShellInternal: "Shell Internal",
    kindShellComment: "Shell Comment",

    // Anti-pattern kind labels
    kindChineseFallback: "Chinese Fallback",
    kindKeyLeadingSpace: "Key Leading Space",
    kindUndefinedKey: "Undefined Key",

    // Translation progress
    translateProgressStart: "{0}: {1} keys / {2} batches",
    translateProgressStartLine: "[{0}] Starting — {1} keys / {2} batches",
    translateProgressBatch: "{0}: batch {1}/{2} done",
    translateProgressBatchLine: "[{0}] batch {1}/{2}: {3}/{4}",
    translateProgressRetry: "[{0}] batch {1} retry {2}: {3}",
    translateProgressBatchFailed: "[{0}] batch {1} failed: {2}",
    translateProgressDone: "{0}: {1}/{2} written",
    translateProgressDoneLine: "[{0}] Done — {1}/{2}",

    // Report log
    reportLog: "{0}: translated {1} / failed batches {2} / written {3}/{4}",
    retranslateReportLog: "{0}: re-translated {1} / failed batches {2}",
  },
});

// Translation function
window.i18n.t = function(key, ...args) {
  const lang = window.i18n.currentLang || 'zh';
  let value = window.i18n[lang]?.[key];
  if (value === undefined) value = key;
  args.forEach((arg, i) => {
    value = value.replace(`{${i}}`, String(arg));
  });
  return value;
};

// Set current language (backward compatible)
window.i18n.setLang = function(lang) {
  window.i18n.currentLang = lang;
  localStorage.setItem('i18n-manager.lang', lang);
  // Dispatch both events for compatibility
  window.dispatchEvent(new CustomEvent('i18n-change', { detail: { locale: lang } }));
  window.dispatchEvent(new CustomEvent('localechange', { detail: { locale: lang } }));
};

// Alias for git-manager compatibility
window.i18n.setLocale = window.i18n.setLang;

// Get current language (backward compatible)
window.i18n.getLang = function() {
  return window.i18n.currentLang || localStorage.getItem('i18n-manager.lang') || 'zh';
};

// Alias for git-manager compatibility
window.i18n.getLocale = window.i18n.getLang;

// Reload i18n (triggers re-apply of translations)
window.i18n.reload = function() {
  const lang = window.i18n.getLang();
  window.i18n.currentLang = lang;
  window.i18n.applyTranslations();
};

// Apply translations to DOM elements with data-i18n attribute
window.i18n.applyTranslations = function() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const text = window.i18n.t(key);
    if (el.tagName === 'TITLE') {
      document.title = text;
    } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      // skip, handled by data-i18n-placeholder
    } else {
      el.innerHTML = text;
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = window.i18n.t(key);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    el.title = window.i18n.t(key);
  });
};

// Initialize language
window.i18n.currentLang = window.i18n.getLang();

// Apply on load
document.addEventListener('DOMContentLoaded', function() {
  window.i18n.applyTranslations();
});

// Re-apply on language change
window.addEventListener('i18n-change', function() {
  window.i18n.applyTranslations();
});
