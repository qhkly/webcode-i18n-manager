const { invoke } = window.__TAURI__.core;
const { open: openDialog } = window.__TAURI__.dialog;
const { listen } = window.__TAURI__.event;

// ─── Theme ────────────────────────────────────────────────────────────────────
const THEME_CYCLE = ['system', 'light', 'dark'];
const THEME_ICON  = { system: '💻', light: '☀️', dark: '🌙' };
const THEME_LABEL = { system: '跟随系统', light: '浅色', dark: '深色' };

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark')       root.setAttribute('data-theme', 'dark');
  else if (theme === 'light') root.setAttribute('data-theme', 'light');
  else                        root.removeAttribute('data-theme');
  const btn = document.getElementById('btn-theme');
  if (btn) { btn.textContent = THEME_ICON[theme]; btn.title = THEME_LABEL[theme]; }
}

function initTheme() {
  const saved = localStorage.getItem('theme') || 'system';
  applyTheme(saved);
  document.getElementById('btn-theme').addEventListener('click', () => {
    const current = localStorage.getItem('theme') || 'system';
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length];
    localStorage.setItem('theme', next);
    applyTheme(next);
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((localStorage.getItem('theme') || 'system') === 'system') applyTheme('system');
  });
}

initTheme();

// ─── State ────────────────────────────────────────────────────────────────────
let settings = { project_path: '', gemini_api_key: '', gemini_model: '' };
let scanResult = null;
let translationStatus = null;
let translateInFlight = false;
let deadKeys = [];
let filteredDead = [];
let antiPatterns = [];
let filteredAntiPatterns = [];

// Filtered views (updated when filters change)
let filteredHardcoded = [];
let filteredMissing = [];
let filteredWrong = [];

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const btnScan = $('btn-scan');
const btnSettings = $('btn-settings');
const btnBrowse = $('btn-browse');
const btnSaveSettings = $('btn-save-settings');
const btnCancelSettings = $('btn-cancel-settings');
const btnFixMissing = $('btn-fix-missing');
const btnTranslateSelected = $('btn-translate-selected');
const btnTranslateLocale = $('btn-translate-locale');
const btnFixWrongAll = $('btn-fix-wrong-all');
const btnTranslateWrongSelected = $('btn-translate-wrong-selected');
const btnTranslateWrongAll = $('btn-translate-wrong-all');
const checkAllMissing = $('check-all-missing');
const checkAllWrong = $('check-all-wrong');

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  settings = await invoke('i18n_load_settings');
  applySettings();
  setupEventListeners();
  await listen('i18n:translate:progress', (e) => handleTranslateProgress(e.payload));
  refreshTranslationStatus();
}

function applySettings() {
  const path = settings.project_path;
  $('input-project-path').value = path;
  $('input-gemini-key').value = settings.gemini_api_key || '';
  $('select-gemini-model').value = settings.gemini_model || '';
  $('path-display').textContent = path || '未配置项目路径';
  $('path-display').title = path;
  btnScan.disabled = !path;
}

async function refreshTranslationStatus() {
  const status = $('api-status');
  if (!settings.project_path) {
    status.hidden = true;
    return;
  }
  try {
    translationStatus = await invoke('i18n_translation_status', { projectPath: settings.project_path });
    const srcLabel = {
      settings: '用户配置',
      env: '环境变量',
      default: '内置默认',
      none: '未配置',
    }[translationStatus.api_key_source] || translationStatus.api_key_source;
    status.textContent = `${translationStatus.model} · ${srcLabel}`;
    status.title = `翻译模型: ${translationStatus.model}\nAPI Key 来源: ${srcLabel}` +
      (translationStatus.api_key_source === 'default'
        ? '\n\n提示：未填写 API Key 也未读到 GOOGLE_API_KEYS 环境变量，正在使用内置默认 key（与 webclaw-launcher-tauri 共享）。'
        : '');
    status.classList.toggle('warn', translationStatus.api_key_source === 'none');
    status.hidden = false;
  } catch (e) {
    status.hidden = true;
  }
  updateTranslateButtons();
}

