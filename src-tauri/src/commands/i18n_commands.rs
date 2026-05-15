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
pub struct Settings {
    pub project_path: String,
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
        Settings { project_path: default_path }
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

fn scan_hardcoded(project_path: &str) -> Vec<HardcodedIssue> {
    let src_dir = Path::new(project_path).join("src");
    let locales_dir = src_dir.join("locales");
    let i18n_file = src_dir.join("i18n.js");

    let mut issues = Vec::new();
    scan_dir_for_hardcoded(&src_dir, &locales_dir, &i18n_file, &mut issues);
    issues
}

fn scan_dir_for_hardcoded(
    dir: &Path,
    locales_dir: &Path,
    i18n_file: &Path,
    issues: &mut Vec<HardcodedIssue>,
) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();

        if path.is_dir() {
            // Skip locales directory
            if path == locales_dir {
                continue;
            }
            scan_dir_for_hardcoded(&path, locales_dir, i18n_file, issues);
            continue;
        }

        let ext = path.extension().and_then(|e| e.to_str());
        if !matches!(ext, Some("js") | Some("html")) {
            continue;
        }

        // Skip the i18n system file itself
        if path == i18n_file {
            continue;
        }

        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let file_name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        for (i, line) in content.lines().enumerate() {
            if !contains_chinese(line) {
                continue;
            }
            if is_i18n_safe_line(line) {
                continue;
            }

            let phrases = extract_chinese_phrases(line);
            for phrase in phrases {
                issues.push(HardcodedIssue {
                    file: file_name.clone(),
                    line: (i + 1) as u32,
                    text: phrase,
                    context: line.trim().chars().take(120).collect(),
                });
            }
        }
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

fn check_wrong_language(locales: &[LocaleData]) -> Vec<WrongLangIssue> {
    let Some(en_us) = locales.iter().find(|l| l.code == "en-US") else {
        return Vec::new();
    };

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

            // Problem 3a: Value is identical to English and looks like a real phrase
            // (not a symbol, short code, or product name)
            let is_real_phrase = en_value.len() > 5
                && en_value.contains(' ')
                && en_value.chars().any(|c| c.is_alphabetic());

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
