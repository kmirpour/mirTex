import { useMemo } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { usePaperStore } from '../../stores/paperStore';
import { runPreFlightCheck } from '../../utils/academicAnalysis';

export function PreFlightModal() {
  const open = usePaperStore((s) => s.preFlightOpen);
  const setOpen = usePaperStore((s) => s.setPreFlightOpen);
  const project = usePaperStore((s) => s.project);
  const frontMatter = usePaperStore((s) => s.frontMatter);
  const sectionContents = usePaperStore((s) => s.sectionContents);
  const bibEntries = usePaperStore((s) => s.bibEntries);
  const projectFigures = usePaperStore((s) => s.projectFigures);

  const report = useMemo(() => {
    if (!open || !project) return null;
    return runPreFlightCheck({
      frontMatter,
      sections: project.sections,
      sectionContents,
      bibEntries,
      projectFigures,
    });
  }, [open, project, frontMatter, sectionContents, bibEntries, projectFigures]);

  if (!open || !report) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-card wide" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className="modal-title">
            <CheckCircle2 size={16} /> Submission Pre-Flight & Acronym Audit
          </div>
          <button type="button" className="modal-close-btn" onClick={() => setOpen(false)}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span
              className={`pill-badge ${report.readyScore >= 85 ? 'success' : report.readyScore >= 60 ? 'warning' : 'danger'}`}
              style={{ fontSize: 13, padding: '5px 12px' }}
            >
              Readiness Score: {report.readyScore} / 100
            </span>
            <span className="pill-badge">{report.totalWords.toLocaleString()} words</span>
            <span className="pill-badge">{report.figureCount} figures</span>
            <span className="pill-badge">{report.tableCount} tables</span>
            <span className="pill-badge">{report.equationCount} equations</span>
            <span className="pill-badge">{report.citationCount} cited refs</span>
          </div>

          <div>
            <h3 style={{ fontSize: 13.5, marginBottom: 8 }}>Findings ({report.issues.length})</h3>
            {report.issues.length === 0 ? (
              <div className="pill-badge success" style={{ padding: '10px 14px', borderRadius: 7 }}>
                No issues detected — your manuscript passes all pre-flight checks!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {report.issues.map((iss, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      padding: '8px 11px',
                      borderRadius: 6,
                      border: '1px solid var(--border-color)',
                      background:
                        iss.severity === 'error'
                          ? 'var(--danger-bg)'
                          : iss.severity === 'warning'
                            ? 'var(--warning-bg)'
                            : 'var(--bg-app)',
                      fontSize: 12.5,
                    }}
                  >
                    {iss.severity === 'error' ? (
                      <AlertCircle size={15} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
                    ) : iss.severity === 'warning' ? (
                      <AlertTriangle size={15} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} />
                    ) : (
                      <Info size={15} style={{ color: 'var(--info)', flexShrink: 0, marginTop: 1 }} />
                    )}
                    <div>
                      <strong>[{iss.category}]</strong> {iss.message}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {report.acronyms.length > 0 && (
            <div>
              <h3 style={{ fontSize: 13.5, marginBottom: 8 }}>First-Use Acronym Tracker</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {report.acronyms.map((a) => (
                  <div
                    key={a.acronym}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-app)',
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong>{a.acronym}</strong>
                      <span className={`pill-badge ${a.defined ? 'success' : 'warning'}`}>
                        {a.defined ? 'Defined' : 'Undefined'}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 3 }}>
                      Used {a.count}× · First in {a.firstSection}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="mirtex-btn primary" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
