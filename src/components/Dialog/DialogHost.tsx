import { useEffect, useState, type FormEvent } from 'react';
import { subscribeDialog, type ActiveDialog } from '../../services/dialogs';

export function DialogHost() {
  const [dialog, setDialog] = useState<ActiveDialog | null>(null);
  const [inputVal, setInputVal] = useState('');

  useEffect(() => {
    return subscribeDialog((d) => {
      setDialog(d);
      if (d?.kind === 'prompt') {
        setInputVal(d.options.defaultValue || '');
      }
    });
  }, []);

  if (!dialog) return null;

  const handlePromptSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (dialog.kind === 'prompt') dialog.resolve(inputVal);
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 'var(--z-dialog)' }}>
      <div className="modal-card compact" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className="modal-title">{dialog.options.title}</div>
        </div>
        <div className="modal-body">
          {dialog.options.message && (
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-color)', marginBottom: 12 }}>
              {dialog.options.message}
            </p>
          )}
          {dialog.kind === 'prompt' && (
            <form id="mirtex-prompt-form" onSubmit={handlePromptSubmit}>
              <input
                type="text"
                autoFocus
                className="mirtex-input"
                placeholder={dialog.options.placeholder}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
              />
            </form>
          )}
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="mirtex-btn"
            onClick={() =>
              dialog.kind === 'confirm' ? dialog.resolve(false) : dialog.resolve(null)
            }
          >
            {dialog.kind === 'confirm' ? dialog.options.cancelLabel || 'Cancel' : 'Cancel'}
          </button>
          {dialog.kind === 'confirm' ? (
            <button
              type="button"
              autoFocus
              className={`mirtex-btn ${dialog.options.danger ? 'danger' : 'primary'}`}
              onClick={() => dialog.resolve(true)}
            >
              {dialog.options.confirmLabel || 'Confirm'}
            </button>
          ) : (
            <button type="submit" form="mirtex-prompt-form" className="mirtex-btn primary">
              {dialog.options.confirmLabel || 'OK'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
