use std::collections::HashMap;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use regex::Regex;

// ─── Data types ──────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LocaleData {
    pub code: String,
    pub path: String,
    pub messages: HashMap<String, String>,
    pub key_order: Vec<String>,
    pub total_keys: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HardcodedIssue {
    pub file: String,
    pub line: u32,
    pub text: String,
    pub context: String,
    /// Language: "js" | "html" | "rust" | "shell"
    pub language: String,
    /// Subkind, e.g. "js" / "html" / "rust_user_error" / "rust_user_visible" /
    /// "rust_internal" / "rust_comment" / "rust_doc_comment" /
    /// "shell_user_output" / "shell_comment" / "shell_internal".
    pub kind: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MissingKeyIssue {
    pub key: String,
    pub zh_cn_value: String,
    pub en_us_value: String,
    pub missing_in: Vec<String>,
    pub present_in: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WrongLangIssue {
    pub locale: String,
    pub locale_path: String,
    pub key: String,
    pub current_value: String,
    pub en_us_value: String,
    pub issue_type: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ScanResult {
    pub locales: Vec<LocaleData>,
    pub hardcoded: Vec<HardcodedIssue>,
    pub missing: Vec<MissingKeyIssue>,
    pub wrong_lang: Vec<WrongLangIssue>,
    pub errors: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
pub struct Settings {
    pub project_path: String,
    pub gemini_api_key: String,
    pub gemini_model: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct KeyFix {
    pub locale_path: String,
    pub key: String,
    pub value: String,
}

// ─── Settings ─────────────────────────────────────────────────────────────────

impl Default for Settings {
    fn default() -> Self {
        let default_path = dirs::home_dir()
            .unwrap_or_default()
            .join("智能体/webcode/webclaw-launcher-tauri")
            .to_string_lossy()
            .to_string();
        Settings {
            project_path: default_path,
            gemini_api_key: String::new(),
            gemini_model: String::new(),
        }
    }
}

fn settings_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_default())
        .join("webcode-i18n-manager")
        .join("settings.json")
}

#[tauri::command]
pub fn i18n_load_settings() -> Settings {
    let path = settings_path();
    if let Ok(data) = std::fs::read_to_string(&path) {
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        Settings::default()
    }
}

#[tauri::command]
pub fn i18n_save_settings(settings: Settings) -> Result<(), String> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

// ─── Locale file parser ───────────────────────────────────────────────────────

fn parse_locale_file(path: &Path) -> Result<LocaleData, String> {
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;

    let code_re = Regex::new(r"code:\s*'([^']+)'").unwrap();
    let code = code_re
        .captures(&content)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
        .unwrap_or_else(|| {
            path.file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string()
        });

    let mut messages: HashMap<String, String> = HashMap::new();
    let mut key_order: Vec<String> = Vec::new();
    let mut in_messages = false;

    // Matches: `    key: 'value'` or `    key: "value"` (4+ spaces)
    let kv_sq = Regex::new(r#"^\s{2,}(\w+):\s+'((?:[^'\\]|\\.)*)',?"#).unwrap();
    let kv_dq = Regex::new(r#"^\s{2,}(\w+):\s+"((?:[^"\\]|\\.)*)",?"#).unwrap();

    for line in content.lines() {
        let trimmed = line.trim();

        if !in_messages {
            if trimmed.starts_with("messages:") && trimmed.contains('{') {
                in_messages = true;
            }
            continue;
        }

        // Closing brace of messages block (2-space indent)
        let indent = line.len() - line.trim_start().len();
        if (trimmed == "}," || trimmed == "}") && indent <= 2 {
            break;
        }

        if trimmed.starts_with("//") {
            continue;
        }

        if let Some(caps) = kv_sq.captures(line).or_else(|| kv_dq.captures(line)) {
            let key = caps[1].to_string();
            let value = caps[2]
                .replace("\\'", "'")
                .replace("\\\"", "\"")
                .replace("\\\\", "\\");
            if !messages.contains_key(&key) {
                key_order.push(key.clone());
                messages.insert(key, value);
            }
        }
    }

    let total_keys = messages.len();
    Ok(LocaleData {
        code,
        path: path.to_string_lossy().to_string(),
        messages,
        key_order,
        total_keys,
    })
}

fn load_locale_files(project_path: &str) -> Result<Vec<LocaleData>, String> {
    let locales_dir = Path::new(project_path).join("src").join("locales");
    if !locales_dir.exists() {
        return Err(format!("未找到 locales 目录: {}", locales_dir.display()));
    }

    let mut locales = Vec::new();
    let entries = std::fs::read_dir(&locales_dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("js") {
            match parse_locale_file(&path) {
                Ok(locale) => locales.push(locale),
                Err(e) => eprintln!("解析失败 {}: {}", path.display(), e),
            }
        }
    }

    // Sort: zh-CN first, en-US second, then alphabetical
    locales.sort_by(|a, b| {
        let order = |code: &str| match code {
            "zh-CN" => 0,
            "en-US" => 1,
            _ => 2,
        };
        let oa = order(&a.code);
        let ob = order(&b.code);
        oa.cmp(&ob).then(a.code.cmp(&b.code))
    });

    Ok(locales)
}

// ─── Hardcoded string detection ───────────────────────────────────────────────

fn contains_chinese(text: &str) -> bool {
    text.chars().any(|c| ('\u{4e00}'..='\u{9fa5}').contains(&c))
}

fn is_i18n_safe_line(line: &str) -> bool {
    let trimmed = line.trim();
    // Comment lines
    if trimmed.starts_with("//")
        || trimmed.starts_with('*')
        || trimmed.starts_with("/*")
        || trimmed.starts_with("<!--")
    {
        return true;
    }
    // Already wrapped in i18n call or attribute
    if trimmed.contains("t('")
        || trimmed.contains("t(\"")
        || trimmed.contains("i18n.t(")
        || trimmed.contains("window.i18n")
        || trimmed.contains("getMessage(")
    {
        return true;
    }
    // HTML element with data-i18n fallback: <span data-i18n="key">中文</span>
    if trimmed.contains("data-i18n") && trimmed.contains("</") {
        return true;
    }
    false
}

fn extract_chinese_phrases(text: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut current = String::new();

    for ch in text.chars() {
        let is_cjk = ('\u{4e00}'..='\u{9fa5}').contains(&ch);
        let is_cjk_punct = matches!(
            ch,
            '，' | '。' | '、' | '！' | '？' | '：' | '；'
                | '\u{201c}' | '\u{201d}' // ""
                | '（' | '）' | '【' | '】'
                | '…' | '—' | '·'
        );
        if is_cjk || is_cjk_punct {
            current.push(ch);
        } else {
            if !current.is_empty() {
                // Only keep if it has at least 2 CJK characters
                let cjk_count = current
                    .chars()
                    .filter(|c| ('\u{4e00}'..='\u{9fa5}').contains(c))
                    .count();
                if cjk_count >= 2 {
                    result.push(current.trim().to_string());
                }
                current = String::new();
            }
        }
    }
    if !current.is_empty() {
        let cjk_count = current
            .chars()
            .filter(|c| ('\u{4e00}'..='\u{9fa5}').contains(c))
            .count();
        if cjk_count >= 2 {
            result.push(current.trim().to_string());
        }
    }
    result
}

struct ScanContext<'a> {
    locales_dir: &'a Path,
    i18n_file: &'a Path,
    project_root: &'a Path,
}

fn scan_hardcoded(project_path: &str) -> Vec<HardcodedIssue> {
    let project_root = Path::new(project_path);
    let locales_dir = project_root.join("src").join("locales");
    let i18n_file = project_root.join("src").join("i18n.js");

    let ctx = ScanContext {
        locales_dir: &locales_dir,
        i18n_file: &i18n_file,
        project_root,
    };
    let mut issues = Vec::new();

    // Frontend: src/
    let frontend = project_root.join("src");
    if frontend.exists() {
        scan_dir_for_hardcoded(&frontend, &ctx, &mut issues);
    }
    // Rust: src-tauri/src/
    let rust_dir = project_root.join("src-tauri").join("src");
    if rust_dir.exists() {
        scan_dir_for_hardcoded(&rust_dir, &ctx, &mut issues);
    }
    // Shell: scripts/
    let scripts_dir = project_root.join("scripts");
    if scripts_dir.exists() {
        scan_dir_for_hardcoded(&scripts_dir, &ctx, &mut issues);
    }
    issues
}

fn skip_dir(name: &str) -> bool {
    matches!(
        name,
        "node_modules" | "target" | "dist" | "build" | ".git" | ".i18n-progress" | ".i18n-backup"
    )
}

fn scan_dir_for_hardcoded(dir: &Path, ctx: &ScanContext, issues: &mut Vec<HardcodedIssue>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();

        if path.is_dir() {
            if path == ctx.locales_dir {
                continue;
            }
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            if skip_dir(&name) {
                continue;
            }
            scan_dir_for_hardcoded(&path, ctx, issues);
            continue;
        }

        let ext = path.extension().and_then(|e| e.to_str());
        let lang = match ext {
            Some("js") | Some("mjs") | Some("cjs") => "js",
            Some("html") | Some("htm") => "html",
            Some("rs") => "rust",
            Some("sh") | Some("bash") => "shell",
            _ => continue,
        };

        // Skip the i18n loader itself
        if path == ctx.i18n_file {
            continue;
        }

        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let display_name = path
            .strip_prefix(ctx.project_root)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string();

        match lang {
            "js" | "html" => scan_lines_js_html(&content, &display_name, lang, issues),
            "rust" => scan_lines_rust(&content, &display_name, issues),
            "shell" => scan_lines_shell(&content, &display_name, issues),
            _ => {}
        }
    }
}

fn has_i18n_ignore_marker(line: &str) -> bool {
    // Single-line marker; works for // i18n-ignore (Rust/JS), # i18n-ignore (shell),
    // and HTML comments containing "i18n-ignore".
    line.contains("i18n-ignore")
}

fn push_phrases(
    line: &str,
    line_no: u32,
    file: &str,
    language: &str,
    kind: &str,
    issues: &mut Vec<HardcodedIssue>,
) {
    let phrases = extract_chinese_phrases(line);
    for phrase in phrases {
        issues.push(HardcodedIssue {
            file: file.to_string(),
            line: line_no,
            text: phrase,
            context: line.trim().chars().take(160).collect(),
            language: language.to_string(),
            kind: kind.to_string(),
        });
    }
}

fn scan_lines_js_html(
    content: &str,
    file: &str,
    language: &str,
    issues: &mut Vec<HardcodedIssue>,
) {
    for (i, line) in content.lines().enumerate() {
        if !contains_chinese(line) {
            continue;
        }
        if has_i18n_ignore_marker(line) {
            continue;
        }
        if is_i18n_safe_line(line) {
            continue;
        }
        push_phrases(line, (i + 1) as u32, file, language, language, issues);
    }
}

fn scan_lines_rust(content: &str, file: &str, issues: &mut Vec<HardcodedIssue>) {
    let mut in_block_comment = false;
    for (i, line) in content.lines().enumerate() {
        let mut local_in_block = in_block_comment;
        // Track block comment open/close on this line
        if let Some(open) = line.find("/*") {
            if local_in_block {
                // already in; check for close
                if line[open..].contains("*/") {
                    local_in_block = false;
                }
            } else if line[open..].contains("*/") {
                // entirely inside one line, doesn't change state
            } else {
                local_in_block = true;
            }
        } else if local_in_block && line.contains("*/") {
            local_in_block = false;
        }
        let was_in_block = in_block_comment;
        in_block_comment = local_in_block;

        if !contains_chinese(line) {
            continue;
        }
        if has_i18n_ignore_marker(line) {
            continue;
        }
        if was_in_block {
            push_phrases(line, (i + 1) as u32, file, "rust", "rust_comment", issues);
            continue;
        }

        let trimmed = line.trim_start();
        if trimmed.starts_with("///") || trimmed.starts_with("//!") {
            push_phrases(line, (i + 1) as u32, file, "rust", "rust_doc_comment", issues);
            continue;
        }
        if let Some(idx) = trimmed.find("//") {
            // Line comment after code or as full line
            if idx == 0 {
                push_phrases(line, (i + 1) as u32, file, "rust", "rust_comment", issues);
                continue;
            }
            // Code with trailing comment — fall through to code analysis but the comment
            // portion alone may contain Chinese; we'll classify based on code patterns.
        }

        let kind = classify_rust_line(line);
        push_phrases(line, (i + 1) as u32, file, "rust", kind, issues);
    }
}

fn classify_rust_line(line: &str) -> &'static str {
    // Error returned to caller (and onward to frontend toast)
    if line.contains("Err(\"")
        || line.contains("Err(format!(")
        || line.contains(".map_err(")
        || line.contains(".ok_or(")
        || line.contains(".ok_or_else(")
        || line.contains(".context(")
        || line.contains(".with_context(")
    {
        return "rust_user_error";
    }
    // User-visible output / menu labels
    if line.contains("eprintln!")
        || line.contains("println!")
        || line.contains("print!")
        || line.contains("MenuItem::")
        || line.contains("set_text(")
        || line.contains("Notification::")
        || line.contains(".set_title(")
    {
        return "rust_user_visible";
    }
    "rust_internal"
}

fn scan_lines_shell(content: &str, file: &str, issues: &mut Vec<HardcodedIssue>) {
    for (i, line) in content.lines().enumerate() {
        if !contains_chinese(line) {
            continue;
        }
        if has_i18n_ignore_marker(line) {
            continue;
        }
        let trimmed = line.trim_start();
        if trimmed.starts_with('#') {
            push_phrases(line, (i + 1) as u32, file, "shell", "shell_comment", issues);
            continue;
        }
        let kind = if line.contains("echo ")
            || line.contains("echo\t")
            || line.contains("printf ")
            || line.contains("printf\t")
            || line.contains(">&2")
        {
            "shell_user_output"
        } else {
            "shell_internal"
        };
        push_phrases(line, (i + 1) as u32, file, "shell", kind, issues);
    }
}

// ─── Missing translation detection ───────────────────────────────────────────

fn check_missing_translations(locales: &[LocaleData]) -> Vec<MissingKeyIssue> {
    let Some(zh_cn) = locales.iter().find(|l| l.code == "zh-CN") else {
        return Vec::new();
    };
    let en_us = locales.iter().find(|l| l.code == "en-US");

    let mut issues = Vec::new();

    for key in &zh_cn.key_order {
        let zh_value = zh_cn.messages.get(key).cloned().unwrap_or_default();
        let en_value = en_us
            .and_then(|e| e.messages.get(key))
            .cloned()
            .unwrap_or_default();

        let mut missing_in = Vec::new();
        let mut present_in = Vec::new();

        for locale in locales {
            if locale.code == "zh-CN" {
                continue;
            }
            match locale.messages.get(key) {
                Some(v) if !v.is_empty() => present_in.push(locale.code.clone()),
                _ => missing_in.push(locale.code.clone()),
            }
        }

        if !missing_in.is_empty() {
            issues.push(MissingKeyIssue {
                key: key.clone(),
                zh_cn_value: zh_value,
                en_us_value: en_value,
                missing_in,
                present_in,
            });
        }
    }

    issues
}

// ─── Wrong language detection ─────────────────────────────────────────────────

/// Brand/tech names that should NOT trigger same_as_english — they're meant to
/// stay identical across locales (mirrors the prompt's no-translate list).
fn is_brand_or_tech_term(s: &str) -> bool {
    const TERMS: &[&str] = &[
        // Single brand/tech tokens
        "Docker", "OpenClaw", "WebClaw", "R2", "GPU", "CPU", "IDE", "URL",
        "API", "JSON", "YAML", "HTTP", "HTTPS", "SSH", "VPN", "Node.js", "npm",
        "Tauri", "Hermes", "Cloudflare", "Vercel", "GitHub", "GitLab", "Linux",
        "macOS", "Windows", "iOS", "Android",
        // System identifiers / common placeholders
        "admin", "root", "user", "guest", "true", "false", "null", "none",
    ];
    let trimmed = s.trim();
    TERMS.iter().any(|t| trimmed.eq_ignore_ascii_case(t))
}

fn check_wrong_language(locales: &[LocaleData]) -> Vec<WrongLangIssue> {
    let Some(en_us) = locales.iter().find(|l| l.code == "en-US") else {
        return Vec::new();
    };
    let zh_cn = locales.iter().find(|l| l.code == "zh-CN");

    let mut issues = Vec::new();

    // Locales that should NOT have plain English content
    let non_en: Vec<&LocaleData> = locales
        .iter()
        .filter(|l| l.code != "en-US" && l.code != "zh-CN")
        .collect();

    for locale in non_en {
        // CJK locales (Japanese/Korean) can have CJK characters legitimately
        let is_cjk_locale = matches!(locale.code.as_str(), "ja-JP" | "ko-KR");

        for (key, value) in &locale.messages {
            if value.is_empty() {
                continue;
            }

            let en_value = match en_us.messages.get(key) {
                Some(v) => v,
                None => continue,
            };

            // If the zh-CN source itself is identical to the English value
            // (i.e. the source is already English/brand-only), every locale
            // *should* match — not a translation defect.
            let zh_value = zh_cn.and_then(|l| l.messages.get(key));
            let zh_equals_en = zh_value.map_or(false, |v| v == en_value);

            // Problem 3a: Value is identical to English. Trigger on any value that
            // contains letters and isn't a known brand/tech name AND the zh-CN
            // source differs from English (otherwise it's already-English
            // intentional content). Catches short UI strings like "OK", "Save",
            // "Cancel" that were never translated.
            let is_real_phrase = en_value.chars().any(|c| c.is_alphabetic())
                && !is_brand_or_tech_term(en_value)
                && !zh_equals_en;

            if value == en_value && is_real_phrase {
                issues.push(WrongLangIssue {
                    locale: locale.code.clone(),
                    locale_path: locale.path.clone(),
                    key: key.clone(),
                    current_value: value.clone(),
                    en_us_value: en_value.clone(),
                    issue_type: "same_as_english".to_string(),
                });
                continue;
            }

            // Problem 3b: Contains Chinese characters in non-CJK locale
            if !is_cjk_locale && contains_chinese(value) {
                issues.push(WrongLangIssue {
                    locale: locale.code.clone(),
                    locale_path: locale.path.clone(),
                    key: key.clone(),
                    current_value: value.clone(),
                    en_us_value: en_value.clone(),
                    issue_type: "contains_chinese".to_string(),
                });
            }
        }
    }

    issues.sort_by(|a, b| a.locale.cmp(&b.locale).then(a.key.cmp(&b.key)));
    issues
}

// ─── Main scan command ────────────────────────────────────────────────────────

#[tauri::command]
pub fn i18n_scan(project_path: String) -> Result<ScanResult, String> {
    let mut errors = Vec::new();

    // 1. Load locale files
    let locales = match load_locale_files(&project_path) {
        Ok(l) => l,
        Err(e) => {
            errors.push(e.clone());
            return Err(e);
        }
    };

    // 2. Scan hardcoded strings
    let hardcoded = scan_hardcoded(&project_path);

    // 3. Check missing translations
    let missing = check_missing_translations(&locales);

    // 4. Check wrong language
    let wrong_lang = check_wrong_language(&locales);

    Ok(ScanResult {
        locales,
        hardcoded,
        missing,
        wrong_lang,
        errors,
    })
}

// ─── Fix: add missing keys to locale files ────────────────────────────────────

#[tauri::command]
pub fn i18n_add_missing_keys(fixes: Vec<KeyFix>) -> Result<Vec<String>, String> {
    // Group fixes by locale path
    let mut by_file: HashMap<String, Vec<KeyFix>> = HashMap::new();
    for fix in fixes {
        by_file.entry(fix.locale_path.clone()).or_default().push(fix);
    }

    let mut results = Vec::new();

    for (path, keys) in &by_file {
        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(e) => {
                results.push(format!("错误: 无法读取 {} — {}", path, e));
                continue;
            }
        };

        let ends_with_newline = content.ends_with('\n');
        let mut lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();

        // Find the closing `  },` of the messages block
        let mut messages_start = None;
        let mut messages_end = None;

        for (i, line) in lines.iter().enumerate() {
            let trimmed = line.trim();
            if trimmed.starts_with("messages:") && trimmed.contains('{') {
                messages_start = Some(i);
            }
            if messages_start.is_some() {
                let indent = line.len() - line.trim_start().len();
                if (trimmed == "}," || trimmed == "}") && indent <= 2 {
                    messages_end = Some(i);
                    break;
                }
            }
        }

        let Some(end_idx) = messages_end else {
            results.push(format!("错误: 找不到 messages 结束位置 — {}", path));
            continue;
        };

        // Check which keys already exist (skip duplicates)
        let existing: std::collections::HashSet<String> = lines
            .iter()
            .filter_map(|l| {
                let t = l.trim();
                let ci = t.find(':')?;
                Some(t[..ci].trim().to_string())
            })
            .collect();

        let new_lines: Vec<String> = keys
            .iter()
            .filter(|fix| !existing.contains(&fix.key))
            .map(|fix| {
                let escaped = fix.value.replace('\'', "\\'");
                format!("    {}: '{}',", fix.key, escaped)
            })
            .collect();

        let added_count = new_lines.len();
        for (j, new_line) in new_lines.into_iter().enumerate() {
            lines.insert(end_idx + j, new_line);
        }

        let new_content = if ends_with_newline {
            format!("{}\n", lines.join("\n"))
        } else {
            lines.join("\n")
        };

        match std::fs::write(path, new_content) {
            Ok(_) => results.push(format!("✓ 添加 {} 个键到 {}", added_count, path)),
            Err(e) => results.push(format!("错误: 写入失败 {} — {}", path, e)),
        }
    }

    Ok(results)
}

// ─── Fix: clear wrong language value ─────────────────────────────────────────

#[tauri::command]
pub fn i18n_clear_wrong_value(locale_path: String, keys: Vec<String>) -> Result<String, String> {
    let content = std::fs::read_to_string(&locale_path).map_err(|e| e.to_string())?;
    let ends_with_newline = content.ends_with('\n');

    let key_set: std::collections::HashSet<&str> = keys.iter().map(|s| s.as_str()).collect();
    let mut cleared = 0;

    let lines: Vec<String> = content
        .lines()
        .map(|line| {
            let trimmed = line.trim();
            // Find key before the colon
            if let Some(ci) = trimmed.find(':') {
                let candidate_key = trimmed[..ci].trim();
                if key_set.contains(candidate_key) {
                    let indent_len = line.len() - line.trim_start().len();
                    let spaces = " ".repeat(indent_len);
                    cleared += 1;
                    return format!("{}{}: '',", spaces, candidate_key);
                }
            }
            line.to_string()
        })
        .collect();

    let new_content = if ends_with_newline {
        format!("{}\n", lines.join("\n"))
    } else {
        lines.join("\n")
    };

    std::fs::write(&locale_path, new_content).map_err(|e| e.to_string())?;
    Ok(format!("✓ 已清空 {} 个值", cleared))
}

// ─── Gemini translation ──────────────────────────────────────────────────────

const DEFAULT_MODEL: &str = "gemini-2.5-flash";
/// Built-in fallback Gemini API key (shared with webclaw-launcher-tauri's i18n-translate.js).
/// Used only when neither settings.gemini_api_key nor env GOOGLE_API_KEYS is set.
const DEFAULT_API_KEY: &str = "AIzaSyAEij3nrTMsZaLrZ6UHbM1Uil6bLZ2Z42M";
const BATCH_SIZE: usize = 20;
const API_DELAY_MS: u64 = 500;
const MAX_RETRIES: u32 = 5;
const RETRY_BASE_MS: u64 = 1500;
const RETRY_CAP_MS: u64 = 20000;
const MAX_OUTPUT_TOKENS: u32 = 16384;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TranslateReport {
    pub lang: String,
    pub total_keys: usize,
    pub had_translations: usize,
    pub translated: usize,
    pub failed_batches: usize,
    pub written_total: usize,
    pub messages: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LangProgress {
    pub code: String,
    pub file_keys: usize,
    pub progress_keys: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TranslationStatus {
    pub model: String,
    pub api_key_source: String,
    pub source_total: usize,
    pub languages: Vec<LangProgress>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ProgressEvent {
    Start { lang: String, total_batches: usize, pending: usize },
    Batch { lang: String, batch_no: usize, total_batches: usize, got: usize, batch_size: usize },
    Retry { lang: String, batch_no: usize, attempt: u32, message: String },
    BatchFailed { lang: String, batch_no: usize, message: String },
    Done { lang: String, written_total: usize, source_total: usize },
    Info { message: String },
}

fn lang_prompt_name(code: &str) -> Option<&'static str> {
    match code {
        "en-US" => Some("English"),
        "ja-JP" => Some("Japanese (日本語)"),
        "ko-KR" => Some("Korean (한국어)"),
        "de-DE" => Some("German (Deutsch)"),
        "es-419" => Some("Spanish - Latin America (Español)"),
        "pt-BR" => Some("Portuguese - Brazil (Português do Brasil)"),
        _ => None,
    }
}

fn resolve_api_keys(settings_key: &str) -> Result<(Vec<String>, &'static str), String> {
    let trimmed = settings_key.trim();
    if !trimmed.is_empty() {
        let keys: Vec<String> = trimmed
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        if !keys.is_empty() {
            return Ok((keys, "settings"));
        }
    }
    if let Ok(env_keys) = std::env::var("GOOGLE_API_KEYS") {
        let keys: Vec<String> = env_keys
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        if !keys.is_empty() {
            return Ok((keys, "env"));
        }
    }
    Ok((vec![DEFAULT_API_KEY.to_string()], "default"))
}

fn resolve_model(settings_model: &str) -> String {
    let trimmed = settings_model.trim();
    if !trimmed.is_empty() {
        return trimmed.to_string();
    }
    if let Ok(env_model) = std::env::var("GEMINI_MODEL") {
        if !env_model.trim().is_empty() {
            return env_model.trim().to_string();
        }
    }
    DEFAULT_MODEL.to_string()
}

fn progress_dir(project_path: &str) -> PathBuf {
    Path::new(project_path).join(".i18n-progress")
}

fn load_progress(project_path: &str, lang_code: &str) -> HashMap<String, String> {
    let path = progress_dir(project_path).join(format!("{}.json", lang_code));
    if let Ok(data) = std::fs::read_to_string(&path) {
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        HashMap::new()
    }
}

fn save_progress(
    project_path: &str,
    lang_code: &str,
    data: &HashMap<String, String>,
) -> Result<(), String> {
    let dir = progress_dir(project_path);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.json", lang_code));
    let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

/// Match webclaw i18n-translate.js `escapeSingleQuoted` semantics: idempotent over
/// already-escaped strings (unescape first, then re-escape).
fn escape_single_quoted(s: &str) -> String {
    let s = s.replace("\\'", "'");
    let s = s.replace("\\n", "\n").replace("\\r", "\r");
    let s = s.replace('\\', "\\\\");
    let s = s.replace('\'', "\\'");
    s.replace('\n', "\\n").replace('\r', "\\r")
}

fn write_language_file(
    file_path: &Path,
    code: &str,
    label: &str,
    ordered_keys: &[String],
    translations: &HashMap<String, String>,
) -> Result<(), String> {
    let mut out = String::new();
    out.push_str("export default {\n");
    out.push_str(&format!("  code: '{}',\n", code));
    out.push_str(&format!("  label: '{}',\n", escape_single_quoted(label)));
    out.push_str("  messages: {\n");
    for key in ordered_keys {
        if let Some(value) = translations.get(key) {
            out.push_str(&format!("    {}: '{}',\n", key, escape_single_quoted(value)));
        }
    }
    out.push_str("  },\n");
    out.push_str("  text: {},\n");
    out.push_str("  title: {},\n");
    out.push_str("  placeholder: {},\n");
    out.push_str("};\n");
    std::fs::write(file_path, out).map_err(|e| e.to_string())
}

fn build_prompt(target_lang_name: &str, entries: &[(String, String)]) -> String {
    let map: serde_json::Map<String, serde_json::Value> = entries
        .iter()
        .map(|(k, v)| (k.clone(), serde_json::Value::String(v.clone())))
        .collect();
    let input = serde_json::to_string_pretty(&serde_json::Value::Object(map))
        .unwrap_or_else(|_| "{}".to_string());
    format!(
        "You are a professional software localization translator.\n\n\
Translate the following Chinese UI strings to {lang}. Rules:\n\
1. Keep translations concise and natural for UI (buttons, labels, short messages).\n\
2. PRESERVE placeholders exactly: {{days}}, {{error}}, {{count}}, {{name}}, {{file}}, {{path}}, etc. Do NOT translate inside {{ }}.\n\
3. Do NOT translate these brand/tech names: Docker, OpenClaw, WebClaw, R2, GPU, CPU, IDE, URL, API, JSON, YAML, HTTP, HTTPS, SSH, VPN, Node.js, npm, Tauri, Hermes, Cloudflare, GitHub, Linux, macOS, Windows.\n\
4. Prefer native script forms (Japanese kanji/katakana, Korean hangul, German umlauts, etc.). Avoid leaving the English word verbatim unless it is a brand/tech name from rule 3 or a system identifier (admin, root, true, false).\n\
5. Return ONLY a JSON object. No markdown, no comments, no extra keys.\n\n\
Input (JSON map, key = identifier, value = Chinese source):\n{input}\n\n\
Return a JSON object with the SAME keys and {lang} translations as values.",
        lang = target_lang_name,
        input = input,
    )
}

async fn translate_batch(
    client: &reqwest::Client,
    api_keys: &[String],
    key_cursor: &mut usize,
    model: &str,
    target_lang_name: &str,
    entries: &[(String, String)],
    app: &tauri::AppHandle,
    lang_code: &str,
    batch_no: usize,
) -> Result<HashMap<String, String>, String> {
    let prompt = build_prompt(target_lang_name, entries);
    let body = serde_json::json!({
        "contents": [{ "parts": [{ "text": prompt }] }],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": MAX_OUTPUT_TOKENS,
            "responseMimeType": "application/json",
            "thinkingConfig": { "thinkingBudget": 0 }
        }
    });

    for attempt in 0..=MAX_RETRIES {
        let key = &api_keys[*key_cursor % api_keys.len()];
        *key_cursor += 1;

        let endpoint = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
            model, key
        );

        let resp = client
            .post(&endpoint)
            .json(&body)
            .send()
            .await;

        let resp = match resp {
            Ok(r) => r,
            Err(e) => {
                if attempt >= MAX_RETRIES {
                    return Err(format!("network: {}", e));
                }
                let wait = std::cmp::min(RETRY_BASE_MS * 2u64.pow(attempt), RETRY_CAP_MS);
                emit_progress(
                    app,
                    ProgressEvent::Retry {
                        lang: lang_code.to_string(),
                        batch_no,
                        attempt: attempt + 1,
                        message: format!("network: {}", e),
                    },
                );
                tokio::time::sleep(std::time::Duration::from_millis(wait)).await;
                continue;
            }
        };

        let status = resp.status();
        if status.as_u16() == 429 {
            let body_text = resp.text().await.unwrap_or_default();
            let wait_ms = parse_retry_delay(&body_text).unwrap_or(5000);
            if attempt >= MAX_RETRIES {
                return Err(format!(
                    "429 quota exhausted: {}",
                    body_text.chars().take(200).collect::<String>()
                ));
            }
            emit_progress(
                app,
                ProgressEvent::Retry {
                    lang: lang_code.to_string(),
                    batch_no,
                    attempt: attempt + 1,
                    message: format!("429 wait {}ms", wait_ms),
                },
            );
            tokio::time::sleep(std::time::Duration::from_millis(wait_ms)).await;
            continue;
        }

        if !status.is_success() {
            let body_text = resp.text().await.unwrap_or_default();
            if attempt >= MAX_RETRIES {
                return Err(format!(
                    "HTTP {}: {}",
                    status,
                    body_text.chars().take(200).collect::<String>()
                ));
            }
            let wait = std::cmp::min(RETRY_BASE_MS * 2u64.pow(attempt), RETRY_CAP_MS);
            emit_progress(
                app,
                ProgressEvent::Retry {
                    lang: lang_code.to_string(),
                    batch_no,
                    attempt: attempt + 1,
                    message: format!("HTTP {}", status),
                },
            );
            tokio::time::sleep(std::time::Duration::from_millis(wait)).await;
            continue;
        }

        let data: serde_json::Value = match resp.json().await {
            Ok(d) => d,
            Err(e) => {
                if attempt >= MAX_RETRIES {
                    return Err(format!("parse response: {}", e));
                }
                let wait = std::cmp::min(RETRY_BASE_MS * 2u64.pow(attempt), RETRY_CAP_MS);
                tokio::time::sleep(std::time::Duration::from_millis(wait)).await;
                continue;
            }
        };

        let candidate = &data["candidates"][0];
        let finish_reason = candidate["finishReason"].as_str().unwrap_or("");
        if finish_reason == "MAX_TOKENS" {
            return Err("MAX_TOKENS: response truncated, reduce batch size".to_string());
        }

        let text = match candidate["content"]["parts"][0]["text"].as_str() {
            Some(t) if !t.trim().is_empty() => t.trim().to_string(),
            _ => {
                if attempt >= MAX_RETRIES {
                    return Err(format!("empty response (finishReason={})", finish_reason));
                }
                let wait = std::cmp::min(RETRY_BASE_MS * 2u64.pow(attempt), RETRY_CAP_MS);
                tokio::time::sleep(std::time::Duration::from_millis(wait)).await;
                continue;
            }
        };

        let cleaned = clean_json_response(&text);
        match serde_json::from_str::<HashMap<String, String>>(&cleaned) {
            Ok(map) => return Ok(map),
            Err(e) => {
                if attempt >= MAX_RETRIES {
                    return Err(format!(
                        "parse json: {} (sample: {})",
                        e,
                        cleaned.chars().take(200).collect::<String>()
                    ));
                }
                let wait = std::cmp::min(RETRY_BASE_MS * 2u64.pow(attempt), RETRY_CAP_MS);
                emit_progress(
                    app,
                    ProgressEvent::Retry {
                        lang: lang_code.to_string(),
                        batch_no,
                        attempt: attempt + 1,
                        message: format!("bad json: {}", e),
                    },
                );
                tokio::time::sleep(std::time::Duration::from_millis(wait)).await;
            }
        }
    }
    Err("max retries exceeded".to_string())
}

fn parse_retry_delay(body: &str) -> Option<u64> {
    let re = Regex::new(r#""retryDelay":\s*"(\d+(?:\.\d+)?)s""#).ok()?;
    let caps = re.captures(body)?;
    let secs: f64 = caps.get(1)?.as_str().parse().ok()?;
    Some(((secs * 1000.0) as u64).min(60_000))
}

fn clean_json_response(text: &str) -> String {
    let mut s = text.trim().to_string();
    if let Some(rest) = s.strip_prefix("```json") {
        s = rest.trim().to_string();
    } else if let Some(rest) = s.strip_prefix("```") {
        s = rest.trim().to_string();
    }
    if let Some(rest) = s.strip_suffix("```") {
        s = rest.trim().to_string();
    }
    if let (Some(first), Some(last)) = (s.find('{'), s.rfind('}')) {
        if last > first {
            return s[first..=last].to_string();
        }
    }
    s
}

fn emit_progress(app: &tauri::AppHandle, event: ProgressEvent) {
    use tauri::Emitter;
    let _ = app.emit("i18n:translate:progress", event);
}

fn parse_zh_source(project_path: &str) -> Result<(Vec<String>, HashMap<String, String>), String> {
    let zh_path = Path::new(project_path)
        .join("src")
        .join("locales")
        .join("zh-CN.js");
    let locale = parse_locale_file(&zh_path)?;
    Ok((locale.key_order, locale.messages))
}

#[tauri::command]
pub async fn i18n_translate(
    app: tauri::AppHandle,
    project_path: String,
    target_lang: String,
    keys: Option<Vec<String>>,
    sample: Option<usize>,
    overwrite: Option<bool>,
) -> Result<TranslateReport, String> {
    let overwrite = overwrite.unwrap_or(false);
    let settings = i18n_load_settings();
    let (api_keys, _src) = resolve_api_keys(&settings.gemini_api_key)?;
    let model = resolve_model(&settings.gemini_model);

    let prompt_name = lang_prompt_name(&target_lang)
        .ok_or_else(|| format!("unsupported language: {}", target_lang))?;

    let (order, source) = parse_zh_source(&project_path)?;

    let target_path = Path::new(&project_path)
        .join("src")
        .join("locales")
        .join(format!("{}.js", target_lang));

    let mut target_meta_code = target_lang.clone();
    let mut target_meta_label = target_lang.clone();
    let mut existing: HashMap<String, String> = HashMap::new();
    if target_path.exists() {
        if let Ok(loc) = parse_locale_file(&target_path) {
            target_meta_code = loc.code.clone();
            existing = loc.messages.clone();
            // Try to extract label from raw file (parse_locale_file doesn't expose it)
            if let Ok(content) = std::fs::read_to_string(&target_path) {
                let label_re = Regex::new(r#"label:\s*['"]([^'"]+)['"]"#).unwrap();
                if let Some(c) = label_re.captures(&content) {
                    target_meta_label = c[1].to_string();
                }
            }
        }
    }

    let mut progress = load_progress(&project_path, &target_lang);

    // Overwrite mode: drop progress entries for the requested keys so re-translation
    // doesn't reuse stale cached values (e.g. previous bad English fallback).
    if overwrite {
        if let Some(ref ks) = keys {
            for k in ks {
                progress.remove(k);
            }
        }
    }

    // Incremental: candidate keys = source order ∩ (missing in file) ∩ (missing in progress).
    // overwrite=true: for keys in the explicit whitelist, force inclusion regardless of existing/progress.
    let key_filter: Option<std::collections::HashSet<String>> =
        keys.as_ref().map(|v| v.iter().cloned().collect());
    let mut candidate_keys: Vec<String> = order
        .iter()
        .filter(|k| {
            let in_whitelist = key_filter.as_ref().map_or(false, |s| s.contains(*k));
            if overwrite && in_whitelist {
                return true;
            }
            !existing.contains_key(*k) && !progress.contains_key(*k)
        })
        .filter(|k| key_filter.as_ref().map_or(true, |s| s.contains(*k)))
        .cloned()
        .collect();
    if let Some(n) = sample {
        candidate_keys.truncate(n);
    }

    // Merge existing + cached progress; we'll add fresh translations as they arrive.
    let mut merged: HashMap<String, String> = existing.clone();
    for (k, v) in &progress {
        merged.insert(k.clone(), v.clone());
    }

    let total_batches = candidate_keys.len().div_ceil(BATCH_SIZE);
    let mut report_messages = Vec::new();

    emit_progress(
        &app,
        ProgressEvent::Start {
            lang: target_lang.clone(),
            total_batches,
            pending: candidate_keys.len(),
        },
    );

    if candidate_keys.is_empty() {
        write_language_file(&target_path, &target_meta_code, &target_meta_label, &order, &merged)?;
        let written = order.iter().filter(|k| merged.contains_key(*k)).count();
        emit_progress(
            &app,
            ProgressEvent::Done {
                lang: target_lang.clone(),
                written_total: written,
                source_total: order.len(),
            },
        );
        return Ok(TranslateReport {
            lang: target_lang,
            total_keys: order.len(),
            had_translations: existing.len(),
            translated: 0,
            failed_batches: 0,
            written_total: written,
            messages: vec!["no missing keys".to_string()],
        });
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("http client: {}", e))?;

    let mut key_cursor: usize = 0;
    let mut translated_total = 0usize;
    let mut failed_batches = 0usize;

    for (i, batch_keys) in candidate_keys.chunks(BATCH_SIZE).enumerate() {
        let batch_no = i + 1;
        let entries: Vec<(String, String)> = batch_keys
            .iter()
            .filter_map(|k| source.get(k).map(|v| (k.clone(), v.clone())))
            .collect();

        match translate_batch(
            &client,
            &api_keys,
            &mut key_cursor,
            &model,
            prompt_name,
            &entries,
            &app,
            &target_lang,
            batch_no,
        )
        .await
        {
            Ok(result) => {
                let mut got = 0usize;
                for k in batch_keys {
                    if let Some(v) = result.get(k) {
                        if !v.is_empty() {
                            progress.insert(k.clone(), v.clone());
                            merged.insert(k.clone(), v.clone());
                            got += 1;
                        }
                    }
                }
                translated_total += got;
                let _ = save_progress(&project_path, &target_lang, &progress);
                emit_progress(
                    &app,
                    ProgressEvent::Batch {
                        lang: target_lang.clone(),
                        batch_no,
                        total_batches,
                        got,
                        batch_size: batch_keys.len(),
                    },
                );
            }
            Err(e) => {
                failed_batches += 1;
                report_messages.push(format!("batch {}: {}", batch_no, e));
                let _ = save_progress(&project_path, &target_lang, &progress);
                emit_progress(
                    &app,
                    ProgressEvent::BatchFailed {
                        lang: target_lang.clone(),
                        batch_no,
                        message: e,
                    },
                );
            }
        }

        if batch_no < total_batches {
            tokio::time::sleep(std::time::Duration::from_millis(API_DELAY_MS)).await;
        }
    }

    write_language_file(&target_path, &target_meta_code, &target_meta_label, &order, &merged)?;
    let written = order.iter().filter(|k| merged.contains_key(*k)).count();
    emit_progress(
        &app,
        ProgressEvent::Done {
            lang: target_lang.clone(),
            written_total: written,
            source_total: order.len(),
        },
    );

    Ok(TranslateReport {
        lang: target_lang,
        total_keys: order.len(),
        had_translations: existing.len(),
        translated: translated_total,
        failed_batches,
        written_total: written,
        messages: report_messages,
    })
}

#[tauri::command]
pub fn i18n_translation_status(project_path: String) -> Result<TranslationStatus, String> {
    let settings = i18n_load_settings();
    let (_, api_key_source) = resolve_api_keys(&settings.gemini_api_key)
        .map(|(k, src)| (k, src.to_string()))
        .unwrap_or_else(|_| (Vec::new(), "none".to_string()));
    let model = resolve_model(&settings.gemini_model);

    let (order, _) = parse_zh_source(&project_path)?;
    let source_total = order.len();

    let langs = ["en-US", "ja-JP", "ko-KR", "de-DE", "es-419", "pt-BR"];
    let mut languages = Vec::new();
    for code in langs {
        let target_path = Path::new(&project_path)
            .join("src")
            .join("locales")
            .join(format!("{}.js", code));
        let file_keys = if target_path.exists() {
            parse_locale_file(&target_path)
                .map(|l| l.messages.len())
                .unwrap_or(0)
        } else {
            0
        };
        let progress_keys = load_progress(&project_path, code).len();
        languages.push(LangProgress {
            code: code.to_string(),
            file_keys,
            progress_keys,
        });
    }

    Ok(TranslationStatus {
        model,
        api_key_source,
        source_total,
        languages,
    })
}

// ─── Dead keys + anti-patterns ───────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DeadKey {
    pub key: String,
    pub zh_value: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AntiPattern {
    pub file: String,
    pub line: u32,
    pub kind: String, // chinese_fallback | key_leading_space | undefined_key
    pub key: String,
    pub context: String,
}

struct KeyRefs {
    /// Explicitly referenced static keys: t('xxx'), data-i18n="xxx", etc.
    pub static_keys: std::collections::HashSet<String>,
    /// Prefix matchers from dynamic template keys: t(`prefix_${var}`) → "prefix_".
    pub dynamic_prefixes: Vec<String>,
}

fn extract_key_refs(project_path: &str) -> KeyRefs {
    let mut static_keys: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut dynamic_prefixes: Vec<String> = Vec::new();

    let project_root = Path::new(project_path);
    let locales_dir = project_root.join("src").join("locales");
    let i18n_file = project_root.join("src").join("i18n.js");

    // JS/Rust call sites: t('xxx') / i18n.t('xxx') / window.i18n.t('xxx') / getMessage('xxx')
    let static_call_re =
        Regex::new(r#"(?:\b|\.)(?:t|getMessage)\(\s*['"]([a-zA-Z_][\w]*)['"]"#).unwrap();
    // Template literals: t(`prefix_${var}_suffix`) → "prefix_"
    let dynamic_call_re =
        Regex::new(r#"(?:\b|\.)(?:t|getMessage)\(\s*`([a-zA-Z_][\w]*?)\$\{"#).unwrap();
    // HTML data-i18n attributes
    let html_attr_re =
        Regex::new(r#"data-i18n(?:-[a-z\-]+)?\s*=\s*['"]([a-zA-Z_][\w]*)['"]"#).unwrap();

    let mut visit = |path: &Path| {
        let ext = path.extension().and_then(|e| e.to_str());
        let lang = match ext {
            Some("js") | Some("mjs") | Some("cjs") => "js",
            Some("html") | Some("htm") => "html",
            Some("rs") => "rust",
            _ => return,
        };
        if path == i18n_file {
            return;
        }
        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => return,
        };
        for caps in static_call_re.captures_iter(&content) {
            if let Some(m) = caps.get(1) {
                static_keys.insert(m.as_str().to_string());
            }
        }
        for caps in dynamic_call_re.captures_iter(&content) {
            if let Some(m) = caps.get(1) {
                dynamic_prefixes.push(m.as_str().to_string());
            }
        }
        if lang == "html" {
            for caps in html_attr_re.captures_iter(&content) {
                if let Some(m) = caps.get(1) {
                    static_keys.insert(m.as_str().to_string());
                }
            }
        }
    };

    fn walk(dir: &Path, locales_dir: &Path, visit: &mut dyn FnMut(&Path)) {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if path == locales_dir {
                    continue;
                }
                let name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                if skip_dir(&name) {
                    continue;
                }
                walk(&path, locales_dir, visit);
            } else {
                visit(&path);
            }
        }
    }

    let frontend = project_root.join("src");
    if frontend.exists() {
        walk(&frontend, &locales_dir, &mut visit);
    }
    let rust_dir = project_root.join("src-tauri").join("src");
    if rust_dir.exists() {
        walk(&rust_dir, &locales_dir, &mut visit);
    }

    KeyRefs {
        static_keys,
        dynamic_prefixes,
    }
}

#[tauri::command]
pub fn i18n_scan_dead_keys(project_path: String) -> Result<Vec<DeadKey>, String> {
    let (order, source) = parse_zh_source(&project_path)?;
    let refs = extract_key_refs(&project_path);

    let dead: Vec<DeadKey> = order
        .into_iter()
        .filter(|k| !refs.static_keys.contains(k))
        .filter(|k| !refs.dynamic_prefixes.iter().any(|p| k.starts_with(p)))
        .map(|k| DeadKey {
            zh_value: source.get(&k).cloned().unwrap_or_default(),
            key: k,
        })
        .collect();
    Ok(dead)
}

#[tauri::command]
pub fn i18n_scan_antipatterns(project_path: String) -> Result<Vec<AntiPattern>, String> {
    let (_, source) = parse_zh_source(&project_path)?;
    let zh_keys: std::collections::HashSet<&String> = source.keys().collect();
    let refs = extract_key_refs(&project_path);

    let chinese_fallback_re =
        Regex::new(r#"\bt\(\s*['"]([a-zA-Z_][\w]*)['"]\s*\)\s*\|\|\s*['"]([^'"]*[一-龥][^'"]*)['"]"#)
            .unwrap();
    let leading_space_re =
        Regex::new(r#"\bt\(\s*['"](\s+[a-zA-Z_][\w]*)['"]"#).unwrap();
    let any_t_call_re =
        Regex::new(r#"\bt\(\s*['"]([a-zA-Z_][\w]*)['"]"#).unwrap();

    let mut results: Vec<AntiPattern> = Vec::new();
    let project_root = Path::new(&project_path);
    let locales_dir = project_root.join("src").join("locales");

    fn walk(
        dir: &Path,
        locales_dir: &Path,
        visit: &mut dyn FnMut(&Path),
    ) {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if path == locales_dir {
                    continue;
                }
                let name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                if skip_dir(&name) {
                    continue;
                }
                walk(&path, locales_dir, visit);
            } else {
                visit(&path);
            }
        }
    }

    let mut visit = |path: &Path| {
        let ext = path.extension().and_then(|e| e.to_str());
        if !matches!(
            ext,
            Some("js") | Some("mjs") | Some("cjs") | Some("html") | Some("htm")
        ) {
            return;
        }
        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => return,
        };
        let display_name = path
            .strip_prefix(project_root)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();
        for (i, line) in content.lines().enumerate() {
            let line_no = (i + 1) as u32;
            if line.contains("i18n-ignore") {
                continue;
            }
            // chinese_fallback
            if let Some(caps) = chinese_fallback_re.captures(line) {
                results.push(AntiPattern {
                    file: display_name.clone(),
                    line: line_no,
                    kind: "chinese_fallback".to_string(),
                    key: caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default(),
                    context: line.trim().chars().take(200).collect(),
                });
            }
            // key_leading_space
            if let Some(caps) = leading_space_re.captures(line) {
                results.push(AntiPattern {
                    file: display_name.clone(),
                    line: line_no,
                    kind: "key_leading_space".to_string(),
                    key: caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default(),
                    context: line.trim().chars().take(200).collect(),
                });
            }
            // undefined_key: any t('xxx') where xxx is not in zh-CN and not under a dynamic prefix
            for caps in any_t_call_re.captures_iter(line) {
                if let Some(m) = caps.get(1) {
                    let key = m.as_str();
                    if !zh_keys.contains(&key.to_string())
                        && !refs.dynamic_prefixes.iter().any(|p| key.starts_with(p))
                    {
                        results.push(AntiPattern {
                            file: display_name.clone(),
                            line: line_no,
                            kind: "undefined_key".to_string(),
                            key: key.to_string(),
                            context: line.trim().chars().take(200).collect(),
                        });
                    }
                }
            }
        }
    };

    let frontend = project_root.join("src");
    if frontend.exists() {
        walk(&frontend, &locales_dir, &mut visit);
    }

    Ok(results)
}

#[tauri::command]
pub fn i18n_delete_dead_keys(
    project_path: String,
    keys: Vec<String>,
) -> Result<String, String> {
    if keys.is_empty() {
        return Ok("no keys".to_string());
    }
    let key_set: std::collections::HashSet<&str> = keys.iter().map(|s| s.as_str()).collect();

    let locales_dir = Path::new(&project_path).join("src").join("locales");
    if !locales_dir.exists() {
        return Err(format!("locales dir not found: {}", locales_dir.display()));
    }

    // Backup directory
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let backup_dir = Path::new(&project_path)
        .join(".i18n-backup")
        .join(format!("dead-keys-{}", ts));
    std::fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

    let mut total_removed = 0usize;
    let mut files_touched = 0usize;

    for entry in std::fs::read_dir(&locales_dir).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("js") {
            continue;
        }
        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        // Backup
        if let Some(name) = path.file_name() {
            let _ = std::fs::write(backup_dir.join(name), &content);
        }
        let ends_with_newline = content.ends_with('\n');
        let mut removed = 0usize;
        let lines: Vec<String> = content
            .lines()
            .filter(|line| {
                let trimmed = line.trim();
                if let Some(ci) = trimmed.find(':') {
                    let candidate = trimmed[..ci].trim();
                    if key_set.contains(candidate) {
                        removed += 1;
                        return false;
                    }
                }
                true
            })
            .map(|s| s.to_string())
            .collect();
        if removed > 0 {
            let new_content = if ends_with_newline {
                format!("{}\n", lines.join("\n"))
            } else {
                lines.join("\n")
            };
            std::fs::write(&path, new_content).map_err(|e| e.to_string())?;
            total_removed += removed;
            files_touched += 1;
        }
    }

    Ok(format!(
        "removed {} entries across {} files; backup: {}",
        total_removed,
        files_touched,
        backup_dir.display()
    ))
}

#[tauri::command]
pub fn i18n_fix_chinese_fallbacks(project_path: String) -> Result<String, String> {
    let project_root = Path::new(&project_path);
    let locales_dir = project_root.join("src").join("locales");
    let frontend = project_root.join("src");

    let pat = Regex::new(
        r#"(\bt\(\s*['"][a-zA-Z_][\w]*['"]\s*(?:,\s*\{[^{}]*\})?\))\s*\|\|\s*['"][^'"]*[一-龥][^'"]*['"]"#,
    )
    .map_err(|e| e.to_string())?;

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let backup_dir = project_root
        .join(".i18n-backup")
        .join(format!("antipattern-{}", ts));
    std::fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

    let mut total_fixed = 0usize;
    let mut files_touched = 0usize;

    fn walk(
        dir: &Path,
        locales_dir: &Path,
        visit: &mut dyn FnMut(&Path),
    ) {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if path == locales_dir {
                    continue;
                }
                let name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                if skip_dir(&name) {
                    continue;
                }
                walk(&path, locales_dir, visit);
            } else {
                visit(&path);
            }
        }
    }

    let mut visit = |path: &Path| {
        let ext = path.extension().and_then(|e| e.to_str());
        if !matches!(ext, Some("js") | Some("mjs") | Some("cjs")) {
            return;
        }
        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => return,
        };
        let count = pat.find_iter(&content).count();
        if count == 0 {
            return;
        }
        // Backup with relative path encoded into filename
        let rel = path
            .strip_prefix(project_root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('/', "_")
            .replace('\\', "_");
        let _ = std::fs::write(backup_dir.join(rel), &content);

        let new_content = pat.replace_all(&content, "$1").to_string();
        if let Err(_e) = std::fs::write(path, new_content) {
            return;
        }
        total_fixed += count;
        files_touched += 1;
    };
    if frontend.exists() {
        walk(&frontend, &locales_dir, &mut visit);
    }

    Ok(format!(
        "stripped {} chinese fallbacks across {} files; backup: {}",
        total_fixed,
        files_touched,
        backup_dir.display()
    ))
}

#[tauri::command]
pub fn i18n_translation_clear_progress(
    project_path: String,
    target_lang: Option<String>,
) -> Result<String, String> {
    let dir = progress_dir(&project_path);
    if !dir.exists() {
        return Ok("no progress dir".to_string());
    }
    if let Some(lang) = target_lang {
        let path = dir.join(format!("{}.json", lang));
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
            return Ok(format!("cleared {}", lang));
        }
        return Ok(format!("no progress for {}", lang));
    }
    let mut count = 0;
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        if entry.path().extension().and_then(|e| e.to_str()) == Some("json") {
            let _ = std::fs::remove_file(entry.path());
            count += 1;
        }
    }
    Ok(format!("cleared {} progress files", count))
}
