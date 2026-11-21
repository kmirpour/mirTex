import { RefreshCw, Settings, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { usePaperStore } from '../../stores/paperStore';
import { THEMES } from '../../services/themes';
import {
  FONT_SIZE_RANGE,
  LINE_HEIGHT_RANGE,
  LINE_WIDTH_RANGE,
  TYPEFACES,
  type FontFamily,
  type TexEngine,
} from '../../services/settings';
import type { CitationStyle } from '../../types/citation';

export function SettingsModal() {
  const settingsOpen = usePaperStore((st) => st.settingsOpen);
  if (!settingsOpen) return null;
  return <SettingsModalContent />;
}

function SettingsModalContent() {
  const s = usePaperStore(
    useShallow((st) => ({
      setSettingsOpen: st.setSettingsOpen,
      theme: st.theme,
      setTheme: st.setTheme,
      fontFamily: st.fontFamily,
      setFontFamily: st.setFontFamily,
      fontSize: st.fontSize,
      setFontSize: st.setFontSize,
      lineHeight: st.lineHeight,
      setLineHeight: st.setLineHeight,
      lineWidth: st.lineWidth,
      setLineWidth: st.setLineWidth,
      autoSaveEnabled: st.autoSaveEnabled,
      setAutoSaveEnabled: st.setAutoSaveEnabled,
      smartQuotes: st.smartQuotes,
      setSmartQuotes: st.setSmartQuotes,
      citationStyle: st.citationStyle,
      setCitationStyle: st.setCitationStyle,
      texEngine: st.texEngine,
      setTexEngine: st.setTexEngine,
      zoteroPort: st.zoteroPort,
      setZoteroPort: st.setZoteroPort,
      texToolchain: st.texToolchain,
      zoteroStatus: st.zoteroStatus,
      detectToolchainAction: st.detectToolchainAction,
      pingZoteroAction: st.pingZoteroAction,
    }))
  );

  return (
    <div className="modal-backdrop">
      <div className="modal-card wide" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className="modal-title">
            <Settings size={16} /> MirTex Settings
          </div>
          <button type="button" className="modal-close-btn" onClick={() => s.setSettingsOpen(false)}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 13 Themes Grid (Zero-Re-render 16-token palette) */}
          <section>
            <h3 style={{ fontSize: 13.5, marginBottom: 10 }}>Appearance & Themes (13 Palettes)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => s.setTheme(t.id)}
                  style={{
                    padding: '9px 10px',
                    borderRadius: 7,
                    border: `2px solid ${s.theme === t.id ? 'var(--accent-color)' : 'var(--border-color)'}`,
                    background: 'var(--bg-app)',
                    color: 'var(--text-color)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', gap: 4, marginBottom: 5 }}>
                    {t.swatch.map((hex, i) => (
                      <span
                        key={i}
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          background: hex,
                          border: '1px solid rgba(128,128,128,0.35)',
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.description}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Editor Typography */}
          <section>
            <h3 style={{ fontSize: 13.5, marginBottom: 10 }}>Editor Typography</h3>
            <div className="fm-grid-2">
              <div className="fm-field">
                <label>Typeface</label>
                <select
                  className="mirtex-select"
                  value={s.fontFamily}
                  onChange={(e) => s.setFontFamily(e.target.value as FontFamily)}
                >
                  {TYPEFACES.map((tf) => (
                    <option key={tf.id} value={tf.id}>
                      {tf.label} ({tf.kind})
                    </option>
                  ))}
                </select>
              </div>
              <div className="fm-field">
                <label>Font Size: {s.fontSize}px</label>
                <input
                  type="range"
                  min={FONT_SIZE_RANGE.min}
                  max={FONT_SIZE_RANGE.max}
                  step={0.5}
                  value={s.fontSize}
                  onChange={(e) => s.setFontSize(Number(e.target.value))}
                />
              </div>
              <div className="fm-field">
                <label>Line Spacing: {s.lineHeight}</label>
                <input
                  type="range"
                  min={LINE_HEIGHT_RANGE.min}
                  max={LINE_HEIGHT_RANGE.max}
                  step={0.05}
                  value={s.lineHeight}
                  onChange={(e) => s.setLineHeight(Number(e.target.value))}
                />
              </div>
              <div className="fm-field">
                <label>Column Width: {s.lineWidth}px</label>
                <input
                  type="range"
                  min={LINE_WIDTH_RANGE.min}
                  max={LINE_WIDTH_RANGE.max}
                  step={20}
                  value={s.lineWidth}
                  onChange={(e) => s.setLineWidth(Number(e.target.value))}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 18, marginTop: 10, fontSize: 12.5 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={s.autoSaveEnabled}
                  onChange={(e) => s.setAutoSaveEnabled(e.target.checked)}
                />
                Autosave sections (1.5s debounce)
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={s.smartQuotes}
                  onChange={(e) => s.setSmartQuotes(e.target.checked)}
                />
                Smart typographic quotes
              </label>
            </div>
          </section>

          {/* Scientific, LaTeX & Zotero Configuration */}
          <section>
            <h3 style={{ fontSize: 13.5, marginBottom: 10 }}>LaTeX Toolchain & Zotero 10</h3>
            <div className="fm-grid-3">
              <div className="fm-field">
                <label>Citation & PDF Bibliography Style</label>
                <select
                  className="mirtex-select"
                  value={s.citationStyle}
                  onChange={(e) => s.setCitationStyle(e.target.value as CitationStyle)}
                >
                  <option value="nature">Nature (Numbered [1])</option>
                  <option value="ieee">IEEE (Numbered [1])</option>
                  <option value="vancouver">Vancouver (Numbered (1))</option>
                  <option value="apa">APA (Author, Year)</option>
                </select>
              </div>
              <div className="fm-field">
                <label>Local LaTeX Engine</label>
                <select
                  className="mirtex-select"
                  value={s.texEngine}
                  onChange={(e) => s.setTexEngine(e.target.value as TexEngine)}
                >
                  <option value="pdflatex">pdfLaTeX (TeX Live Default)</option>
                  <option value="xelatex">XeLaTeX (Unicode / System Fonts)</option>
                  <option value="lualatex">LuaLaTeX</option>
                </select>
              </div>
              <div className="fm-field">
                <label>Zotero Local API Port</label>
                <input
                  type="number"
                  className="mirtex-input"
                  value={s.zoteroPort}
                  onChange={(e) => s.setZoteroPort(Number(e.target.value) || 23119)}
                />
              </div>
            </div>

            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 7,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-app)',
                fontSize: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Detected Local Tools</strong>
                <button
                  type="button"
                  className="mirtex-btn"
                  style={{ padding: '3px 8px', fontSize: 11.5 }}
                  onClick={() => {
                    void s.detectToolchainAction();
                    void s.pingZoteroAction();
                  }}
                >
                  <RefreshCw size={11} /> Re-detect
                </button>
              </div>
              <div>
                <strong>pdfLaTeX:</strong> {s.texToolchain?.pdflatex || 'Not found on PATH'}
              </div>
              <div>
                <strong>BibTeX / Biber:</strong> {s.texToolchain?.bibtex ? 'BibTeX ready' : 'Missing'} ·{' '}
                {s.texToolchain?.biber ? 'Biber ready' : 'Not installed'}
              </div>
              <div>
                <strong>External Editors:</strong> TeXstudio ({s.texToolchain?.texstudio_found ? 'Detected' : 'Not detected'}) · TeXworks ({s.texToolchain?.texworks_found ? 'Detected' : 'Not detected'})
              </div>
              <div>
                <strong>Zotero 10 Local API:</strong> {s.zoteroStatus?.message || 'Not checked'}
              </div>
            </div>
          </section>
        </div>

        <div className="modal-footer">
          <button type="button" className="mirtex-btn primary" onClick={() => s.setSettingsOpen(false)}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
