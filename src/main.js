// Use Bridge API for Tauri commands (supports browser fallback)
const { invoke } = window.__TAURI__?.core || {};
const { open: openDialog } = window.__TAURI__?.dialog || {};
const { listen } = window.__TAURI__?.event || {};

const t = (key, ...args) => window.i18n.t(key, ...args);

// ─── Theme ────────────────────────────────────────────────────────────────────
const THEME_CYCLE = ['system', 'light', 'dark'];
const THEME_ICON  = { system: '💻', light: '☀️', dark: '🌙' };
const THEME_LABEL_KEY = { system: 'themeSystem', light: 'themeLight', dark: 'themeDark' };

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark')       root.setAttribute('data-theme', 'dark');
  else if (theme === 'light') root.setAttribute('data-theme', 'light');
  else                        root.removeAttribute('data-theme');
  const btn = document.getElementById('btn-theme');
  if (btn) { btn.textContent = THEME_ICON[theme]; btn.title = t(THEME_LABEL_KEY[theme]); }
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

// ─── Language toggle ──────────────────────────────────────────────────────────
function initLangToggle() {
  const btn = document.getElementById('btn-lang-toggle');
  if (!btn) return;
  const updateBtn = () => {
    const lang = window.i18n.getLang();
    btn.textContent = lang === 'zh' ? 'EN' : '中';
    btn.title = lang === 'zh' ? t('langToggleToEn') : t('langToggleToZh');
  };
  updateBtn();
  btn.addEventListener('click', () => {
    const newLang = window.i18n.getLang() === 'zh' ? 'en' : 'zh';
    window.i18n.setLang(newLang);
    updateBtn();
  });
  window.addEventListener('i18n-change', () => {
    updateBtn();
    // Re-render dynamic UI elements
    applyTheme(localStorage.getItem('theme') || 'system');
    if (scanResult) {
      populateMissingLocaleFilter(scanResult.missing);
      populateWrongLocaleFilter(scanResult.wrong_lang);
      renderHardcoded();
      renderMissing();
      renderWrong();
      renderDead();
      renderAntiPatterns();
    }
    updateFixMissingBtn();
    updateTranslateButtons();
    updateTranslateWrongBtns();
    updateDeleteDeadBtn();
    // Re-apply arrow icon
    $('log-arrow').textContent = $('log-panel').classList.contains('collapsed') ? t('logArrowDown') : t('logArrowUp');
  });
}

initLangToggle();

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
  settings = await Bridge.loadSettings();
  applySettings();
  setupEventListeners();
  await Bridge.onTranslateProgress((e) => handleTranslateProgress(e.payload));
  refreshTranslationStatus();
}

function applySettings() {
  const path = settings.project_path;
  $('input-project-path').value = path;
  $('input-gemini-key').value = settings.gemini_api_key || '';
  $('select-gemini-model').value = settings.gemini_model || '';
  $('path-display').textContent = path || t('notConfigured');
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
    translationStatus = await Bridge.translationStatus(settings.project_path);
    const srcLabel = {
      settings: t('apiStatusUser'),
      env: t('apiStatusEnv'),
      default: t('apiStatusDefault'),
      none: t('apiStatusNone'),
    }[translationStatus.api_key_source] || translationStatus.api_key_source;
    status.textContent = `${translationStatus.model} · ${srcLabel}`;
    status.title = t('apiStatusTitle', translationStatus.model, srcLabel) +
      (translationStatus.api_key_source === 'default'
        ? t('apiStatusHint')
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
    const selected = await Bridge.pickDirectory(settings.project_path);
    if (selected) {
      $('input-project-path').value = selected;
    }
  } catch (e) {
    log(t('browseFailed', e), 'err');
  }
}

