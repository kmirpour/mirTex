import { useState } from 'react';
import { Camera, Check, Eye, RotateCcw, SlidersHorizontal, Trash2, X } from 'lucide-react';
import {
  usePaperStore,
  getActiveSection,
  SECTION_STATUS_LABELS,
} from '../../stores/paperStore';
import { SECTION_ROLE_LABELS, type PaperSnapshot, type SectionRole, type SectionStatus } from '../../types/paper';
import { diffLines } from '../../utils/textDiff';
import './Inspector.css';

export function Inspector() {
  const state = usePaperStore();
  const [commentText, setCommentText] = useState('');
  const [snapLabel, setSnapLabel] = useState('');
  const [diffSnap, setDiffSnap] = useState<PaperSnapshot | null>(null);

  if (!state.inspectorOpen) return null;

  const activeSec = getActiveSection(state);
  const currentMd = activeSec ? state.sectionContents[activeSec.id] ?? '' : '';
  const comments = activeSec && state.project ? state.project.comments[activeSec.fileName] || [] : [];
  const snapshots = activeSec
    ? (state.project?.snapshots || []).filter((s) => s.sectionPath === activeSec.path)
    : [];

  const words = activeSec?.wordCount || 0;
  const limit = activeSec?.wordLimit || 0;
  const pct = limit > 0 ? Math.min(100, Math.round((words / limit) * 100)) : 0;

  return (
    <aside className="inspector-panel" aria-label="Section Inspector">
      <div className="inspector-header">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <SlidersHorizontal size={14} /> Inspector
        </span>
        <button
          type="button"
          className="binder-icon-btn"
          onClick={() => state.setInspectorOpen(false)}
          title="Close Inspector"
        >
          <X size={14} />
        </button>
      </div>

      <div className="inspector-body">
        {!activeSec ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>
            Editing <strong>Front Page</strong>. Select any paper section in the sidebar to edit its
            LaTeX role, word budget, revision comments, and snapshots.
          </div>
        ) : (
          <>
            {/* Role */}
            <div className="inspector-section">
              <label className="inspector-label">LaTeX Section Role</label>
              <select
                className="mirtex-select"
                value={activeSec.role}
                onChange={(e) =>
                  state.updateSectionMeta(activeSec.id, { role: e.target.value as SectionRole })
                }
              >
                {Object.entries(SECTION_ROLE_LABELS).map(([k, lbl]) => (
                  <option key={k} value={k}>
                    {lbl}
                  </option>
                ))}
              </select>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 2 }}>
                <input
                  type="checkbox"
                  checked={Boolean(activeSec.starred)}
                  onChange={(e) =>
                    state.updateSectionMeta(activeSec.id, { starred: e.target.checked })
                  }
                />
                Unnumbered section (<code>\section*</code>)
              </label>
            </div>

            {/* Drafting Status */}
            <div className="inspector-section">
              <label className="inspector-label">Section Status</label>
              <div className="status-pills-grid">
                {(['outline', 'draft', 'revised', 'final'] as SectionStatus[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    className={`status-pill-btn ${activeSec.status === st ? 'active' : ''}`}
                    onClick={() => state.updateSectionMeta(activeSec.id, { status: st })}
                  >
                    {SECTION_STATUS_LABELS[st]}
                  </button>
                ))}
              </div>
            </div>

            {/* Journal Word Budget */}
            <div className="inspector-section">
              <label className="inspector-label">Journal Word Limit</label>
              <input
                type="number"
                min={0}
                step={50}
                className="mirtex-input"
                placeholder="0 = no limit"
                value={limit || ''}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  state.updateSectionMeta(activeSec.id, {
                    wordLimit: Number.isNaN(v) || v <= 0 ? undefined : v,
                  });
                }}
              />
              {limit > 0 && (
                <>
                  <div className="budget-bar">
                    <div
                      className={`budget-bar-fill ${words > limit ? 'over' : ''}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div style={{ fontSize: 11.5, color: words > limit ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {words.toLocaleString()} / {limit.toLocaleString()} words ({pct}%)
                  </div>
                </>
              )}
            </div>

            {/* Section Notes */}
            <div className="inspector-section">
              <label className="inspector-label">Section Notes (Not Exported)</label>
              <textarea
                className="mirtex-textarea"
                placeholder="Key claims, target figures, reviewer checklist…"
                value={activeSec.notes || ''}
                onChange={(e) => state.updateSectionMeta(activeSec.id, { notes: e.target.value })}
              />
            </div>

            {/* Revision Comments */}
            <div className="inspector-section">
              <label className="inspector-label">Revision Notes ({comments.length})</label>
              <div style={{ display: 'flex', gap: 5 }}>
                <input
                  className="mirtex-input"
                  placeholder="Add note for this section…"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && commentText.trim()) {
                      state.addCommentAction('', commentText.trim());
                      setCommentText('');
                    }
                  }}
                />
                <button
                  type="button"
                  className="mirtex-btn"
                  onClick={() => {
                    if (!commentText.trim()) return;
                    state.addCommentAction('', commentText.trim());
                    setCommentText('');
                  }}
                >
                  Add
                </button>
              </div>
              {comments.map((c) => (
                <div
                  key={c.id}
                  className="inspector-item-card"
                  style={{ opacity: c.resolved ? 0.55 : 1 }}
                >
                  <div style={{ textDecoration: c.resolved ? 'line-through' : 'none' }}>{c.text}</div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                    <button
                      type="button"
                      className="binder-icon-btn"
                      title="Toggle resolved"
                      onClick={() => state.updateCommentAction(c.id, { resolved: !c.resolved })}
                    >
                      <Check size={12} />
                    </button>
                    <button
                      type="button"
                      className="binder-icon-btn danger"
                      title="Delete note"
                      onClick={() => state.deleteCommentAction(c.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Snapshots */}
            <div className="inspector-section">
              <label className="inspector-label">Revision Snapshots ({snapshots.length})</label>
              <div style={{ display: 'flex', gap: 5 }}>
                <input
                  className="mirtex-input"
                  placeholder="e.g., Pre-submission R1"
                  value={snapLabel}
                  onChange={(e) => setSnapLabel(e.target.value)}
                />
                <button
                  type="button"
                  className="mirtex-btn"
                  onClick={() => {
                    void state.createSnapshotAction(snapLabel);
                    setSnapLabel('');
                  }}
                  title="Take named snapshot"
                >
                  <Camera size={13} />
                </button>
              </div>
              {snapshots.map((snap) => (
                <div key={snap.id} className="inspector-item-card">
                  <div style={{ fontWeight: 600 }}>{snap.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {new Date(snap.timestamp).toLocaleString()} · {snap.wordCount} w
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="mirtex-btn"
                      style={{ padding: '3px 7px', fontSize: 11 }}
                      onClick={() => setDiffSnap(snap)}
                    >
                      <Eye size={11} /> Diff
                    </button>
                    <button
                      type="button"
                      className="mirtex-btn"
                      style={{ padding: '3px 7px', fontSize: 11 }}
                      onClick={() => void state.restoreSnapshotAction(snap.id)}
                    >
                      <RotateCcw size={11} /> Restore
                    </button>
                    <button
                      type="button"
                      className="binder-icon-btn danger"
                      onClick={() => void state.deleteSnapshotAction(snap.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Snapshot Diff Modal */}
      {diffSnap && (
        <div className="modal-backdrop">
          <div className="modal-card wide">
            <div className="modal-header">
              <div className="modal-title">Diff: "{diffSnap.label}" → Current Draft</div>
              <button type="button" className="modal-close-btn" onClick={() => setDiffSnap(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body" style={{ fontFamily: 'Consolas, monospace', fontSize: 12 }}>
              {diffLines(diffSnap.content, currentMd).map((line, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '1px 6px',
                    background:
                      line.type === 'add'
                        ? 'var(--success-bg)'
                        : line.type === 'del'
                          ? 'var(--danger-bg)'
                          : 'transparent',
                    color:
                      line.type === 'add'
                        ? 'var(--success)'
                        : line.type === 'del'
                          ? 'var(--danger)'
                          : 'var(--text-color)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {line.type === 'add' ? '+ ' : line.type === 'del' ? '- ' : '  '}
                  {line.text}
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button type="button" className="mirtex-btn" onClick={() => setDiffSnap(null)}>
                Close
              </button>
              <button
                type="button"
                className="mirtex-btn primary"
                onClick={() => {
                  void state.restoreSnapshotAction(diffSnap.id);
                  setDiffSnap(null);
                }}
              >
                Restore This Snapshot
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
