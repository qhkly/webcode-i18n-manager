// React i18n Manager - Main Application
// 参考 webcode-git-manager 的架构，适配 i18n 管理功能

const { useState, useMemo, useEffect, useRef } = React;

// ─── i18n Hook ───────────────────────────────────────────────────────────────────
function getT(key, ...args) {
  return window.i18n ? window.i18n.t(key, ...args) : key;
}

function useLocale() {
  const [locale, setLocaleState] = useState(window.i18n ? window.i18n.getLocale() : 'zh');
  useEffect(() => {
    const handler = () => setLocaleState(window.i18n.getLocale());
    window.addEventListener('i18n-change', handler);
    return () => window.removeEventListener('i18n-change', handler);
  }, []);
  return locale;
}

function useT() {
  useLocale();
  return getT;
}

// ─── Icons ───────────────────────────────────────────────────────────────────────
const Icons = {
  scan: <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>,
  cog: <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="2"/><path d="M8 1.5v1.7M8 12.8v1.7M14.5 8h-1.7M3.2 8H1.5M12.6 3.4l-1.2 1.2M4.6 11.4l-1.2 1.2M12.6 12.6l-1.2-1.2M4.6 4.6L3.4 3.4"/></svg>,
  sun: <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="2.8"/><path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.6 3.6l.85.85M11.55 11.55l.85.85M11.55 3.6l-.85.85M4.45 11.55l-.85.85"/></svg>,
  moon: <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 10.2A5.7 5.7 0 0 1 5.8 2.5a6.2 6.2 0 1 0 7.7 7.7z"/></svg>,
  auto: <svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2z" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M8 2v12A6 6 0 0 0 8 2z" fill="currentColor"/></svg>,
  translate: <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 2h6l2 4-2 4H2z"/><path d="M10 8h4M10 12h4"/><path d="M12 6v8"/></svg>,
  check: <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8l3.5 3.5L13 5"/></svg>,
  close: <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>,
  trash: <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4h10"/><path d="M6 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4"/><path d="M5 4l.5 8h5l.5-8"/></svg>,
};

const THEME_CYCLE = ['system', 'light', 'dark'];
const THEME_META = {
  system: { icon: 'auto', titleKey: 'themeSystem' },
  light: { icon: 'sun', titleKey: 'themeLight' },
  dark: { icon: 'moon', titleKey: 'themeDark' },
};

// ─── Utility Components ──────────────────────────────────────────────────────────
function Badge({ count, tone = 'default' }) {
  if (count === 0) return <span className="badge">0</span>;
  return <span className={`badge badge-${tone}`}>{count}</span>;
}

