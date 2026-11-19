import { usePaperStore, getActiveSection, getTotalPaperWords } from '../../stores/paperStore';
import './StatusBar.css';

export function StatusBar() {
  const state = usePaperStore();
  const activeSec = getActiveSection(state);
  const totalWords = getTotalPaperWords(state);
  const secWords = activeSec?.wordCount || 0;
  const overLimit = Boolean(activeSec?.wordLimit && secWords > activeSec.wordLimit);

  return (
    <footer className="statusbar">
      <div className="statusbar-group">
        {state.statusMessage ? (
          <span className="statusbar-message">{state.statusMessage}</span>
        ) : (
          <span>
            {state.isDirty ? 'Unsaved changes' : state.lastSavedAt ? 'Saved' : 'Ready'}
          </span>
        )}

        {activeSec && (
          <span style={{ color: overLimit ? 'var(--danger)' : undefined, fontWeight: overLimit ? 600 : 400 }}>
            Section: {secWords.toLocaleString()}
            {activeSec.wordLimit ? ` / ${activeSec.wordLimit}` : ''} words
          </span>
        )}

        {state.selectedWordCount > 0 && (
          <span>Selected: {state.selectedWordCount} w</span>
        )}

        {state.project && <span>Paper: {totalWords.toLocaleString()} words</span>}
        {state.project && <span>Refs: {state.bibEntries.length}</span>}
      </div>

      <div className="statusbar-group">
        <button
          type="button"
          className="statusbar-pill"
          onClick={() => state.setTemplateInspectorOpen(true)}
          title="Inspect active LaTeX template slots"
        >
          <span>Template: {state.activeManifest.documentClass}</span>
        </button>

        <button
          type="button"
          className="statusbar-pill"
          onClick={() => state.setCitationModalOpen(true)}
          title={state.zoteroStatus?.message || 'Zotero status'}
        >
          <span
            className="statusbar-dot"
            style={{
              background: state.zoteroStatus?.connected ? 'var(--success)' : 'var(--text-muted)',
            }}
          />
          <span>Zotero {state.zoteroStatus?.connected ? 'Live' : 'Offline'}</span>
        </button>

        <button
          type="button"
          className="statusbar-pill"
          onClick={() => state.setSettingsOpen(true)}
          title={state.texToolchain?.pdflatex || 'TeX Live toolchain status'}
        >
          <span
            className="statusbar-dot"
            style={{
              background: state.texToolchain?.pdflatex ? 'var(--success)' : 'var(--warning)',
            }}
          />
          <span>{state.texToolchain?.pdflatex ? 'TeX Live Ready' : 'No local TeX'}</span>
        </button>
      </div>
    </footer>
  );
}