async function saveSettings() {
  settings.project_path = $('input-project-path').value.trim();
  settings.gemini_api_key = $('input-gemini-key').value.trim();
  settings.gemini_model = $('select-gemini-model').value;
  try {
    await Bridge.saveSettings(settings);
    applySettings();
    hideSettings();
    log(t('settingsSaved'), 'ok');
    await refreshTranslationStatus();
  } catch (e) {
    log(t('saveSettingsFailed', e), 'err');
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
  log(t('startScanLog'), 'info');

  try {
    scanResult = await Bridge.scan(settings.project_path);
    renderAll(scanResult);
    log(t('scanCompleteLog', scanResult.hardcoded.length, scanResult.missing.length, scanResult.wrong_lang.length), 'ok');
    await refreshTranslationStatus();
  } catch (e) {
    log(t('scanFailedLog', e), 'err');
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
const KIND_LABEL_KEY = {
  js: 'langJS',
  html: 'langHTML',
  rust_user_error: 'kindRustError',
  rust_user_visible: 'kindRustVisible',
  rust_internal: 'kindRustInternal',
  rust_comment: 'kindRustComment',
  rust_doc_comment: 'kindRustDocComment',
  shell_user_output: 'kindShellOutput',
  shell_internal: 'kindShellInternal',
  shell_comment: 'kindShellComment',
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
    ? t('countFormat', items.length)
    : t('countFilterFormat', items.length, total);

  if (items.length === 0) {
    tbody.innerHTML = '';
    $('hardcoded-empty').classList.remove('hidden');
    return;
  }
  $('hardcoded-empty').classList.add('hidden');

  tbody.innerHTML = items.map(i => {
    const kindLabel = t(KIND_LABEL_KEY[i.kind] || i.kind);
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
  sel.innerHTML = `<option value="">${t('allMissingLanguages')}</option>`;
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
  $('missing-count').textContent = t('keysCountFormat', items.length);
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
  btnFixMissing.textContent = checked > 0 ? t('fillBlankWithCount', checked) : t('fillBlankBtn');
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
  btnTranslateSelected.textContent = checked > 0 ? t('translateSelectedWithCount', checked) : t('translateSelected');

  // Locale button only meaningful when filter selects a single language
  btnTranslateLocale.disabled = !hasKey || !localeFilter;
  btnTranslateLocale.textContent = localeFilter ? t('translateLocaleWithCount', localeFilter) : t('translateLocale');

  if (!hasKey) {
    btnTranslateSelected.title = t('noApiKeyTitle');
    btnTranslateLocale.title = t('noApiKeyTitle');
  } else {
    btnTranslateSelected.title = t('translateSelectedTitle');
    btnTranslateLocale.title = t('translateLocaleTitle');
  }
}

async function runTranslate(mode) {
  if (translateInFlight) return;
  if (!translationStatus || translationStatus.api_key_source === 'none') {
    log(t('pleaseConfigApiKey'), 'err');
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
  $('translate-progress-text').textContent = t('preparingTranslate', targetLangs.join(', '));

  let hadError = false;
  try {
    for (const lang of targetLangs) {
      const keys = keysByLang ? keysByLang.get(lang) : null;
      log(t('startTranslateLog', lang, keys ? ` (${keys.length} ${t('colKey')})` : ''), 'info');
      try {
        const report = await Bridge.translate(
          settings.project_path,
          lang,
          keys,
          null,
          false,
        );
        log(t('reportLog', lang, report.translated, report.failed_batches, report.written_total, report.total_keys),
            report.failed_batches > 0 ? 'warn' : 'ok');
      } catch (e) {
        hadError = true;
        log(t('translateFailedLog', lang, e), 'err');
      }
    }
  } finally {
    translateInFlight = false;
    updateTranslateButtons();
  }

  if (!hadError) {
    $('translate-progress-text').textContent = t('translateDoneLog');
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
    text.textContent = t('translateProgressStart', payload.lang, payload.pending, payload.total_batches);
    fill.style.width = '0%';
    addLine(t('translateProgressStartLine', payload.lang, payload.pending, payload.total_batches), 'info');
  } else if (kind === 'batch') {
    const pct = (payload.batch_no / payload.total_batches) * 100;
    fill.style.width = `${pct.toFixed(1)}%`;
    text.textContent = t('translateProgressBatch', payload.lang, payload.batch_no, payload.total_batches);
    addLine(t('translateProgressBatchLine', payload.lang, payload.batch_no, payload.total_batches, payload.got, payload.batch_size), 'ok');
  } else if (kind === 'retry') {
    addLine(t('translateProgressRetry', payload.lang, payload.batch_no, payload.attempt, payload.message), 'warn');
  } else if (kind === 'batch_failed') {
    addLine(t('translateProgressBatchFailed', payload.lang, payload.batch_no, payload.message), 'err');
  } else if (kind === 'done') {
    text.textContent = t('translateProgressDone', payload.lang, payload.written_total, payload.source_total);
    fill.style.width = '100%';
    addLine(t('translateProgressDoneLine', payload.lang, payload.written_total, payload.source_total), 'ok');
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

  log(t('addingKeysLog', fixes.length), 'info');
  try {
    const results = await Bridge.addMissingKeys(fixes);
    results.forEach(r => log(r, r.startsWith('✓') ? 'ok' : 'err'));
    await runScan();
  } catch (e) {
    log(t('fillFailedLog', e), 'err');
  }
}

// ─── Tab 3: Wrong language ────────────────────────────────────────────────────
function populateWrongLocaleFilter(wrong) {
  const sel = $('filter-wrong-locale');
  const prev = sel.value;
  const sorted = [...new Set(wrong.map(w => w.locale))].sort();
  sel.innerHTML = `<option value="">${t('allLanguages')}</option>`;
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
  $('wrong-count').textContent = t('countItemsFormat', items.length);
  btnFixWrongAll.disabled = items.length === 0;
  btnFixWrongAll.textContent = items.length > 0 ? t('clearWithCount', items.length) : t('clearFiltered');
  checkAllWrong.checked = false;
  updateTranslateWrongBtns();

  if (items.length === 0) {
    tbody.innerHTML = '';
    $('wrong-empty').classList.remove('hidden');
    return;
  }
  $('wrong-empty').classList.add('hidden');

  tbody.innerHTML = items.map((w, idx) => {
    const typeLabel = w.issue_type === 'same_as_english' ? t('sameAsEnglishLabel') : t('containsChineseLabel');
    return `
      <tr>
        <td><input type="checkbox" class="check-wrong" data-idx="${idx}" onchange="updateTranslateWrongBtns()"></td>
        <td><span class="tag-locale">${esc(w.locale)}</span></td>
        <td class="cell-key">${esc(w.key)}</td>
        <td class="cell-value wrong" title="${esc(w.current_value)}">${esc(truncate(w.current_value, 50))}</td>
        <td class="cell-value" title="${esc(w.en_us_value)}">${esc(truncate(w.en_us_value, 50))}</td>
        <td><span class="issue-type ${w.issue_type}">${typeLabel}</span></td>
        <td>
          <button class="btn-ghost btn-sm" onclick="fixSingleWrong(${idx})">${t('clearBtn')}</button>
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
  btnTranslateWrongSelected.textContent = checked > 0 ? t('retranslateSelectedWithCount', checked) : t('retranslateSelected');

  btnTranslateWrongAll.disabled = !hasKey || filteredCount === 0;
  btnTranslateWrongAll.textContent = filteredCount > 0 ? t('retranslateFilteredWithCount', filteredCount) : t('retranslateFiltered');

  const hint = hasKey ? '' : t('noApiKeyHint');
  btnTranslateWrongSelected.title = hint || t('retranslateSelectedTitle');
  btnTranslateWrongAll.title = hint || t('retranslateFilteredTitle');
}

async function translateWrongValues(mode) {
  if (translateInFlight) return;
  if (!translationStatus || translationStatus.api_key_source === 'none') {
    log(t('pleaseConfigApiKey'), 'err');
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
  $('translate-progress-text').textContent = t('preparingRetranslate', items.length, byLocale.size);

  let hadError = false;
  try {
    for (const [lang, keys] of byLocale) {
      log(t('startTranslateLog', lang, `: ${keys.length} ${t('keysCountFormat', keys.length)}`), 'info');
      try {
        const report = await Bridge.translate(
          settings.project_path,
          lang,
          keys,
          null,
          true,
        );
        log(t('retranslateReportLog', lang, report.translated, report.failed_batches),
            report.failed_batches > 0 ? 'warn' : 'ok');
      } catch (e) {
        hadError = true;
        log(t('retranslateFailedLog', lang, e), 'err');
      }
    }
  } finally {
    translateInFlight = false;
    updateTranslateButtons();
    updateTranslateWrongBtns();
  }

  if (!hadError) {
    $('translate-progress-text').textContent = t('retranslateDoneLog');
    await runScan();
  }
}

async function fixSingleWrong(idx) {
  const item = filteredWrong[idx];
  if (!item) return;
  try {
    const result = await Bridge.clearWrongValue(item.locale_path, [item.key]);
    log(result, 'ok');
    await runScan();
  } catch (e) {
    log(t('clearFailedLog', e), 'err');
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

  log(t('clearingLog', filteredWrong.length), 'info');
  try {
    for (const [path, keys] of Object.entries(byFile)) {
      const result = await Bridge.clearWrongValue(path, keys);
      log(result, 'ok');
    }
    await runScan();
  } catch (e) {
    log(t('clearFailedLog', e), 'err');
  }
}

// ─── Log ──────────────────────────────────────────────────────────────────────
function log(msg, type = 'info') {
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  const ts = new Date().toLocaleTimeString('en-CA', { hour12: false });
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
  log(t('scanningDeadLog'), 'info');
  try {
    deadKeys = await Bridge.scanDeadKeys(settings.project_path);
    log(t('scanDeadCompleteLog', deadKeys.length), 'ok');
    applyDeadFilter();
  } catch (e) {
    log(t('scanDeadFailedLog', e), 'err');
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
    ? t('countDeadFormat', items.length)
    : t('countDeadFilterFormat', items.length, deadKeys.length);
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
  $('btn-delete-dead').textContent = checked > 0 ? t('deleteSelectedWithCount', checked) : t('deleteSelected');
}

async function deleteSelectedDeadKeys() {
  const selectedIndices = [...document.querySelectorAll('.check-dead:checked')]
    .map(cb => parseInt(cb.dataset.idx));
  if (selectedIndices.length === 0) return;
  const keys = selectedIndices.map(i => filteredDead[i].key);

  if (!confirm(t('deleteConfirm', keys.length))) return;

  log(t('deletingLog', keys.length), 'info');
  try {
    const result = await Bridge.deleteDeadKeys(settings.project_path, keys);
    log(result, 'ok');
    deadKeys = deadKeys.filter(k => !keys.includes(k.key));
    applyDeadFilter();
  } catch (e) {
    log(t('deleteFailedLog', e), 'err');
  }
}

// ─── Tab 5: Anti-patterns ─────────────────────────────────────────────────────
const ANTIPATTERN_LABEL = {
  chinese_fallback: 'kindChineseFallback',
  key_leading_space: 'kindKeyLeadingSpace',
  undefined_key: 'kindUndefinedKey',
};

async function scanAntiPatterns() {
  if (!settings.project_path) return;
  showOverlay(true);
  log(t('scanningAntiPatternLog'), 'info');
  try {
    antiPatterns = await Bridge.scanAntipatterns(settings.project_path);
    log(t('scanAntiPatternCompleteLog', antiPatterns.length), 'ok');
    applyAntiPatternFilter();
  } catch (e) {
    log(t('scanAntiPatternFailedLog', e), 'err');
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
    ? t('countAntiFormat', items.length)
    : t('countAntiFilterFormat', items.length, antiPatterns.length);

  const fallbackCount = antiPatterns.filter(a => a.kind === 'chinese_fallback').length;
  $('btn-fix-antipattern').disabled = fallbackCount === 0;
  $('btn-fix-antipattern').textContent = fallbackCount > 0
    ? t('batchFixFormat', fallbackCount)
    : t('fixChineseFallbacks');

  if (items.length === 0) {
    tbody.innerHTML = '';
    $('antipattern-empty').classList.remove('hidden');
    return;
  }
  $('antipattern-empty').classList.add('hidden');

  tbody.innerHTML = items.map(a => {
    const label = t(ANTIPATTERN_LABEL[a.kind] || a.kind);
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
  if (!confirm(t('fixConfirm'))) return;
  log(t('fixingAntiPatternLog'), 'info');
  try {
    const result = await Bridge.fixChineseFallbacks(settings.project_path);
    log(result, 'ok');
    await scanAntiPatterns();
  } catch (e) {
    log(t('fixAntiPatternFailedLog', e), 'err');
  }
}

// Expose for inline onclick handlers
window.fixSingleWrong = fixSingleWrong;
window.updateFixMissingBtn = updateFixMissingBtn;
window.updateDeleteDeadBtn = updateDeleteDeadBtn;
window.updateTranslateWrongBtns = updateTranslateWrongBtns;

// ─── Start ────────────────────────────────────────────────────────────────────
init();
