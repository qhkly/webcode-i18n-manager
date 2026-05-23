// React Modal Components for i18n Manager
// 参考 webcode-git-manager 的模态框设计

const { useEffect } = React;

// ─── Utility Functions ─────────────────────────────────────────────────────────────
function getT(key, params) {
  return window.i18n ? window.i18n.t(key, params) : key;
}

function useLocale() {
  const [, setLocaleState] = React.useState(window.i18n ? window.i18n.getLocale() : 'zh');
  React.useEffect(() => {
    const handler = () => setLocaleState(window.i18n.getLocale());
    window.addEventListener('i18n-change', handler);
    return () => window.removeEventListener('i18n-change', handler);
  }, []);
}

// ─── Generic Modal Component ───────────────────────────────────────────────────────
function Modal({ open, onClose, title, sub, width = 640, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div className="modal-title">
            <div className="modal-t1">{title}</div>
            {sub && <div className="modal-t2">{sub}</div>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label={getT("closeBtn")}>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────────
function ConfirmModal({ open, onClose, onConfirm, title, message, confirmText = '确认', cancelText = '取消', danger = false }) {
  useLocale();
  const t = getT;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={480}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>{t(cancelText)}</button>
          <button className={`btn ${danger ? 'btn-warn' : 'btn-primary'}`} onClick={() => { onConfirm(); onClose(); }}>
            {t(confirmText)}
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}

// ─── Input Modal ─────────────────────────────────────────────────────────────────
function InputModal({ open, onClose, onConfirm, title, defaultValue = '', placeholder = '', label = '' }) {
  useLocale();
  const t = getT;
  const [value, setValue] = React.useState(defaultValue);
  const inputRef = React.useRef(null);

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, defaultValue]);

  const handleConfirm = () => {
    onConfirm(value);
    setValue('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleConfirm();
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={540}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn btn-primary" onClick={handleConfirm}>{t('confirm')}</button>
        </>
      }
    >
      {label && <label>{label}</label>}
      <input
        ref={inputRef}
        type="text"
        className="modal-input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
      />
    </Modal>
  );
}

// ─── Progress Modal ───────────────────────────────────────────────────────────────
function ProgressModal({ open, onClose, title, progress, message, total }) {
  useLocale();
  const t = getT;
  const percentage = total > 0 ? Math.round((progress / total) * 100) : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={540}
    >
      <div className="progress-container">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${percentage}%` }}></div>
        </div>
        <div className="progress-text">
          {t('progressFormat', progress, total, percentage)}
        </div>
        {message && <div className="progress-message">{message}</div>}
      </div>
    </Modal>
  );
}

// ─── Export Components ─────────────────────────────────────────────────────────────
window.Modals = {
  Modal,
  ConfirmModal,
  InputModal,
  ProgressModal,
};
