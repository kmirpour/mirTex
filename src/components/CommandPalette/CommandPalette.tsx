import { useMemo, useState } from 'react';
import { Command, X } from 'lucide-react';
import { usePaperStore } from '../../stores/paperStore';

interface PaletteAction {
  id: string;
  label: string;
  shortcut?: string;
  run: () => void;
}

export function CommandPalette() {
  const open = usePaperStore((s) => s.commandPaletteOpen);
  const setOpen = usePaperStore((s) => s.setCommandPaletteOpen);
  const [query, setQuery] = useState('');

  const actions: PaletteAction[] = useMemo(() => {
    const s = usePaperStore.getState();
    return [
      { id: 'build', label: 'Compile LaTeX to PDF (TeX Live)', shortcut: 'Ctrl+Shift+B', run: () => void s.compilePdfAction(true) },
      { id: 'template', label: 'Open LaTeX Template Inspector & Slot Map', shortcut: 'Ctrl+Shift+L', run: () => s.setTemplateInspectorOpen(true) },
      { id: 'load-tpl', label: 'Import Custom .tex / .zip LaTeX Template…', run: () => void s.importLatexTemplateAction() },
      { id: 'cite', label: 'Open Zotero 10 & Bibliography Manager', shortcut: 'Ctrl+Shift+C', run: () => s.setCitationModalOpen(true) },
      { id: 'export', label: 'Export Paper (Overleaf ZIP / .tex / .docx / .md)', shortcut: 'Ctrl+E', run: () => s.setExportModalOpen(true) },
      { id: 'preflight', label: 'Run Pre-Flight Submission & Acronym Audit', run: () => s.setPreFlightOpen(true) },
      { id: 'board', label: 'Open Paper Structure Board', run: () => s.setStructureBoardOpen(true) },
      { id: 'frontpage', label: 'Edit Front Page (Title, Authors, Affiliations)', run: () => void s.selectTarget('frontmatter') },
      { id: 'new-sec', label: 'Add New Paper Section', shortcut: 'Ctrl+N', run: () => void s.addSectionAction() },
      { id: 'open-folder', label: 'Open Paper Folder…', shortcut: 'Ctrl+O', run: () => void s.openPaperFolderAction() },
      { id: 'save-all', label: 'Save All Paper Sections', shortcut: 'Ctrl+Shift+S', run: () => void s.saveAllAction() },
      { id: 'texstudio', label: 'Open Generated .tex in TeXstudio', run: () => void s.openInTexstudioAction() },
      { id: 'theme', label: 'Cycle Color Theme (13 Palettes)', shortcut: 'Ctrl+Shift+D', run: () => s.cycleTheme() },
      { id: 'focus', label: 'Toggle Distraction-Free Focus Mode', shortcut: 'F11', run: () => s.toggleFocusMode() },
      { id: 'git-commit', label: 'Save Paper Version (Git Commit)', run: () => void s.commitGitVersionAction() },
      { id: 'git-push', label: 'Push Paper to GitHub', run: () => void s.syncGithubAction() },
      { id: 'backups', label: 'Browse Rolling Section Backups…', run: () => s.setBackupsOpen(true) },
      { id: 'settings', label: 'Open MirTex Settings…', shortcut: 'Ctrl+,', run: () => s.setSettingsOpen(true) },
    ];
  }, []);

  if (!open) return null;

  const filtered = actions.filter((a) =>
    a.label.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div
        className="modal-card compact"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div className="modal-title">
            <Command size={15} /> Command Palette
          </div>
          <button type="button" className="modal-close-btn" onClick={() => setOpen(false)}>
            <X size={15} />
          </button>
        </div>
        <div style={{ padding: 12, borderBottom: '1px solid var(--border-color)' }}>
          <input
            autoFocus
            className="mirtex-input"
            placeholder="Type a command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filtered[0]) {
                setOpen(false);
                setQuery('');
                filtered[0].run();
              }
            }}
          />
        </div>
        <div className="modal-body" style={{ padding: 8, maxHeight: 360 }}>
          {filtered.map((a) => (
            <button
              key={a.id}
              type="button"
              className="toolbar-dropdown-item"
              onClick={() => {
                setOpen(false);
                setQuery('');
                a.run();
              }}
            >
              <span>{a.label}</span>
              {a.shortcut && <span className="toolbar-shortcut">{a.shortcut}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