// ─── Event listeners ──────────────────────────────────────────────────────────
function setupEventListeners() {
  // Toolbar
  btnScan.addEventListener('click', runScan);
  btnSettings.addEventListener('click', toggleSettings);
  btnBrowse.addEventListener('click', browseFolder);
  btnSaveSettings.addEventListener('click', saveSettings);
  btnCancelSettings.addEventListener('click', hideSettings);

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Filters
  $('filter-hardcoded').addEventListener('input', applyHardcodedFilter);
  document.querySelectorAll('.lang-filter').forEach(cb => cb.addEventListener('change', applyHardcodedFilter));
  $('filter-show-comments').addEventListener('change', applyHardcodedFilter);
  $('filter-missing-locale').addEventListener('change', () => { applyMissingFilter(); updateTranslateButtons(); });
  $('filter-missing-key').addEventListener('input', applyMissingFilter);
  $('filter-wrong-locale').addEventListener('change', applyWrongFilter);
  $('filter-wrong-type').addEventListener('change', applyWrongFilter);

  // Fix buttons
  btnFixMissing.addEventListener('click', fixMissingKeys);
  btnTranslateSelected.addEventListener('click', () => runTranslate('selected'));
  btnTranslateLocale.addEventListener('click', () => runTranslate('locale'));
  $('btn-translate-close').addEventListener('click', () => $('translate-progress').classList.add('hidden'));
  btnFixWrongAll.addEventListener('click', fixAllWrongValues);
  btnTranslateWrongSelected.addEventListener('click', () => translateWrongValues('selected'));
  btnTranslateWrongAll.addEventListener('click', () => translateWrongValues('filtered'));
  checkAllWrong.addEventListener('change', e => {
    document.querySelectorAll('.check-wrong').forEach(cb => { cb.checked = e.target.checked; });
    updateTranslateWrongBtns();
  });

  // Dead keys
  $('btn-scan-dead').addEventListener('click', scanDeadKeys);
  $('btn-delete-dead').addEventListener('click', deleteSelectedDeadKeys);
  $('filter-dead').addEventListener('input', applyDeadFilter);
  $('check-all-dead').addEventListener('change', e => {
    document.querySelectorAll('.check-dead').forEach(cb => { cb.checked = e.target.checked; });
    updateDeleteDeadBtn();
  });

  // Anti-patterns
  $('btn-scan-antipattern').addEventListener('click', scanAntiPatterns);
  $('btn-fix-antipattern').addEventListener('click', fixChineseFallbacks);
  $('filter-antipattern').addEventListener('input', applyAntiPatternFilter);
  $('filter-antipattern-kind').addEventListener('change', applyAntiPatternFilter);

  // Select all missing
  checkAllMissing.addEventListener('change', e => {
    document.querySelectorAll('.check-missing').forEach(cb => {
      cb.checked = e.target.checked;
    });
    updateFixMissingBtn();
  });

  // Log toggle
  $('log-toggle').addEventListener('click', () => {
    $('log-panel').classList.toggle('collapsed');
    $('log-arrow').textContent = $('log-panel').classList.contains('collapsed') ? '▼' : '▲';
  });
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function toggleSettings() {
  $('settings-panel').classList.toggle('hidden');
}

function hideSettings() {
  $('settings-panel').classList.add('hidden');
}

async function browseFolder() {
  try {
    const selected = await openDialog({ directory: true, multiple: false });
    if (selected) {
      $('input-project-path').value = selected;
    }
  } catch (e) {
    log(`浏览文件夹失败: ${e}`, 'err');
  }
}

async function saveSettings() {
  settings.project_path = $('input-project-path').value.trim();
  settings.gemini_api_key = $('input-gemini-key').value.trim();
  settings.gemini_model = $('select-gemini-model').value;
  try {
    await invoke('i18n_save_settings', { settings });
    applySettings();
    hideSettings();
    log('设置已保存', 'ok');
    await refreshTranslationStatus();
  } catch (e) {
    log(`保存设置失败: ${e}`, 'err');
  }
}

// ─── Tab switching ────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
  $(`tab-${name}`).classList.remove('hidden');
}

// ─── Scan ─────────────────────────────────────────────────────────────────────
async function runScan() {
  if (!settings.project_path) return;
  showOverlay(true);
  log('开始扫描…', 'info');

  try {
    scanResult = await invoke('i18n_scan', { projectPath: settings.project_path });
    renderAll(scanResult);
    log(`扫描完成 — 硬编码: ${scanResult.hardcoded.length}, 缺失翻译: ${scanResult.missing.length}, 语言错误: ${scanResult.wrong_lang.length}`, 'ok');
    await refreshTranslationStatus();
  } catch (e) {
    log(`扫描失败: ${e}`, 'err');
  } finally {
    showOverlay(false);
  }
}

