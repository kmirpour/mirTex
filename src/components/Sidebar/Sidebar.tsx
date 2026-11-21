import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  BookMarked,
  ChevronDown,
  ChevronRight,
  Edit2,
  FileText,
  GripVertical,
  Image,
  Layers,
  Plus,
  Sigma,
  Sparkles,
  Table2,
  Trash2,
} from 'lucide-react';
import { flushPendingEditorUpdate, usePaperStore } from '../../stores/paperStore';
import { cleanBibValue, formatAuthorShort } from '../../citations/bibtex';
import {
  cleanFigureCaption,
  formatWordsCompact,
  indexPaperElements,
  mergePaperAndFolderFigures,
  type IndexedElement,
} from '../../utils/paperOutline';
import { normalizeAcademicMarkdown } from '../../utils/normalizeAcademicMarkdown';
import { promptDialog } from '../../services/dialogs';
import './Sidebar.css';

const EMPTY_SECTIONS: Record<string, string> = {};

export function Sidebar() {
  const s = usePaperStore(
    useShallow((st) => ({
      sidebarOpen: st.sidebarOpen,
      sidebarTab: st.sidebarTab,
      setSidebarTab: st.setSidebarTab,
      project: st.project,
      frontMatter: st.frontMatter,
      sectionContents:
        st.sidebarOpen && st.sidebarTab === 'elements' ? st.sectionContents : EMPTY_SECTIONS,
      activeTarget: st.activeTarget,
      selectTarget: st.selectTarget,
      addSectionAction: st.addSectionAction,
      renameSectionAction: st.renameSectionAction,
      reorderSectionsAction: st.reorderSectionsAction,
      deleteSectionAction: st.deleteSectionAction,
      bibEntries: st.bibEntries,
      zoteroStatus: st.zoteroStatus,
      setCitationModalOpen: st.setCitationModalOpen,
      setTemplateInspectorOpen: st.setTemplateInspectorOpen,
      activeManifest: st.activeManifest,
      editorInstance: st.editorInstance,
      projectFigures: st.projectFigures,
      refreshFiguresAction: st.refreshFiguresAction,
    }))
  );

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [refFilter, setRefFilter] = useState('');

  useEffect(() => {
    if (s.sidebarOpen && s.sidebarTab === 'elements') {
      void usePaperStore.getState().refreshFiguresAction();
    }
  }, [s.sidebarOpen, s.sidebarTab]);

  const indexedElements = useMemo(() => {
    if (!s.sidebarOpen || s.sidebarTab !== 'elements' || !s.project) return [];
    return mergePaperAndFolderFigures(
      indexPaperElements(
        s.project.sections.map((sec) => ({
          id: sec.id,
          title: sec.title,
          markdown: s.sectionContents[sec.id] ?? '',
        }))
      ),
      s.projectFigures
    ).filter((e) => e.kind !== 'section');
  }, [s.sidebarOpen, s.sidebarTab, s.project, s.sectionContents, s.projectFigures]);

  const filteredRefs = useMemo(() => {
    const q = refFilter.trim().toLowerCase();
    if (!q) return s.bibEntries;
    return s.bibEntries.filter(
      (e) =>
        e.key.toLowerCase().includes(q) ||
        (e.fields.title || '').toLowerCase().includes(q) ||
        (e.fields.author || '').toLowerCase().includes(q) ||
        (e.fields.year || '').includes(q)
    );
  }, [s.bibEntries, refFilter]);

  if (!s.sidebarOpen) return null;

  const insertIntoEditor = (text: string) => {
    if (s.editorInstance && s.activeTarget !== 'frontmatter') {
      s.editorInstance.chain().focus().insertContent(text).run();
    }
  };

  const handleSidebarInsertFigure = async (el: IndexedElement) => {
    if (!s.editorInstance || s.activeTarget === 'frontmatter' || !el.imagePath) return;
    const caption = await promptDialog({
      title: `Insert Figure (${el.imagePath})`,
      message: 'Enter the figure caption (appears after "Figure #:" in the PDF):',
      placeholder: 'Describe what this figure shows…',
      defaultValue: '',
      confirmLabel: 'Insert Figure',
    });
    if (caption === null || s.editorInstance.isDestroyed) return;
    const embedLine = `![${caption.trim()}](${el.imagePath}){#${el.label} width=0.85}`;
    const { $from } = s.editorInstance.state.selection;
    if ($from.parent.textContent.trim().length === 0) {
      s.editorInstance.chain().focus().insertContent({ type: 'text', text: embedLine }).run();
    } else {
      const insertPos = $from.depth > 0 ? $from.after() : s.editorInstance.state.doc.content.size;
      s.editorInstance
        .chain()
        .focus()
        .insertContentAt(insertPos, {
          type: 'paragraph',
          content: [{ type: 'text', text: embedLine }],
        })
        .run();
    }
  };

  const handleSidebarEditCaption = async (el: IndexedElement) => {
    if (el.kind !== 'figure' || el.sectionId === 'figures-folder') return;
    flushPendingEditorUpdate();
    const store = usePaperStore.getState();
    const rawMd = store.sectionContents[el.sectionId] ?? '';
    const normMd = normalizeAcademicMarkdown(rawMd);
    const defaultCap =
      el.title === `Figure ${el.number}`
        ? ''
        : cleanFigureCaption(el.title, el.imagePath || el.label);

    const nextCap = await promptDialog({
      title: `Edit Figure Caption (@${el.label})`,
      message: 'Enter the figure caption (appears after "Figure #:" in the PDF):',
      placeholder: 'Describe what this figure shows…',
      defaultValue: defaultCap,
      confirmLabel: 'Save Caption',
    });
    if (nextCap === null) return;

    const cleanNext = nextCap.trim();
    const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let updatedMd = normMd;

    const explicitByLabelRe = new RegExp(
      `!\\[(?:[^[\\]\\n]|\\[[^[\\]\\n]*\\])*\\]\\(([^)\\n]+)\\)([ \\t]*\\{[^}\\n]*#${esc(el.label)}(?![a-zA-Z0-9_.-])[^}\\n]*\\})(?:[ \\t]*\\n(?:[ \\t]*\\n)?(?:Caption|Figure):[ \\t]*.+?)?(?=\\n|$)`,
      'i'
    );
    if (explicitByLabelRe.test(updatedMd)) {
      updatedMd = updatedMd.replace(explicitByLabelRe, `![${cleanNext}]($1)$2`);
    } else if (el.imagePath) {
      const explicitByPathRe = new RegExp(
        `!\\[(?:[^[\\]\\n]|\\[[^[\\]\\n]*\\])*\\]\\((${esc(el.imagePath)})\\)([ \\t]*\\{[^}\\n]*\\})?(?:[ \\t]*\\n(?:[ \\t]*\\n)?(?:Caption|Figure):[ \\t]*.+?)?(?=\\n|$)`,
        'i'
      );
      if (explicitByPathRe.test(updatedMd)) {
        updatedMd = updatedMd.replace(
          explicitByPathRe,
          (_m, p: string, attrs?: string) => `![${cleanNext}](${p})${attrs ?? ''}`
        );
      } else {
        const standaloneRe = new RegExp(
          `^@${esc(el.label)}(?:\\s*\\{([^}]*)\\})?(?:\\s*:\\s*.+?|\\s+\\[[^\\]]+\\])?(?:\\s*\\n(?:[ \\t]*\\n)?(?:Caption|Figure):\\s*.+?)?$`,
          'im'
        );
        updatedMd = updatedMd.replace(
          standaloneRe,
          `![${cleanNext}](${el.imagePath}){#${el.label} width=0.85}`
        );
      }
    } else {
      const standaloneNoPathRe = new RegExp(
        `^@${esc(el.label)}(\\s*\\{[^}]*\\})?(?:\\s*:\\s*.+?|\\s+\\[[^\\]]+\\])?$`,
        'im'
      );
      updatedMd = updatedMd.replace(
        standaloneNoPathRe,
        (_m, attrs?: string) => `@${el.label}${attrs ?? ''}: ${cleanNext}`
      );
    }

    store.updateSectionMarkdownAction(el.sectionId, updatedMd);
  };

  const handleRename = async (secId: string, currentTitle: string) => {
    const next = await promptDialog({
      title: 'Rename Section',
      defaultValue: currentTitle,
      confirmLabel: 'Rename',
    });
    if (next?.trim()) {
      await s.renameSectionAction(secId, next.trim());
    }
  };

  const onDragStart = (e: DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e: DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) setDragOverIdx(idx);
  };
  const onDrop = (e: DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) {
      void s.reorderSectionsAction(dragIdx, idx);
    }
    setDragIdx(null);
    setDragOverIdx(null);
  };

  return (
    <aside className="sidebar" aria-label="Paper Navigator">
      <div className="sidebar-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={s.sidebarTab === 'paper'}
          className={`sidebar-tab-btn ${s.sidebarTab === 'paper' ? 'active' : ''}`}
          onClick={() => s.setSidebarTab('paper')}
        >
          <FileText size={13} /> Paper
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={s.sidebarTab === 'references'}
          className={`sidebar-tab-btn ${s.sidebarTab === 'references' ? 'active' : ''}`}
          onClick={() => s.setSidebarTab('references')}
        >
          <BookMarked size={13} /> Refs ({s.bibEntries.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={s.sidebarTab === 'elements'}
          className={`sidebar-tab-btn ${s.sidebarTab === 'elements' ? 'active' : ''}`}
          onClick={() => s.setSidebarTab('elements')}
        >
          <Layers size={13} /> Elements
        </button>
      </div>

      {s.sidebarTab === 'paper' && (
        <>
          <div className="sidebar-header-row">
            <span className="sidebar-project-title" title={s.project?.name || 'No Paper Open'}>
              {s.project?.name || 'No Paper Open'}
            </span>
            {s.project && (
              <button
                type="button"
                className="binder-icon-btn"
                onClick={() => void s.addSectionAction()}
                title="Add New Paper Section (Ctrl+N)"
              >
                <Plus size={14} />
              </button>
            )}
          </div>

          <div className="sidebar-body">
            {s.project && (
              <>
                <div className="sidebar-group-label">Front Matter</div>
                <div
                  className={`binder-row ${s.activeTarget === 'frontmatter' ? 'active' : ''}`}
                  onClick={() => void s.selectTarget('frontmatter')}
                >
                  <Sparkles size={14} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
                  <span className="binder-row-title">Front Page & Authors</span>
                  <span className="binder-word-badge">{s.frontMatter.authors.length} auth</span>
                </div>

                <div className="sidebar-group-label">
                  <span>Sections</span>
                  <span>{s.project.sections.length}</span>
                </div>

                {s.project.sections.map((sec, idx) => {
                  const isActive = s.activeTarget === sec.id;
                  const subs = sec.subsections || [];
                  const isOpen = expanded[sec.id] ?? isActive;
                  const words = sec.wordCount || 0;
                  const overLimit = Boolean(sec.wordLimit && words > sec.wordLimit);

                  return (
                    <div key={sec.id}>
                      <div
                        className={`binder-row ${isActive ? 'active' : ''} ${dragOverIdx === idx ? 'drag-over' : ''}`}
                        draggable
                        onDragStart={(e) => onDragStart(e, idx)}
                        onDragOver={(e) => onDragOver(e, idx)}
                        onDrop={(e) => onDrop(e, idx)}
                        onDragEnd={() => {
                          setDragIdx(null);
                          setDragOverIdx(null);
                        }}
                        onClick={() => void s.selectTarget(sec.id)}
                      >
                        <GripVertical size={11} style={{ opacity: 0.45, flexShrink: 0 }} />
                        {subs.length > 0 ? (
                          <button
                            type="button"
                            className="binder-icon-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpanded((prev) => ({ ...prev, [sec.id]: !isOpen }));
                            }}
                          >
                            {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          </button>
                        ) : (
                          <span style={{ width: 14, flexShrink: 0 }} />
                        )}
                        <span
                          className="binder-status-dot"
                          style={{ background: `var(--status-${sec.status})` }}
                          title={`Status: ${sec.status}`}
                        />
                        <span className="binder-row-title" title={sec.title}>
                          {sec.title}
                        </span>
                        <span
                          className={`binder-word-badge ${overLimit ? 'over-limit' : ''}`}
                          title={
                            sec.wordLimit
                              ? `${words} / ${sec.wordLimit} word limit`
                              : `${words} words`
                          }
                        >
                          {sec.wordLimit ? `${words}/${sec.wordLimit}` : formatWordsCompact(words)}
                        </span>
                        <div className="binder-mini-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="binder-icon-btn"
                            title="Rename section"
                            onClick={() => void handleRename(sec.id, sec.title)}
                          >
                            <Edit2 size={11} />
                          </button>
                          <button
                            type="button"
                            className="binder-icon-btn danger"
                            title="Move to graveyard"
                            onClick={() => void s.deleteSectionAction(sec.id)}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>

                      {isOpen && subs.length > 0 && (
                        <div className="subsection-list">
                          {subs.map((sub) => (
                            <div
                              key={`${sec.id}-sub-${sub.index}`}
                              className={`subsection-item level-${sub.level}`}
                              onClick={() => void s.selectTarget(sec.id)}
                              title={sub.title}
                            >
                              {sub.title}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="sidebar-group-label">Active LaTeX Template</div>
                <div
                  className="binder-row"
                  onClick={() => s.setTemplateInspectorOpen(true)}
                  title="Click to inspect slots or load another .tex/.zip template"
                >
                  <span className="pill-badge" style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.activeManifest.documentClass} · {s.activeManifest.slots.length} slots
                  </span>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {s.sidebarTab === 'references' && (
        <>
          <div className="sidebar-search-row">
            <input
              type="text"
              className="mirtex-input"
              placeholder="Filter references…"
              value={refFilter}
              onChange={(e) => setRefFilter(e.target.value)}
            />
            <button
              type="button"
              className="mirtex-btn primary"
              onClick={() => s.setCitationModalOpen(true)}
              title="Open Zotero & Bibliography Manager"
            >
              <Plus size={13} />
            </button>
          </div>

          <div style={{ padding: '0 8px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className={`pill-badge ${s.zoteroStatus?.connected ? 'success' : ''}`}>
              Zotero: {s.zoteroStatus?.connected ? 'Connected' : 'Local .bib'}
            </span>
            <button
              type="button"
              className="binder-icon-btn"
              style={{ fontSize: 11 }}
              onClick={() => s.setCitationModalOpen(true)}
            >
              Manage →
            </button>
          </div>

          <div className="sidebar-body">
            {filteredRefs.length === 0 ? (
              <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                No references yet. Click <strong>+</strong> to search Zotero 10, paste a DOI/PMID/arXiv ID, or import a .bib file.
              </div>
            ) : (
              filteredRefs.map((entry) => (
                <div
                  key={entry.key}
                  className="ref-card-mini"
                  onClick={() => insertIntoEditor(`[@${entry.key}]`)}
                  title="Click to insert citation [@key] at cursor"
                >
                  <div className="ref-card-title">
                    {cleanBibValue(entry.fields.title || entry.key)}
                  </div>
                  <div className="ref-card-meta">
                    <span>
                      {formatAuthorShort(entry.fields.author || '')} ({entry.fields.year || 'n.d.'})
                    </span>
                    <span className="element-label-code">@{entry.key}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {s.sidebarTab === 'elements' && (
        <div className="sidebar-body">
          <div className="sidebar-group-label">
            <span>Figures, Tables & Equations</span>
            <span>{indexedElements.length}</span>
          </div>
          {indexedElements.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)' }}>
              Insert figures, tables, or labeled equations (<code>{'{#eq:id}'}</code>) to reference them with one click.
            </div>
          ) : (
            indexedElements.map((el) => (
              <div
                key={`${el.kind}-${el.label}-${el.imagePath || el.number}`}
                className="element-row"
                onClick={() => insertIntoEditor(`@${el.label} `)}
                title={`Click to refer to @${el.label} in text (${el.sectionTitle})`}
              >
                {el.kind === 'figure' ? (
                  <Image size={13} />
                ) : el.kind === 'table' ? (
                  <Table2 size={13} />
                ) : (
                  <Sigma size={13} />
                )}
                <span className="element-label-code">@{el.label}</span>
                <span className="binder-row-title">{el.title}</span>
                {el.kind === 'figure' && el.sectionId === 'figures-folder' && el.imagePath && (
                  <button
                    type="button"
                    className="element-action-btn"
                    title="Insert this figure into the active section with a caption"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleSidebarInsertFigure(el);
                    }}
                  >
                    + Insert
                  </button>
                )}
                {el.kind === 'figure' && el.sectionId !== 'figures-folder' && (
                  <button
                    type="button"
                    className="element-action-btn"
                    title="Edit figure caption"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleSidebarEditCaption(el);
                    }}
                  >
                    Caption
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </aside>
  );
}