function IconButton({ title, onClick, children, disabled }) {
  return (
    <button className="btn btn-ghost" title={title} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

// ─── TopBar Component ─────────────────────────────────────────────────────────────
function TopBar({ projectPath, scanning, translationStatus, onScan, onSettings, theme, onCycleTheme }) {
  const t = useT();
  const themeMeta = THEME_META[theme] || THEME_META.system;

  return (
    <div id="toolbar">
      <div id="path-display" title={projectPath}>
        {projectPath || t('notConfigured')}
      </div>
      <div className="toolbar-actions">
        {translationStatus && (
          <span className="api-status" title={translationStatus.model}>
            {translationStatus.model}
          </span>
        )}
        <button id="btn-scan" className="btn-primary" disabled={scanning || !projectPath} onClick={onScan}>
          {t('scanBtn')}
        </button>
        <button className="btn btn-ghost" title={t(themeMeta.titleKey)} onClick={onCycleTheme}>
          {Icons[themeMeta.icon]}
        </button>
        <button className="btn btn-ghost" onClick={onSettings}>
          {Icons.cog}
          <span>{t('settingsBtn')}</span>
        </button>
      </div>
    </div>
  );
}

// ─── Settings Panel Component ─────────────────────────────────────────────────────
function SettingsPanel({ open, settings, onClose, onSave, onBrowse }) {
  const t = useT();
  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => setLocalSettings(settings), [settings]);

  if (!open) return null;

  return (
    <div id="settings-panel" className="hidden">
      <div className="settings-row">
        <label htmlFor="input-project-path">{t('settingsProjectPath')}</label>
        <input
          id="input-project-path"
          type="text"
          value={localSettings.project_path || ''}
          placeholder={t('settingsPathPlaceholder')}
          onChange={(e) => setLocalSettings({ ...localSettings, project_path: e.target.value })}
        />
        <button className="btn btn-ghost" onClick={onBrowse}>{t('settingsBrowse')}</button>
      </div>
      <div className="settings-row">
        <label htmlFor="input-gemini-key">{t('settingsGeminiKey')}</label>
        <input
          id="input-gemini-key"
          type="password"
          value={localSettings.gemini_api_key || ''}
          placeholder={t('settingsGeminiKeyPlaceholder')}
          onChange={(e) => setLocalSettings({ ...localSettings, gemini_api_key: e.target.value })}
        />
      </div>
      <div className="settings-row">
        <label htmlFor="select-gemini-model">{t('settingsModel')}</label>
        <select
          id="select-gemini-model"
          value={localSettings.gemini_model || ''}
          onChange={(e) => setLocalSettings({ ...localSettings, gemini_model: e.target.value })}
        >
          <option value="">{t('settingsModelDefault')}</option>
          <option value="gemini-2.5-flash">{t('settingsModelFlash')}</option>
          <option value="gemini-2.5-pro">{t('settingsModelPro')}</option>
        </select>
      </div>
      <div className="settings-actions">
        <button className="btn-primary" onClick={() => onSave(localSettings)}>{t('settingsSave')}</button>
        <button className="btn btn-ghost" onClick={onClose}>{t('settingsCancel')}</button>
      </div>
    </div>
  );
}

// ─── Locale Bar Component ─────────────────────────────────────────────────────────
function LocaleBar({ locales }) {
  const t = useT();
  if (!locales || locales.length === 0) return null;

  return (
    <div id="locale-bar">
      <span className="locale-bar-label">{t('loadedLanguages')}</span>
      <span id="locale-chips">
        {locales.map(l => (
          <span key={l.code} className="locale-chip">
            {l.code}<span className="chip-count">{l.total_keys}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

// ─── Tab Navigation Component ─────────────────────────────────────────────────────
function TabNav({ activeTab, onTabChange, badges }) {
  const t = useT();
  const tabs = [
    { id: 'hardcoded', labelKey: 'tabHardcoded' },
    { id: 'missing', labelKey: 'tabMissing', warn: true },
    { id: 'wrong', labelKey: 'tabWrong', warn: true },
    { id: 'dead', labelKey: 'tabDead' },
    { id: 'antipattern', labelKey: 'tabAntiPattern' },
  ];

  return (
    <div id="tabs">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          <span>{t(tab.labelKey)}</span>
          <span className={`badge ${tab.warn && badges[tab.id] > 0 ? 'badge-warn' : ''}`}>
            {badges[tab.id] ?? '—'}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Hardcoded Tab Component ───────────────────────────────────────────────────────
function HardcodedTab({ items, filtered }) {
  const t = useT();

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th style={{ width: '240px' }}>{t('colFile')}</th>
            <th style={{ width: '60px' }}>{t('colLine')}</th>
            <th style={{ width: '120px' }}>{t('colType')}</th>
            <th style={{ width: '200px' }}>{t('colChinese')}</th>
            <th>{t('colContext')}</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((item, idx) => (
            <tr key={idx}>
              <td className="cell-file" title={item.file}>{item.file}</td>
              <td className="cell-line">{item.line}</td>
              <td><span className="kind-tag">{item.kind}</span></td>
              <td className="cell-zh">{item.text}</td>
              <td className="cell-context">{item.context}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">✓</div>
          <div>{t('emptyHardcoded')}</div>
        </div>
      )}
    </div>
  );
}

// ─── Main App Component ────────────────────────────────────────────────────────────
function App() {
  const t = useT();
  const [settings, setSettings] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('hardcoded');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'system');
  const [translationStatus, setTranslationStatus] = useState(null);
  const [logs, setLogs] = useState([]);

  // Load settings on mount
  useEffect(() => {
    Bridge.loadSettings().then(setSettings);
    refreshTranslationStatus();
  }, []);

  // Theme application
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
      root.setAttribute('data-theme', 'light');
    } else {
      root.removeAttribute('data-theme');
    }
  }, [theme]);

  // Listen for translation progress
  useEffect(() => {
    const unlisten = Bridge.onTranslateProgress((event) => {
      const payload = event.payload;
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${payload.kind}: ${JSON.stringify(payload)}`]);
    });
    return unlisten;
  }, []);

  async function refreshTranslationStatus() {
    if (!settings?.project_path) return;
    try {
      const status = await Bridge.translationStatus(settings.project_path);
      setTranslationStatus(status);
    } catch (e) {
      console.error('Failed to refresh translation status:', e);
    }
  }

  async function handleScan() {
    if (!settings?.project_path) return;
    setScanning(true);
    try {
      const result = await Bridge.scan(settings.project_path);
      setScanResult(result);
    } catch (e) {
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Scan failed: ${e}`]);
    } finally {
      setScanning(false);
    }
  }

  async function handleSaveSettings(newSettings) {
    try {
      await Bridge.saveSettings(newSettings);
      setSettings(newSettings);
      setSettingsOpen(false);
      await refreshTranslationStatus();
    } catch (e) {
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Save failed: ${e}`]);
    }
  }

  async function handleBrowseFolder() {
    try {
      const selected = await Bridge.pickDirectory(settings?.project_path);
      if (selected) {
        setSettings({ ...settings, project_path: selected });
      }
    } catch (e) {
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Browse failed: ${e}`]);
    }
  }

  function cycleTheme() {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length];
    setTheme(next);
    localStorage.setItem('theme', next);
  }

  const badges = useMemo(() => ({
    hardcoded: scanResult?.hardcoded?.length ?? 0,
    missing: scanResult?.missing?.length ?? 0,
    wrong: scanResult?.wrong_lang?.length ?? 0,
    dead: '—',
    antipattern: '—',
  }), [scanResult]);

  if (!settings) {
    return <div className="scan-text">{t('loading')}</div>;
  }

  return (
    <div className="app">
      <TopBar
        projectPath={settings.project_path}
        scanning={scanning}
        translationStatus={translationStatus}
        onScan={handleScan}
        onSettings={() => setSettingsOpen(true)}
        theme={theme}
        onCycleTheme={cycleTheme}
      />
      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveSettings}
        onBrowse={handleBrowseFolder}
      />
      {scanResult && (
        <>
          <LocaleBar locales={scanResult.locales} />
          <TabNav
            activeTab={activeTab}
            onTabChange={setActiveTab}
            badges={badges}
          />
        </>
      )}
      <div id="log-panel">
        <div className="log-header">
          <span>{t('logPanel')}</span>
        </div>
        <div id="log-content">
          {logs.map((log, idx) => (
            <div key={idx} className="log-line">{log}</div>
          ))}
        </div>
      </div>
      {scanning && (
        <div id="scan-overlay">
          <div className="scan-spinner"></div>
          <div className="scan-text">{t('scanningOverlay')}</div>
        </div>
      )}
    </div>
  );
}

// Mount the app (disabled by default, enable when ready to switch to React)
const ENABLE_REACT_APP = false;

if (ENABLE_REACT_APP) {
  const root = ReactDOM.createRoot ? ReactDOM.createRoot(document.body) : null;
  if (root) {
    // React 18+
    const container = document.createElement('div');
    container.id = 'app-root';
    document.body.insertBefore(container, document.body.firstChild);
    ReactDOM.createRoot(container).render(<App />);
  } else if (document.getElementById('app-root')) {
    // Legacy React
    ReactDOM.render(<App />, document.getElementById('app-root'));
  } else {
    console.warn('[App] No root element found for React app');
  }
} else {
  console.log('[App] React app is disabled. Set ENABLE_REACT_APP=true to enable.');
  // Export App component for manual mounting if needed
  window.I18nReactApp = App;
}
