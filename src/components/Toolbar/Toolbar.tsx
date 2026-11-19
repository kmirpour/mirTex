import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Bold,
  BookOpen,
  BookOpenText,
  CheckCircle2,
  Columns2,
  Command as CommandIcon,
  FileCode2,
  FileDown,
  FileText,
  Focus,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  Heading2,
  Heading3,
  History,
  ImagePlus,
  Italic,
  LayoutGrid,
  List,
  ListOrdered,
  Loader2,
  Maximize2,
  MoreHorizontal,
  PanelLeft,
  PenTool,
  Play,
  Quote,
  Save,
  ScrollText,
  Search,
  Settings,
  Sigma,
  SlidersHorizontal,
  StickyNote,
  Table2,
  BookMarked,
} from 'lucide-react';
import { usePaperStore } from '../../stores/paperStore';
import { ThemeToggle } from '../ThemeToggle/ThemeToggle';
import type { ViewMode } from '../../services/settings';
import './Toolbar.css';

export function Toolbar() {
  const s = usePaperStore(
    useShallow((st) => ({
      editor: st.editorInstance,
      hasProject: Boolean(st.project),
      isDirty: st.isDirty,
      activeTarget: st.activeTarget,
      sidebarOpen: st.sidebarOpen,
      toggleSidebar: st.toggleSidebar,
      inspectorOpen: st.inspectorOpen,
      toggleInspector: st.toggleInspector,
      viewMode: st.viewMode,
      setViewMode: st.setViewMode,
      isCompilingPdf: st.isCompilingPdf,
      dimUnfocused: st.dimUnfocused,
      toggleDimUnfocused: st.toggleDimUnfocused,
      typewriterMode: st.typewriterMode,
      toggleTypewriterMode: st.toggleTypewriterMode,
      toggleFocusMode: st.toggleFocusMode,
      openPaperFolderAction: st.openPaperFolderAction,
      saveActiveAction: st.saveActiveAction,
      saveAllAction: st.saveAllAction,
      compilePdfAction: st.compilePdfAction,
      openInTexstudioAction: st.openInTexstudioAction,
      importFigureAction: st.importFigureAction,
      setTemplateInspectorOpen: st.setTemplateInspectorOpen,
      setExportModalOpen: st.setExportModalOpen,
      setCitationModalOpen: st.setCitationModalOpen,
      setPreFlightOpen: st.setPreFlightOpen,
      setStructureBoardOpen: st.setStructureBoardOpen,
      setFindReplaceOpen: st.setFindReplaceOpen,
      setCommandPaletteOpen: st.setCommandPaletteOpen,
      setSettingsOpen: st.setSettingsOpen,
      setBackupsOpen: st.setBackupsOpen,
      commitGitVersionAction: st.commitGitVersionAction,
      syncGithubAction: st.syncGithubAction,
    }))
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [menuOpen]);

  const canFormat = Boolean(s.editor) && s.activeTarget !== 'frontmatter' && s.viewMode !== 'preview';
  const chain = () => s.editor!.chain().focus();

  const insertSnippet = (snippet: string) => {
    if (!s.editor || !canFormat) return;
    s.editor.chain().focus().insertContent(snippet).run();
  };

  const handleInsertFigure = async () => {
    const res = await s.importFigureAction();
    if (!res || !s.editor) return;
    insertSnippet(`\n![Figure caption here.](${res.relPath}){#${res.label} width=0.85}\n`);
  };

  const handleInsertTable = () => {
    insertSnippet(
      `\nTable: Caption describing this table {#tbl:summary}\n| Metric | Baseline | Proposed |\n| :--- | ---: | ---: |\n| Accuracy (%) | 84.2 | **92.8** |\n| F1 Score | 0.82 | **0.91** |\n`
    );
  };

  const handleInsertEquation = () => {
    insertSnippet(`\n$$\n\\mathcal{L}(\\theta) = \\frac{1}{N} \\sum_{i=1}^{N} (y_i - \\hat{y}_i)^2\n$$ {#eq:loss}\n`);
  };

  const viewModes: { mode: ViewMode; icon: typeof PenTool; title: string }[] = [
    { mode: 'editor', icon: PenTool, title: 'Write (Editor only)' },
    { mode: 'split', icon: Columns2, title: 'Split: Editor + Live Academic Preview (KaTeX & CSL)' },
    { mode: 'pdf', icon: FileText, title: 'Split: Editor + Compiled LaTeX PDF Preview' },
    { mode: 'preview', icon: BookOpen, title: 'Read (Full Paper Preview)' },
    { mode: 'scratchpad', icon: StickyNote, title: 'Split: Editor + Lab / Reviewer Scratchpad' },
    { mode: 'reference', icon: BookOpenText, title: 'Split: Editor + Reference Section Side-by-Side' },
  ];

  return (
    <header className="toolbar">
      {/* Left: Sidebar, File & Academic Formatting */}
      <div className="toolbar-group">
        <button
          type="button"
          className={`toolbar-btn ${s.sidebarOpen ? 'active' : ''}`}
          onClick={s.toggleSidebar}
          title="Toggle Sidebar (Ctrl+\)"
        >
          <PanelLeft size={16} />
        </button>

        <button
          type="button"
          className="toolbar-btn"
          onClick={() => void s.openPaperFolderAction()}
          title="Open Paper Folder (Ctrl+O)"
        >
          <FolderOpen size={15} />
        </button>

        <button
          type="button"
          className={`toolbar-btn ${s.isDirty ? 'active' : ''}`}
          onClick={() => void s.saveActiveAction()}
          disabled={!s.hasProject}
          title="Save Section (Ctrl+S)"
        >
          <Save size={15} />
        </button>

        <div className="toolbar-divider" />

        <button
          type="button"
          className="toolbar-btn"
          disabled={!canFormat}
          onClick={() => chain().toggleBold().run()}
          title="Bold (Ctrl+B)"
        >
          <Bold size={15} />
        </button>
        <button
          type="button"
          className="toolbar-btn"
          disabled={!canFormat}
          onClick={() => chain().toggleItalic().run()}
          title="Italic (Ctrl+I)"
        >
          <Italic size={15} />
        </button>
        <button
          type="button"
          className="toolbar-btn"
          disabled={!canFormat}
          onClick={() => chain().toggleHeading({ level: 2 }).run()}
          title="Subsection (H2 -> \subsection)"
        >
          <Heading2 size={15} />
        </button>
        <button
          type="button"
          className="toolbar-btn"
          disabled={!canFormat}
          onClick={() => chain().toggleHeading({ level: 3 }).run()}
          title="Sub-subsection (H3 -> \subsubsection)"
        >
          <Heading3 size={15} />
        </button>
        <button
          type="button"
          className="toolbar-btn"
          disabled={!canFormat}
          onClick={() => chain().toggleBulletList().run()}
          title="Bullet List"
        >
          <List size={15} />
        </button>
        <button
          type="button"
          className="toolbar-btn"
          disabled={!canFormat}
          onClick={() => chain().toggleOrderedList().run()}
          title="Numbered List"
        >
          <ListOrdered size={15} />
        </button>

        <div className="toolbar-divider" />

        {/* Scientific Insert Controls */}
        <button
          type="button"
          className="toolbar-btn"
          disabled={!s.hasProject}
          onClick={() => s.setCitationModalOpen(true)}
          title="Cite / Manage Bibliography & Zotero (Ctrl+Shift+C)"
        >
          <BookMarked size={15} />
          <span className="toolbar-btn-label">Cite</span>
        </button>
        <button
          type="button"
          className="toolbar-btn"
          disabled={!canFormat}
          onClick={handleInsertEquation}
          title="Insert Numbered Display Equation ($$...$$)"
        >
          <Sigma size={15} />
          <span className="toolbar-btn-label">Math</span>
        </button>
        <button
          type="button"
          className="toolbar-btn"
          disabled={!canFormat}
          onClick={() => void handleInsertFigure()}
          title="Insert Figure Image (copies to figures/)"
        >
          <ImagePlus size={15} />
          <span className="toolbar-btn-label">Figure</span>
        </button>
        <button
          type="button"
          className="toolbar-btn"
          disabled={!canFormat}
          onClick={handleInsertTable}
          title="Insert Booktabs Table"
        >
          <Table2 size={15} />
          <span className="toolbar-btn-label">Table</span>
        </button>
      </div>

      {/* Center: 6-Mode Canvas Switcher */}
      <div className="toolbar-view-switcher" role="group" aria-label="View Mode">
        {viewModes.map(({ mode, icon: Icon, title }) => (
          <button
            key={mode}
            type="button"
            className={`toolbar-btn ${s.viewMode === mode ? 'active' : ''}`}
            onClick={() => s.setViewMode(mode)}
            title={title}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>

      {/* Right: Template Inspector, Compile PDF, Export, Theme, Inspector, More */}
      <div className="toolbar-group">
        <button
          type="button"
          className="toolbar-btn"
          disabled={!s.hasProject}
          onClick={() => s.setTemplateInspectorOpen(true)}
          title="LaTeX Template Inspector & Slot Mapping (Ctrl+Shift+L)"
        >
          <FileCode2 size={15} />
          <span className="toolbar-btn-label">Template</span>
        </button>

        <button
          type="button"
          className="toolbar-btn accent-pill"
          disabled={!s.hasProject || s.isCompilingPdf}
          onClick={() => void s.compilePdfAction(true)}
          title="Compile LaTeX to PDF via TeX Live (Ctrl+Shift+B)"
        >
          {s.isCompilingPdf ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
          <span className="toolbar-btn-label">{s.isCompilingPdf ? 'Building…' : 'Build PDF'}</span>
        </button>

        <button
          type="button"
          className="toolbar-btn"
          disabled={!s.hasProject}
          onClick={() => s.setExportModalOpen(true)}
          title="Export LaTeX / Overleaf ZIP / PDF / DOCX (Ctrl+E)"
        >
          <FileDown size={15} />
          <span className="toolbar-btn-label">Export</span>
        </button>

        <div className="toolbar-divider" />

        <ThemeToggle />

        <button
          type="button"
          className={`toolbar-btn ${s.inspectorOpen ? 'active' : ''}`}
          onClick={s.toggleInspector}
          title="Toggle Inspector Panel"
        >
          <SlidersHorizontal size={15} />
        </button>

        <div className="toolbar-menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => setMenuOpen((v) => !v)}
            title="More Tools & Settings"
          >
            <MoreHorizontal size={16} />
          </button>

          {menuOpen && (
            <div className="toolbar-dropdown">
              <div className="toolbar-dropdown-section">Scientific Tools</div>
              <button
                type="button"
                className="toolbar-dropdown-item"
                disabled={!s.hasProject}
                onClick={() => {
                  setMenuOpen(false);
                  s.setPreFlightOpen(true);
                }}
              >
                <span className="toolbar-dropdown-left">
                  <CheckCircle2 size={14} /> Pre-Flight & Acronyms Check
                </span>
              </button>
              <button
                type="button"
                className="toolbar-dropdown-item"
                disabled={!s.hasProject}
                onClick={() => {
                  setMenuOpen(false);
                  s.setStructureBoardOpen(true);
                }}
              >
                <span className="toolbar-dropdown-left">
                  <LayoutGrid size={14} /> Paper Structure Board
                </span>
              </button>
              <button
                type="button"
                className="toolbar-dropdown-item"
                disabled={!s.hasProject}
                onClick={() => {
                  setMenuOpen(false);
                  void s.openInTexstudioAction();
                }}
              >
                <span className="toolbar-dropdown-left">
                  <FileCode2 size={14} /> Open .tex in TeXstudio
                </span>
              </button>

              <div className="toolbar-dropdown-section">Writing & Focus</div>
              <button
                type="button"
                className="toolbar-dropdown-item"
                onClick={() => {
                  setMenuOpen(false);
                  s.setFindReplaceOpen(true);
                }}
              >
                <span className="toolbar-dropdown-left">
                  <Search size={14} /> Find & Replace
                </span>
                <span className="toolbar-shortcut">Ctrl+F</span>
              </button>
              <button
                type="button"
                className="toolbar-dropdown-item"
                disabled={!canFormat}
                onClick={() => {
                  setMenuOpen(false);
                  chain().toggleBlockquote().run();
                }}
              >
                <span className="toolbar-dropdown-left">
                  <Quote size={14} /> Block Quote
                </span>
              </button>
              <button
                type="button"
                className="toolbar-dropdown-item"
                onClick={() => {
                  setMenuOpen(false);
                  s.toggleDimUnfocused();
                }}
              >
                <span className="toolbar-dropdown-left">
                  <Focus size={14} /> Paragraph Focus {s.dimUnfocused ? '✓' : ''}
                </span>
                <span className="toolbar-shortcut">Ctrl+Shift+P</span>
              </button>
              <button
                type="button"
                className="toolbar-dropdown-item"
                onClick={() => {
                  setMenuOpen(false);
                  s.toggleTypewriterMode();
                }}
              >
                <span className="toolbar-dropdown-left">
                  <ScrollText size={14} /> Typewriter Scroll {s.typewriterMode ? '✓' : ''}
                </span>
                <span className="toolbar-shortcut">Ctrl+Shift+T</span>
              </button>
              <button
                type="button"
                className="toolbar-dropdown-item"
                onClick={() => {
                  setMenuOpen(false);
                  s.toggleFocusMode();
                }}
              >
                <span className="toolbar-dropdown-left">
                  <Maximize2 size={14} /> Distraction-Free Mode
                </span>
                <span className="toolbar-shortcut">F11</span>
              </button>

              <div className="toolbar-dropdown-section">Versioning & App</div>
              <button
                type="button"
                className="toolbar-dropdown-item"
                disabled={!s.hasProject}
                onClick={() => {
                  setMenuOpen(false);
                  void s.commitGitVersionAction();
                }}
              >
                <span className="toolbar-dropdown-left">
                  <GitCommitHorizontal size={14} /> Save Version (Git)
                </span>
              </button>
              <button
                type="button"
                className="toolbar-dropdown-item"
                disabled={!s.hasProject}
                onClick={() => {
                  setMenuOpen(false);
                  void s.syncGithubAction();
                }}
              >
                <span className="toolbar-dropdown-left">
                  <GitBranch size={14} /> Push to GitHub
                </span>
              </button>
              <button
                type="button"
                className="toolbar-dropdown-item"
                disabled={!s.hasProject}
                onClick={() => {
                  setMenuOpen(false);
                  s.setBackupsOpen(true);
                }}
              >
                <span className="toolbar-dropdown-left">
                  <History size={14} /> Rolling Backups…
                </span>
              </button>
              <button
                type="button"
                className="toolbar-dropdown-item"
                onClick={() => {
                  setMenuOpen(false);
                  s.setCommandPaletteOpen(true);
                }}
              >
                <span className="toolbar-dropdown-left">
                  <CommandIcon size={14} /> Command Palette
                </span>
                <span className="toolbar-shortcut">Ctrl+K</span>
              </button>
              <button
                type="button"
                className="toolbar-dropdown-item"
                onClick={() => {
                  setMenuOpen(false);
                  s.setSettingsOpen(true);
                }}
              >
                <span className="toolbar-dropdown-left">
                  <Settings size={14} /> Settings…
                </span>
                <span className="toolbar-shortcut">Ctrl+,</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