function showOverlay(show) {
  $('scan-overlay').classList.toggle('hidden', !show);
}

// ─── Render results ───────────────────────────────────────────────────────────
function renderAll(result) {
  renderLocaleBar(result.locales);
  showUI();
  populateMissingLocaleFilter(result.missing);
  populateWrongLocaleFilter(result.wrong_lang);
  // Re-apply filters from current dropdown/input state instead of resetting to full set.
  applyHardcodedFilter();
  applyMissingFilter();
  applyWrongFilter();
}

function showUI() {
  $('locale-bar').classList.remove('hidden');
  $('tabs').classList.remove('hidden');
  // Preserve the user's current tab across re-scans (initial HTML marks `hardcoded` as active).
  const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'hardcoded';
  switchTab(activeTab);
}

function renderLocaleBar(locales) {
  const chips = locales.map(l => {
    return `<span class="locale-chip">${l.code}<span class="chip-count">${l.total_keys}</span></span>`;
  }).join('');
  $('locale-chips').innerHTML = chips;
  $('locale-bar').classList.remove('hidden');
}

// ─── Tab 1: Hardcoded ─────────────────────────────────────────────────────────
const KIND_LABEL = {
  js: 'JS',
  html: 'HTML',
  rust_user_error: 'Rust 错误',
  rust_user_visible: 'Rust 可见',
  rust_internal: 'Rust 内部',
  rust_comment: 'Rust 注释',
  rust_doc_comment: 'Rust 文档',
  shell_user_output: 'Shell 输出',
  shell_internal: 'Shell 内部',
  shell_comment: 'Shell 注释',
};

function isCommentKind(k) {
  return k === 'rust_comment' || k === 'rust_doc_comment' || k === 'shell_comment';
}

function applyHardcodedFilter() {
  if (!scanResult) return;
  const q = $('filter-hardcoded').value.toLowerCase();
  const enabledLangs = new Set(
    [...document.querySelectorAll('.lang-filter:checked')].map(cb => cb.value)
  );
  const showComments = $('filter-show-comments').checked;

  filteredHardcoded = scanResult.hardcoded.filter(i => {
    if (!enabledLangs.has(i.language)) return false;
    if (!showComments && isCommentKind(i.kind)) return false;
    if (q && !i.file.toLowerCase().includes(q) && !i.text.includes(q) && !i.context.toLowerCase().includes(q)) return false;
    return true;
  });
  renderHardcoded();
}

function renderHardcoded() {
  const tbody = $('hardcoded-body');
  const items = filteredHardcoded;
  const total = scanResult ? scanResult.hardcoded.length : 0;
  const badge = $('badge-hardcoded');
  badge.textContent = total;
  badge.classList.toggle('has-issues', total > 0);
  $('hardcoded-count').textContent = items.length === total
    ? `${items.length} 处`
    : `${items.length} / ${total} 处`;

  if (items.length === 0) {
    tbody.innerHTML = '';
    $('hardcoded-empty').classList.remove('hidden');
    return;
  }
  $('hardcoded-empty').classList.add('hidden');

  tbody.innerHTML = items.map(i => {
    const kindLabel = KIND_LABEL[i.kind] || i.kind;
    const kindCls = i.kind === 'rust_user_error' ? 'kind-warn'
                  : isCommentKind(i.kind) ? 'kind-mute'
                  : '';
    return `
      <tr>
        <td class="cell-file" title="${esc(i.file)}">${esc(i.file)}</td>
        <td class="cell-line">${i.line}</td>
        <td><span class="kind-tag ${kindCls}">${esc(kindLabel)}</span></td>
        <td class="cell-zh">${esc(i.text)}</td>
        <td class="cell-context">${esc(i.context)}</td>
      </tr>
    `;
  }).join('');
}

// ─── Tab 2: Missing translations ──────────────────────────────────────────────
function populateMissingLocaleFilter(missing) {
  const sel = $('filter-missing-locale');
  const prev = sel.value;
  const locales = new Set();
  missing.forEach(m => m.missing_in.forEach(l => locales.add(l)));
  const sorted = [...locales].sort();
  sel.innerHTML = '<option value="">所有缺失语言</option>';
  sorted.forEach(l => { sel.innerHTML += `<option value="${l}">${l}</option>`; });
  // Preserve previous selection if it still exists.
  if (prev && sorted.includes(prev)) sel.value = prev;
}

