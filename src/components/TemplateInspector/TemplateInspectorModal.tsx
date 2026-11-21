import { useMemo, useState } from 'react';
import { FileCode2, FolderInput, RefreshCw, Sparkles, X } from 'lucide-react';
import { getAllAvailableTemplates, usePaperStore } from '../../stores/paperStore';
import { resolveSlotMapping } from '../../latex/templatePatcher';
import type { ExtractedSlot } from '../../types/latex';

export function TemplateInspectorModal() {
  const open = usePaperStore((s) => s.templateInspectorOpen);
  const setOpen = usePaperStore((s) => s.setTemplateInspectorOpen);
  const project = usePaperStore((s) => (s.templateInspectorOpen ? s.project : null));
  const activeManifest = usePaperStore((s) => s.activeManifest);
  const customTemplates = usePaperStore((s) => s.customTemplates);
  const importLatexTemplateAction = usePaperStore((s) => s.importLatexTemplateAction);
  const selectTemplateAction = usePaperStore((s) => s.selectTemplateAction);
  const setSlotMappingAction = usePaperStore((s) => s.setSlotMappingAction);
  const setCitationCommandModeAction = usePaperStore((s) => s.setCitationCommandModeAction);
  const syncSectionsFromTemplateAction = usePaperStore((s) => s.syncSectionsFromTemplateAction);

  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  const allTemplates = useMemo(() => {
    if (!open) return [];
    return getAllAvailableTemplates(usePaperStore.getState());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customTemplates]);

  const resolvedMap = useMemo(() => {
    if (!open || !project) return {};
    return resolveSlotMapping(activeManifest, project.sections, project.templateSlotMap);
  }, [open, activeManifest, project]);

  if (!open) return null;

  const selectedSlot: ExtractedSlot | undefined =
    activeManifest.slots.find((sl) => sl.id === selectedSlotId) ?? activeManifest.slots[0];

  const sourceLines = activeManifest.rawSource.split('\n');

  const isSectionMappable = (slot: ExtractedSlot) =>
    slot.kind === 'abstract' ||
    slot.kind === 'section' ||
    slot.kind === 'backmatter_heading' ||
    slot.kind === 'declarations' ||
    slot.kind === 'appendix';

  return (
    <div className="modal-backdrop">
      <div className="modal-card wide" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className="modal-title">
            <FileCode2 size={16} /> LaTeX Template Inspector & Slot Mapping
          </div>
          <button type="button" className="modal-close-btn" onClick={() => setOpen(false)}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Template Selector & Import Bar */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              className="mirtex-select"
              style={{ flex: 1, minWidth: 260 }}
              value={activeManifest.id}
              onChange={(e) => void selectTemplateAction(e.target.value)}
            >
              {allTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.documentClass})
                </option>
              ))}
            </select>

            <button
              type="button"
              className="mirtex-btn primary"
              onClick={() => void importLatexTemplateAction()}
            >
              <FolderInput size={14} /> Load Custom .tex / .zip Template…
            </button>

            <button
              type="button"
              className="mirtex-btn"
              disabled={!project}
              onClick={() => void syncSectionsFromTemplateAction()}
              title="Create missing sections and reorder sections to match this template"
            >
              <RefreshCw size={13} /> Sync Paper Sections
            </button>
          </div>

          {/* Detected Template Metadata Summary */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
            <span className="pill-badge info">Class: \documentclass&#123;{activeManifest.documentClass}&#125;</span>
            <span className="pill-badge">Adapter: {activeManifest.detectedAdapter}</span>
            <span className="pill-badge">Bib: {activeManifest.bibSystem}</span>
            <span className="pill-badge">Cite dialect: {activeManifest.citationDialect}</span>
            <span className="pill-badge success">{activeManifest.slots.length} slots extracted</span>
            {activeManifest.supportingFiles.length > 0 && (
              <span className="pill-badge">+{activeManifest.supportingFiles.length} supporting files</span>
            )}
            {project && (
              <label style={{ marginLeft: 'auto', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                Citation cmd:
                <select
                  className="mirtex-select"
                  style={{ width: 'auto', padding: '3px 8px', fontSize: 12 }}
                  value={project.citationCommandMode}
                  onChange={(e) =>
                    setCitationCommandModeAction(
                      e.target.value as typeof project.citationCommandMode
                    )
                  }
                >
                  <option value="auto">Auto ({activeManifest.citationDialect})</option>
                  <option value="cite">\cite&#123;&#125;</option>
                  <option value="citep">\citep / \citet (natbib)</option>
                  <option value="autocite">\autocite / \textcite (biblatex)</option>
                </select>
              </label>
            )}
          </div>

          {/* Two-Column Inspector: Extracted Slots (Left) + Highlighted .tex Source (Right) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 14, minHeight: 380 }}>
            <div
              style={{
                border: '1px solid var(--border-color)',
                borderRadius: 8,
                overflowY: 'auto',
                maxHeight: 420,
                padding: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                background: 'var(--bg-app)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', padding: '2px 4px', textTransform: 'uppercase' }}>
                Extracted Template Segments ({activeManifest.slots.length})
              </div>

              {activeManifest.slots.map((slot) => {
                const isSelected = selectedSlot?.id === slot.id;
                const mappedSecId = resolvedMap[slot.id] || '';
                const mappable = isSectionMappable(slot);

                return (
                  <div
                    key={slot.id}
                    onClick={() => setSelectedSlotId(slot.id)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: `1px solid ${isSelected ? 'var(--accent-color)' : 'var(--border-color)'}`,
                      background: isSelected ? 'var(--accent-light)' : 'var(--bg-card)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 5,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <strong style={{ fontSize: 12.5 }}>{slot.label}</strong>
                      <span className="pill-badge" style={{ fontSize: 10.5 }}>
                        {slot.kind} · L{slot.startLine}–{slot.endLine}
                      </span>
                    </div>

                    {mappable && project ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                        <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Fill with:</span>
                        <select
                          className="mirtex-select"
                          style={{ padding: '3px 7px', fontSize: 12 }}
                          value={mappedSecId}
                          onChange={(e) => setSlotMappingAction(slot.id, e.target.value)}
                        >
                          <option value="">
                            {slot.kind === 'declarations'
                              ? 'Front Page Declarations (auto)'
                              : '— Omit this template placeholder —'}
                          </option>
                          {project.sections.map((sec) => (
                            <option key={sec.id} value={sec.id}>
                              {sec.title} ({sec.role})
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Sparkles size={11} style={{ color: 'var(--accent-color)' }} />
                        {slot.kind === 'bibliography'
                          ? 'Auto-linked to project references.bib'
                          : 'Auto-populated from Front Page metadata'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Source Span Preview */}
            <div
              style={{
                border: '1px solid var(--border-color)',
                borderRadius: 8,
                overflow: 'auto',
                maxHeight: 420,
                background: 'var(--bg-editor)',
                padding: 10,
                fontFamily: 'Consolas, monospace',
                fontSize: 11.5,
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontFamily: 'inherit', fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                Template Source: <strong>{activeManifest.entryFile}</strong>
                {selectedSlot && ` (Highlighting lines ${selectedSlot.startLine}–${selectedSlot.endLine})`}
              </div>
              {sourceLines.map((line, idx) => {
                const lineNum = idx + 1;
                const highlighted =
                  selectedSlot &&
                  lineNum >= selectedSlot.startLine &&
                  lineNum <= selectedSlot.endLine;
                return (
                  <div
                    key={lineNum}
                    style={{
                      display: 'flex',
                      gap: 10,
                      padding: '0 4px',
                      background: highlighted ? 'var(--accent-light)' : 'transparent',
                      borderRadius: 3,
                    }}
                  >
                    <span style={{ width: 28, textAlign: 'right', color: 'var(--text-muted)', userSelect: 'none', flexShrink: 0 }}>
                      {lineNum}
                    </span>
                    <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{line || ' '}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="mirtex-btn primary" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
