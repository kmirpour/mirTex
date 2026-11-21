import { useShallow } from 'zustand/react/shallow';
import { usePaperStore, getActiveSection, getTotalPaperWords } from '../../stores/paperStore';
import './StatusBar.css';

export function StatusBar() {
  const s = usePaperStore(
    useShallow((st) => {
      const activeSec = getActiveSection(st);
      return {
        statusMessage: st.statusMessage,
        isDirty: st.isDirty,
        lastSavedAt: st.lastSavedAt,
        selectedWordCount: st.selectedWordCount,
        hasProject: Boolean(st.project),
        hasActiveSec: Boolean(activeSec),
        secWords: activeSec?.wordCount || 0,
        secWordLimit: activeSec?.wordLimit || 0,
        totalWords: getTotalPaperWords(st),
        bibCount: st.bibEntries.length,
        documentClass: st.activeManifest.documentClass,
        zoteroConnected: Boolean(st.zoteroStatus?.connected),
        zoteroMessage: st.zoteroStatus?.message || 'Zotero status',
        pdflatexPath: st.texToolchain?.pdflatex || '',
        setTemplateInspectorOpen: st.setTemplateInspectorOpen,
        setCitationModalOpen: st.setCitationModalOpen,
        setSettingsOpen: st.setSettingsOpen,
      };
    })
  );

  const overLimit = Boolean(s.secWordLimit && s.secWords > s.secWordLimit);

  return (
    <footer className="statusbar">
      <div className="statusbar-group">
        {s.statusMessage ? (
          <span className="statusbar-message">{s.statusMessage}</span>
        ) : (
          <span>
            {s.isDirty ? 'Unsaved changes' : s.lastSavedAt ? 'Saved' : 'Ready'}
          </span>
        )}

        {s.hasActiveSec && (
          <span style={{ color: overLimit ? 'var(--danger)' : undefined, fontWeight: overLimit ? 600 : 400 }}>
            Section: {s.secWords.toLocaleString()}
            {s.secWordLimit ? ` / ${s.secWordLimit}` : ''} words
          </span>
        )}

        {s.selectedWordCount > 0 && (
          <span>Selected: {s.selectedWordCount} w</span>
        )}

        {s.hasProject && <span>Paper: {s.totalWords.toLocaleString()} words</span>}
        {s.hasProject && <span>Refs: {s.bibCount}</span>}
      </div>

      <div className="statusbar-group">
        <button
          type="button"
          className="statusbar-pill"
          onClick={() => s.setTemplateInspectorOpen(true)}
          title="Inspect active LaTeX template slots"
        >
          <span>Template: {s.documentClass}</span>
        </button>

        <button
          type="button"
          className="statusbar-pill"
          onClick={() => s.setCitationModalOpen(true)}
          title={s.zoteroMessage}
        >
          <span
            className="statusbar-dot"
            style={{
              background: s.zoteroConnected ? 'var(--success)' : 'var(--text-muted)',
            }}
          />
          <span>Zotero {s.zoteroConnected ? 'Live' : 'Offline'}</span>
        </button>

        <button
          type="button"
          className="statusbar-pill"
          onClick={() => s.setSettingsOpen(true)}
          title={s.pdflatexPath || 'TeX Live toolchain status'}
        >
          <span
            className="statusbar-dot"
            style={{
              background: s.pdflatexPath ? 'var(--success)' : 'var(--warning)',
            }}
          />
          <span>{s.pdflatexPath ? 'TeX Live Ready' : 'No local TeX'}</span>
        </button>
      </div>
    </footer>
  );
}