function applyMissingFilter() {
  if (!scanResult) return;
  const locale = $('filter-missing-locale').value;
  const q = $('filter-missing-key').value.toLowerCase();
  filteredMissing = scanResult.missing.filter(m => {
    if (locale && !m.missing_in.includes(locale)) return false;
    if (q && !m.key.includes(q) && !m.zh_cn_value.includes(q) && !m.en_us_value.toLowerCase().includes(q)) return false;
    return true;
  });
  renderMissing();
}

function renderMissing() {
  const tbody = $('missing-body');
  const items = filteredMissing;
  const badge = $('badge-missing');
  badge.textContent = items.length;
  badge.classList.toggle('has-issues', items.length > 0);
  $('missing-count').textContent = `${items.length} 个键`;
  checkAllMissing.checked = false;
  updateFixMissingBtn();

  if (items.length === 0) {
    tbody.innerHTML = '';
    $('missing-empty').classList.remove('hidden');
    return;
  }
  $('missing-empty').classList.add('hidden');

  tbody.innerHTML = items.map((m, idx) => {
    const missingTags = m.missing_in.map(l => `<span class="tag-locale missing">${l}</span>`).join('');
    return `
      <tr>
        <td><input type="checkbox" class="check-missing" data-idx="${idx}" onchange="updateFixMissingBtn()"></td>
        <td class="cell-key">${esc(m.key)}</td>
        <td class="cell-zh">${esc(m.zh_cn_value)}</td>
        <td class="cell-en">${esc(m.en_us_value)}</td>
        <td class="cell-missing">${missingTags}</td>
      </tr>
    `;
  }).join('');
}

function updateFixMissingBtn() {
  const checked = document.querySelectorAll('.check-missing:checked').length;
  btnFixMissing.disabled = checked === 0;
  btnFixMissing.textContent = checked > 0 ? `补全为空白 (${checked} 项)` : '补全为空白';
  updateTranslateButtons();
}

function updateTranslateButtons() {
  if (translateInFlight) {
    btnTranslateSelected.disabled = true;
    btnTranslateLocale.disabled = true;
    return;
  }
  const hasKey = translationStatus && translationStatus.api_key_source !== 'none';
  const checked = document.querySelectorAll('.check-missing:checked').length;
  const localeFilter = $('filter-missing-locale')?.value;

  btnTranslateSelected.disabled = !hasKey || checked === 0;
  btnTranslateSelected.textContent = checked > 0 ? `翻译选中 (${checked})` : '翻译选中';

  // Locale button only meaningful when filter selects a single language
  btnTranslateLocale.disabled = !hasKey || !localeFilter;
  btnTranslateLocale.textContent = localeFilter ? `翻译此语种全部缺失 (${localeFilter})` : '翻译此语种全部缺失';

  if (!hasKey) {
    btnTranslateSelected.title = '请先到设置页配置 Gemini API Key';
    btnTranslateLocale.title = '请先到设置页配置 Gemini API Key';
  } else {
    btnTranslateSelected.title = '使用 Gemini 翻译选中的键';
    btnTranslateLocale.title = '翻译当前筛选语言所有缺失键';
  }
}

async function runTranslate(mode) {
  if (translateInFlight) return;
  if (!translationStatus || translationStatus.api_key_source === 'none') {
    log('请先到设置页配置 Gemini API Key', 'err');
    toggleSettings();
    return;
  }

  let targetLangs;
  let keysByLang = null;

  if (mode === 'selected') {
    const selectedIndices = [...document.querySelectorAll('.check-missing:checked')]
      .map(cb => parseInt(cb.dataset.idx));
    if (selectedIndices.length === 0) return;
    const issues = selectedIndices.map(i => filteredMissing[i]);
    const localeMap = new Map();
    for (const issue of issues) {
      for (const loc of issue.missing_in) {
        if (!localeMap.has(loc)) localeMap.set(loc, []);
        localeMap.get(loc).push(issue.key);
      }
    }
    targetLangs = [...localeMap.keys()];
    keysByLang = localeMap;
  } else {
    const locale = $('filter-missing-locale').value;
    if (!locale) return;
    targetLangs = [locale];
  }

  if (targetLangs.length === 0) return;

  translateInFlight = true;
  updateTranslateButtons();
  const panel = $('translate-progress');
  const logEl = $('translate-log');
  const fill = $('translate-progress-fill');
  logEl.innerHTML = '';
  fill.style.width = '0%';
  panel.classList.remove('hidden');
  $('translate-progress-text').textContent = `准备翻译 ${targetLangs.join(', ')}…`;

  let hadError = false;
  try {
    for (const lang of targetLangs) {
      const keys = keysByLang ? keysByLang.get(lang) : null;
      log(`开始翻译 ${lang}${keys ? ` (${keys.length} 个选中键)` : '（全部缺失键）'}`, 'info');
      try {
        const report = await invoke('i18n_translate', {
          projectPath: settings.project_path,
          targetLang: lang,
          keys: keys,
          sample: null,
        });
        log(`${lang}: 新译 ${report.translated} 条 / 失败 ${report.failed_batches} 批 / 写入 ${report.written_total}/${report.total_keys}`,
            report.failed_batches > 0 ? 'warn' : 'ok');
      } catch (e) {
        hadError = true;
        log(`${lang} 翻译失败: ${e}`, 'err');
      }
    }
  } finally {
    translateInFlight = false;
    updateTranslateButtons();
  }

  if (!hadError) {
    $('translate-progress-text').textContent = '翻译完成，正在重新扫描…';
    await runScan();
  }
}

