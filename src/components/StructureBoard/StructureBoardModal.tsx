import { LayoutGrid, X } from 'lucide-react';
import { SECTION_STATUS_LABELS, usePaperStore } from '../../stores/paperStore';
import { SECTION_ROLE_LABELS } from '../../types/paper';

export function StructureBoardModal() {
  const open = usePaperStore((s) => s.structureBoardOpen);
  const setOpen = usePaperStore((s) => s.setStructureBoardOpen);
  const project = usePaperStore((s) => s.project);
  const selectTarget = usePaperStore((s) => s.selectTarget);

  if (!open || !project) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-card wide" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className="modal-title">
            <LayoutGrid size={16} /> Paper Structure Board ({project.sections.length} Sections)
          </div>
          <button type="button" className="modal-close-btn" onClick={() => setOpen(false)}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
            {project.sections.map((sec, idx) => {
              const words = sec.wordCount || 0;
              const limit = sec.wordLimit || 0;
              const pct = limit > 0 ? Math.min(100, Math.round((words / limit) * 100)) : 0;
              return (
                <div
                  key={sec.id}
                  onClick={() => {
                    void selectTarget(sec.id);
                    setOpen(false);
                  }}
                  style={{
                    padding: 14,
                    borderRadius: 8,
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-app)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="pill-badge">{idx + 1}. {SECTION_ROLE_LABELS[sec.role]}</span>
                    <span style={{ fontSize: 11, color: `var(--status-${sec.status})`, fontWeight: 600 }}>
                      {SECTION_STATUS_LABELS[sec.status]}
                    </span>
                  </div>
                  <strong style={{ fontSize: 14, color: 'var(--heading-color)' }}>{sec.title}</strong>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', minHeight: 34, lineHeight: 1.45 }}>
                    {sec.notes || `${sec.subsections?.length || 0} subsection(s)`}
                  </p>
                  <div style={{ marginTop: 'auto' }}>
                    <div style={{ fontSize: 11.5, color: limit && words > limit ? 'var(--danger)' : 'var(--text-muted)' }}>
                      {words.toLocaleString()} {limit ? `/ ${limit.toLocaleString()} words` : 'words'}
                    </div>
                    {limit > 0 && (
                      <div className="budget-bar" style={{ marginTop: 4 }}>
                        <div
                          className={`budget-bar-fill ${words > limit ? 'over' : ''}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="mirtex-btn" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
