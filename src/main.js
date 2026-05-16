const { invoke } = window.__TAURI__.core;
const { open: openDialog } = window.__TAURI__.dialog;

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
let settings = { project_path: '' };
let scanResult = null;

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
const btnFixWrongAll = $('btn-fix-wrong-all');
const checkAllMissing = $('check-all-missing');

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  settings = await invoke('i18n_load_settings');
  applySettings();
  setupEventListeners();
}

function applySettings() {
  const path = settings.project_path;
  $('input-project-path').value = path;
  $('path-display').textContent = path || '未配置项目路径';
  $('path-display').title = path;
  btnScan.disabled = !path;
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
  $('filter-missing-locale').addEventListener('change', applyMissingFilter);
  $('filter-missing-key').addEventListener('input', applyMissingFilter);
  $('filter-wrong-locale').addEventListener('change', applyWrongFilter);
  $('filter-wrong-type').addEventListener('change', applyWrongFilter);

  // Fix buttons
  btnFixMissing.addEventListener('click', fixMissingKeys);
  btnFixWrongAll.addEventListener('click', fixAllWrongValues);

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
  const path = $('input-project-path').value.trim();
  settings.project_path = path;
  try {
    await invoke('i18n_save_settings', { settings });
    applySettings();
    hideSettings();
    log('设置已保存', 'ok');
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
  filteredHardcoded = result.hardcoded;
  filteredMissing = result.missing;
  filteredWrong = result.wrong_lang;
  renderHardcoded();
  renderMissing();
  renderWrong();
}

function showUI() {
  $('locale-bar').classList.remove('hidden');
  $('tabs').classList.remove('hidden');
  switchTab('hardcoded');
  $('tab-hardcoded').classList.remove('hidden');
}

function renderLocaleBar(locales) {
  const chips = locales.map(l => {
    return `<span class="locale-chip">${l.code}<span class="chip-count">${l.total_keys}</span></span>`;
  }).join('');
  $('locale-chips').innerHTML = chips;
  $('locale-bar').classList.remove('hidden');
}

// ─── Tab 1: Hardcoded ─────────────────────────────────────────────────────────
function applyHardcodedFilter() {
  if (!scanResult) return;
  const q = $('filter-hardcoded').value.toLowerCase();
  filteredHardcoded = q
    ? scanResult.hardcoded.filter(i => i.file.toLowerCase().includes(q) || i.text.includes(q) || i.context.toLowerCase().includes(q))
    : scanResult.hardcoded;
  renderHardcoded();
}

function renderHardcoded() {
  const tbody = $('hardcoded-body');
  const items = filteredHardcoded;
  const badge = $('badge-hardcoded');
  badge.textContent = items.length;
  badge.classList.toggle('has-issues', items.length > 0);
  $('hardcoded-count').textContent = `${items.length} 处`;

  if (items.length === 0) {
    tbody.innerHTML = '';
    $('hardcoded-empty').classList.remove('hidden');
    return;
  }
  $('hardcoded-empty').classList.add('hidden');

  tbody.innerHTML = items.map(i => `
    <tr>
      <td class="cell-file">${esc(i.file)}</td>
      <td class="cell-line">${i.line}</td>
      <td class="cell-zh">${esc(i.text)}</td>
      <td class="cell-context">${esc(i.context)}</td>
    </tr>
  `).join('');
}

// ─── Tab 2: Missing translations ──────────────────────────────────────────────
function populateMissingLocaleFilter(missing) {
  const locales = new Set();
  missing.forEach(m => m.missing_in.forEach(l => locales.add(l)));
  const sel = $('filter-missing-locale');
  sel.innerHTML = '<option value="">所有缺失语言</option>';
  [...locales].sort().forEach(l => {
    sel.innerHTML += `<option value="${l}">${l}</option>`;
  });
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
  btnFixMissing.textContent = checked > 0 ? `批量补全空白键 (${checked} 项)` : '批量补全空白键';
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
  const locales = new Set(wrong.map(w => w.locale));
  const sel = $('filter-wrong-locale');
  sel.innerHTML = '<option value="">所有语言</option>';
  [...locales].sort().forEach(l => {
    sel.innerHTML += `<option value="${l}">${l}</option>`;
  });
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
  btnFixWrongAll.textContent = items.length > 0 ? `清空当前筛选的错误值 (${items.length} 项)` : '清空当前筛选的错误值';

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

// Expose for inline onclick handlers
window.fixSingleWrong = fixSingleWrong;
window.updateFixMissingBtn = updateFixMissingBtn;

// ─── Start ────────────────────────────────────────────────────────────────────
init();