function handleTranslateProgress(payload) {
  const kind = payload.kind;
  const fill = $('translate-progress-fill');
  const text = $('translate-progress-text');
  const logEl = $('translate-log');

  const addLine = (msg, cls = '') => {
    const line = document.createElement('div');
    line.className = `translate-log-line ${cls}`;
    line.textContent = msg;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  };

  if (kind === 'start') {
    text.textContent = `${payload.lang}: ${payload.pending} 个键 / ${payload.total_batches} 批`;
    fill.style.width = '0%';
    addLine(`[${payload.lang}] 开始 — ${payload.pending} 键 / ${payload.total_batches} 批`, 'info');
  } else if (kind === 'batch') {
    const pct = (payload.batch_no / payload.total_batches) * 100;
    fill.style.width = `${pct.toFixed(1)}%`;
    text.textContent = `${payload.lang}: 批次 ${payload.batch_no}/${payload.total_batches} 完成`;
    addLine(`[${payload.lang}] 批次 ${payload.batch_no}/${payload.total_batches}: ${payload.got}/${payload.batch_size}`, 'ok');
  } else if (kind === 'retry') {
    addLine(`[${payload.lang}] 批次 ${payload.batch_no} 重试 ${payload.attempt}: ${payload.message}`, 'warn');
  } else if (kind === 'batch_failed') {
    addLine(`[${payload.lang}] 批次 ${payload.batch_no} 失败: ${payload.message}`, 'err');
  } else if (kind === 'done') {
    text.textContent = `${payload.lang}: ${payload.written_total}/${payload.source_total} 已写入`;
    fill.style.width = '100%';
    addLine(`[${payload.lang}] 完成 — ${payload.written_total}/${payload.source_total}`, 'ok');
  } else if (kind === 'info') {
    addLine(payload.message, 'info');
  }
}

async function fixMissingKeys() {
  const selectedIndices = [...document.querySelectorAll('.check-missing:checked')]
    .map(cb => parseInt(cb.dataset.idx));

  if (selectedIndices.length === 0) return;

  const selectedIssues = selectedIndices.map(i => filteredMissing[i]);
  const fixes = [];

  for (const issue of selectedIssues) {
    for (const locale of issue.missing_in) {
      const localeData = scanResult.locales.find(l => l.code === locale);
      if (!localeData) continue;
      fixes.push({
        locale_path: localeData.path,
        key: issue.key,
        value: '',
      });
    }
  }

  log(`正在添加 ${fixes.length} 个键…`, 'info');
  try {
    const results = await invoke('i18n_add_missing_keys', { fixes });
    results.forEach(r => log(r, r.startsWith('✓') ? 'ok' : 'err'));
    await runScan();
  } catch (e) {
    log(`修复失败: ${e}`, 'err');
  }
}

// ─── Tab 3: Wrong language ────────────────────────────────────────────────────
function populateWrongLocaleFilter(wrong) {
  const sel = $('filter-wrong-locale');
  const prev = sel.value;
  const sorted = [...new Set(wrong.map(w => w.locale))].sort();
  sel.innerHTML = '<option value="">所有语言</option>';
  sorted.forEach(l => { sel.innerHTML += `<option value="${l}">${l}</option>`; });
  if (prev && sorted.includes(prev)) sel.value = prev;
}

