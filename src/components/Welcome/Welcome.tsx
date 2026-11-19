import { BookOpen, FileCode2, FolderOpen, Sparkles } from 'lucide-react';
import { usePaperStore } from '../../stores/paperStore';
import { extractFileName, isTauri } from '../../services/fileService';
import type { PaperProject } from '../../types/paper';
import './Welcome.css';

export function Welcome() {
  const project = usePaperStore((s) => s.project);
  const recentProjects = usePaperStore((s) => s.recentProjects);
  const openPaperFolderAction = usePaperStore((s) => s.openPaperFolderAction);
  const loadPaperByPath = usePaperStore((s) => s.loadPaperByPath);
  const startDemoPaperAction = usePaperStore((s) => s.startDemoPaperAction);

  if (project) return null;

  const presets: { id: PaperProject['preset']; title: string; subtitle: string; badge: string }[] = [
    {
      id: 'springer-nature',
      title: 'Springer Nature Paper',
      subtitle: 'Abstract · Intro · Results · Discussion · Methods · Declarations',
      badge: 'Recommended',
    },
    {
      id: 'imrad',
      title: 'Standard IMRaD Article',
      subtitle: 'Abstract · Introduction · Methods · Results · Discussion · Conclusion',
      badge: 'Classic',
    },
    {
      id: 'ieee-cs',
      title: 'IEEE / CS Conference',
      subtitle: 'Abstract · Intro · Related Work · Methods · Results · IEEEtran',
      badge: 'Two-Column',
    },
  ];

  return (
    <div className="welcome-overlay">
      <div className="welcome-card">
        <div className="welcome-brand">
          <div className="welcome-logo">M</div>
          <div>
            <h1 style={{ fontSize: 22, color: 'var(--heading-color)' }}>MirTex</h1>
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>
              Distraction-free scientific paper studio with LaTeX template inspection, Zotero 10 & TeX Live PDF build.
            </p>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
            Start a Paper Folder (Choose Empty Folder or Existing Paper)
          </div>
          <div className="welcome-preset-grid">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                className="welcome-preset-card"
                onClick={() => void openPaperFolderAction(p.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <FileCode2 size={16} style={{ color: 'var(--accent-color)' }} />
                  <span className="pill-badge">{p.badge}</span>
                </div>
                <strong style={{ fontSize: 13.5 }}>{p.title}</strong>
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.4 }}>{p.subtitle}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="mirtex-btn primary"
            onClick={() => void openPaperFolderAction('springer-nature')}
          >
            <FolderOpen size={14} /> Open Existing Paper Folder…
          </button>
          {!isTauri() && (
            <button
              type="button"
              className="mirtex-btn"
              onClick={() => void startDemoPaperAction('springer-nature')}
            >
              <Sparkles size={14} /> Try In-Memory Springer Nature Demo
            </button>
          )}
        </div>

        {recentProjects.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
              Recent Papers
            </div>
            <div className="welcome-recent-list">
              {recentProjects.map((path) => (
                <button
                  key={path}
                  type="button"
                  className="welcome-recent-item"
                  onClick={() => void loadPaperByPath(path)}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <BookOpen size={14} style={{ color: 'var(--accent-color)' }} />
                    <strong>{extractFileName(path)}</strong>
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{path}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