function applyWrongFilter() {
  if (!scanResult) return;
  const locale = $('filter-wrong-locale').value;
  const type = $('filter-wrong-type').value;
  filteredWrong = scanResult.wrong_lang.filter(w => {
    if (locale && w.locale !== locale) return false;
    if (type && w.issue_type !== type) return false;
    return true;
  });
  renderWrong();
}

function renderWrong() {
  const tbody = $('wrong-body');
  const items = filteredWrong;
  const badge = $('badge-wrong');
  badge.textContent = items.length;
  badge.classList.toggle('has-issues', items.length > 0);
  $('wrong-count').textContent = `${items.length} 处`;
  btnFixWrongAll.disabled = items.length === 0;
  btnFixWrongAll.textContent = items.length > 0 ? `清空筛选 (${items.length})` : '清空筛选';
  checkAllWrong.checked = false;
  updateTranslateWrongBtns();

  if (items.length === 0) {
    tbody.innerHTML = '';
    $('wrong-empty').classList.remove('hidden');
    return;
  }
  $('wrong-empty').classList.add('hidden');

  tbody.innerHTML = items.map((w, idx) => {
    const typeLabel = w.issue_type === 'same_as_english' ? '与英文相同' : '含中文字符';
    return `
      <tr>
        <td><input type="checkbox" class="check-wrong" data-idx="${idx}" onchange="updateTranslateWrongBtns()"></td>
        <td><span class="tag-locale">${esc(w.locale)}</span></td>
        <td class="cell-key">${esc(w.key)}</td>
        <td class="cell-value wrong" title="${esc(w.current_value)}">${esc(truncate(w.current_value, 50))}</td>
        <td class="cell-value" title="${esc(w.en_us_value)}">${esc(truncate(w.en_us_value, 50))}</td>
        <td><span class="issue-type ${w.issue_type}">${typeLabel}</span></td>
        <td>
          <button class="btn-ghost btn-sm" onclick="fixSingleWrong(${idx})">清空</button>
        </td>
      </tr>
    `;
  }).join('');
}

function updateTranslateWrongBtns() {
  if (translateInFlight) {
    btnTranslateWrongSelected.disabled = true;
    btnTranslateWrongAll.disabled = true;
    return;
  }
  const hasKey = translationStatus && translationStatus.api_key_source !== 'none';
  const checked = document.querySelectorAll('.check-wrong:checked').length;
  const filteredCount = filteredWrong.length;

  btnTranslateWrongSelected.disabled = !hasKey || checked === 0;
  btnTranslateWrongSelected.textContent = checked > 0 ? `翻译选中 (${checked})` : '翻译选中';

  btnTranslateWrongAll.disabled = !hasKey || filteredCount === 0;
  btnTranslateWrongAll.textContent = filteredCount > 0 ? `翻译筛选全部 (${filteredCount})` : '翻译筛选全部';

  const hint = hasKey ? '' : '请先到设置页配置 Gemini API Key';
  btnTranslateWrongSelected.title = hint || '使用 Gemini 重新翻译选中的值';
  btnTranslateWrongAll.title = hint || '翻译当前筛选条件下所有错误值';
}

async function translateWrongValues(mode) {
  if (translateInFlight) return;
  if (!translationStatus || translationStatus.api_key_source === 'none') {
    log('请先到设置页配置 Gemini API Key', 'err');
    toggleSettings();
    return;
  }

  let items;
  if (mode === 'selected') {
    const indices = [...document.querySelectorAll('.check-wrong:checked')]
      .map(cb => parseInt(cb.dataset.idx));
    if (indices.length === 0) return;
    items = indices.map(i => filteredWrong[i]);
  } else {
    items = filteredWrong.slice();
  }
  if (items.length === 0) return;

  // Group by locale code
  const byLocale = new Map();
  for (const w of items) {
    if (!byLocale.has(w.locale)) byLocale.set(w.locale, []);
    byLocale.get(w.locale).push(w.key);
  }

  translateInFlight = true;
  updateTranslateButtons();
  updateTranslateWrongBtns();
  const panel = $('translate-progress');
  const logEl = $('translate-log');
  const fill = $('translate-progress-fill');
  logEl.innerHTML = '';
  fill.style.width = '0%';
  panel.classList.remove('hidden');
  $('translate-progress-text').textContent = `准备重译 ${items.length} 项（${byLocale.size} 个语种）…`;

  let hadError = false;
  try {
    for (const [lang, keys] of byLocale) {
      log(`重译 ${lang}: ${keys.length} 个键`, 'info');
      try {
        const report = await invoke('i18n_translate', {
          projectPath: settings.project_path,
          targetLang: lang,
          keys,
          sample: null,
          overwrite: true,
        });
        log(`${lang}: 新译 ${report.translated} / 失败批次 ${report.failed_batches}`,
            report.failed_batches > 0 ? 'warn' : 'ok');
      } catch (e) {
        hadError = true;
        log(`${lang} 重译失败: ${e}`, 'err');
      }
    }
  } finally {
    translateInFlight = false;
    updateTranslateButtons();
    updateTranslateWrongBtns();
  }

  if (!hadError) {
    $('translate-progress-text').textContent = '重译完成，正在重新扫描…';
    await runScan();
  }
}

async function fixSingleWrong(idx) {
  const item = filteredWrong[idx];
  if (!item) return;
  try {
    const result = await invoke('i18n_clear_wrong_value', {
      localePath: item.locale_path,
      keys: [item.key],
    });
    log(result, 'ok');
    await runScan();
  } catch (e) {
    log(`清空失败: ${e}`, 'err');
  }
}

async function fixAllWrongValues() {
  if (filteredWrong.length === 0) return;

  // Group by locale_path
  const byFile = {};
  for (const w of filteredWrong) {
    if (!byFile[w.locale_path]) byFile[w.locale_path] = [];
    byFile[w.locale_path].push(w.key);
  }

  log(`正在清空 ${filteredWrong.length} 个错误值…`, 'info');
  try {
    for (const [path, keys] of Object.entries(byFile)) {
      const result = await invoke('i18n_clear_wrong_value', {
        localePath: path,
        keys,
      });
      log(result, 'ok');
    }
    await runScan();
  } catch (e) {
    log(`清空失败: ${e}`, 'err');
  }
}

// ─── Log ──────────────────────────────────────────────────────────────────────
function log(msg, type = 'info') {
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  line.textContent = `[${ts}] ${msg}`;
  const content = $('log-content');
  content.appendChild(line);
  content.scrollTop = content.scrollHeight;
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// ─── Tab 4: Dead keys ─────────────────────────────────────────────────────────
async function scanDeadKeys() {
  if (!settings.project_path) return;
  showOverlay(true);
  log('扫描死键…', 'info');
  try {
    deadKeys = await invoke('i18n_scan_dead_keys', { projectPath: settings.project_path });
    log(`扫描完成 — 发现 ${deadKeys.length} 个死键`, 'ok');
    applyDeadFilter();
  } catch (e) {
    log(`扫描死键失败: ${e}`, 'err');
  } finally {
    showOverlay(false);
  }
}

function applyDeadFilter() {
  const q = $('filter-dead').value.toLowerCase();
  filteredDead = q
    ? deadKeys.filter(k => k.key.toLowerCase().includes(q) || k.zh_value.includes(q))
    : deadKeys.slice();
  renderDead();
}

function renderDead() {
  const tbody = $('dead-body');
  const items = filteredDead;
  const badge = $('badge-dead');
  badge.textContent = deadKeys.length;
  badge.classList.toggle('has-issues', deadKeys.length > 0);
  $('dead-count').textContent = items.length === deadKeys.length
    ? `${items.length} 个`
    : `${items.length} / ${deadKeys.length} 个`;
  $('check-all-dead').checked = false;
  updateDeleteDeadBtn();

  if (items.length === 0) {
    tbody.innerHTML = '';
    $('dead-empty').classList.remove('hidden');
    return;
  }
  $('dead-empty').classList.add('hidden');

  tbody.innerHTML = items.map((k, idx) => `
    <tr>
      <td><input type="checkbox" class="check-dead" data-idx="${idx}" onchange="updateDeleteDeadBtn()"></td>
      <td class="cell-key">${esc(k.key)}</td>
      <td class="cell-zh">${esc(k.zh_value)}</td>
    </tr>
  `).join('');
}

function updateDeleteDeadBtn() {
  const checked = document.querySelectorAll('.check-dead:checked').length;
  $('btn-delete-dead').disabled = checked === 0;
  $('btn-delete-dead').textContent = checked > 0 ? `删除选中 (${checked})` : '删除选中';
}

async function deleteSelectedDeadKeys() {
  const selectedIndices = [...document.querySelectorAll('.check-dead:checked')]
    .map(cb => parseInt(cb.dataset.idx));
  if (selectedIndices.length === 0) return;
  const keys = selectedIndices.map(i => filteredDead[i].key);

  if (!confirm(`将从所有 locale 文件删除 ${keys.length} 个键，并备份到 .i18n-backup/。继续？`)) return;

  log(`删除 ${keys.length} 个死键…`, 'info');
  try {
    const result = await invoke('i18n_delete_dead_keys', { projectPath: settings.project_path, keys });
    log(result, 'ok');
    deadKeys = deadKeys.filter(k => !keys.includes(k.key));
    applyDeadFilter();
  } catch (e) {
    log(`删除失败: ${e}`, 'err');
  }
}

// ─── Tab 5: Anti-patterns ─────────────────────────────────────────────────────
const ANTIPATTERN_LABEL = {
  chinese_fallback: '中文兜底',
  key_leading_space: 'key 前导空格',
  undefined_key: '未定义 key',
};

async function scanAntiPatterns() {
  if (!settings.project_path) return;
  showOverlay(true);
  log('扫描反模式…', 'info');
  try {
    antiPatterns = await invoke('i18n_scan_antipatterns', { projectPath: settings.project_path });
    log(`扫描完成 — 发现 ${antiPatterns.length} 处反模式`, 'ok');
    applyAntiPatternFilter();
  } catch (e) {
    log(`扫描反模式失败: ${e}`, 'err');
  } finally {
    showOverlay(false);
  }
}

function applyAntiPatternFilter() {
  const q = $('filter-antipattern').value.toLowerCase();
  const kind = $('filter-antipattern-kind').value;
  filteredAntiPatterns = antiPatterns.filter(a => {
    if (kind && a.kind !== kind) return false;
    if (q && !a.file.toLowerCase().includes(q) && !a.key.includes(q) && !a.context.toLowerCase().includes(q)) return false;
    return true;
  });
  renderAntiPatterns();
}

function renderAntiPatterns() {
  const tbody = $('antipattern-body');
  const items = filteredAntiPatterns;
  const badge = $('badge-antipattern');
  badge.textContent = antiPatterns.length;
  badge.classList.toggle('has-issues', antiPatterns.length > 0);
  $('antipattern-count').textContent = items.length === antiPatterns.length
    ? `${items.length} 处`
    : `${items.length} / ${antiPatterns.length} 处`;

  const fallbackCount = antiPatterns.filter(a => a.kind === 'chinese_fallback').length;
  $('btn-fix-antipattern').disabled = fallbackCount === 0;
  $('btn-fix-antipattern').textContent = fallbackCount > 0
    ? `批量自动修复中文兜底 (${fallbackCount})`
    : '批量自动修复中文兜底';

  if (items.length === 0) {
    tbody.innerHTML = '';
    $('antipattern-empty').classList.remove('hidden');
    return;
  }
  $('antipattern-empty').classList.add('hidden');

  tbody.innerHTML = items.map(a => {
    const label = ANTIPATTERN_LABEL[a.kind] || a.kind;
    const cls = a.kind === 'chinese_fallback' ? 'kind-warn' : '';
    return `
      <tr>
        <td class="cell-file" title="${esc(a.file)}">${esc(a.file)}</td>
        <td class="cell-line">${a.line}</td>
        <td><span class="kind-tag ${cls}">${esc(label)}</span></td>
        <td class="cell-key">${esc(a.key)}</td>
        <td class="cell-context">${esc(a.context)}</td>
      </tr>
    `;
  }).join('');
}

async function fixChineseFallbacks() {
  if (!confirm('将自动删除所有 t(...) || "中文" 模式的后半段（保留 t() 调用，依赖 zh-CN 顶层回退）。文件会备份到 .i18n-backup/。继续？')) return;
  log('修复中文兜底反模式…', 'info');
  try {
    const result = await invoke('i18n_fix_chinese_fallbacks', { projectPath: settings.project_path });
    log(result, 'ok');
    await scanAntiPatterns();
  } catch (e) {
    log(`修复失败: ${e}`, 'err');
  }
}

// Expose for inline onclick handlers
window.fixSingleWrong = fixSingleWrong;
window.updateFixMissingBtn = updateFixMissingBtn;
window.updateDeleteDeadBtn = updateDeleteDeadBtn;
window.updateTranslateWrongBtns = updateTranslateWrongBtns;

// ─── Start ────────────────────────────────────────────────────────────────────
init();
