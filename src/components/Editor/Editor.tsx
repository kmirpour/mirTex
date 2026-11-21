import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEditor, EditorContent, type Editor as TiptapEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import Focus from '@tiptap/extension-focus';
import { Markdown } from '@tiptap/markdown';
import {
  usePaperStore,
  getActiveSection,
  registerPendingEditorFlush,
} from '../../stores/paperStore';
import { typefaceInfo } from '../../services/settings';
import { Typewriter } from '../../extensions/typewriter';
import { SearchAndReplace } from '../../extensions/searchAndReplace';
import {
  AcademicImageMarkdown,
  TriggerPopup,
  type TriggerPopupState,
} from '../../extensions/triggerPopup';
import { cleanBibValue, formatAuthorShort } from '../../citations/bibtex';
import { searchZoteroLibrary } from '../../citations/zoteroService';
import { indexPaperElements, mergePaperAndFolderFigures } from '../../utils/paperOutline';
import { normalizeAcademicMarkdown } from '../../utils/normalizeAcademicMarkdown';
import { promptDialog } from '../../services/dialogs';
import type { ZoteroSearchItem } from '../../types/citation';
import { FrontMatterEditor } from '../FrontMatterEditor/FrontMatterEditor';
import './Editor.css';

interface PopupOption {
  id: string;
  label: string;
  sub: string;
  badge: string;
  insertText: string;
  figRelPath?: string;
  figLabel?: string;
  zoteroBibtex?: string;
}

export function Editor() {
  const activeTarget = usePaperStore((s) => s.activeTarget);
  const activeSectionMeta = usePaperStore(
    useShallow((s) => {
      const sec = getActiveSection(s);
      return sec
        ? { id: sec.id, title: sec.title, fileName: sec.fileName, role: sec.role }
        : null;
    })
  );
  const activeMarkdown = usePaperStore((s) =>
    s.activeTarget !== 'frontmatter' ? (s.sectionContents[s.activeTarget] ?? '') : ''
  );
  const fontFamily = usePaperStore((s) => s.fontFamily);
  const fontSize = usePaperStore((s) => s.fontSize);
  const lineHeight = usePaperStore((s) => s.lineHeight);
  const lineWidth = usePaperStore((s) => s.lineWidth);
  const smartQuotes = usePaperStore((s) => s.smartQuotes);
  const dimUnfocused = usePaperStore((s) => s.dimUnfocused);
  const bibEntries = usePaperStore((s) => s.bibEntries);
  const projectFigures = usePaperStore((s) => s.projectFigures);
  const zoteroStatus = usePaperStore((s) => s.zoteroStatus);
  const zoteroPort = usePaperStore((s) => s.zoteroPort);

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markdownSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPendingSyncRef = useRef(false);
  const lastLoadedTargetRef = useRef<string>('');
  const lastEmittedMarkdownRef = useRef<string>(activeMarkdown);
  const suppressUpdateRef = useRef(false);
  const editorRef = useRef<TiptapEditor | null>(null);

  const [popup, setPopup] = useState<TriggerPopupState | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [zoteroLiveHits, setZoteroLiveHits] = useState<ZoteroSearchItem[]>([]);

  const flushMarkdownToStore = useCallback(() => {
    if (markdownSyncTimerRef.current) {
      clearTimeout(markdownSyncTimerRef.current);
      markdownSyncTimerRef.current = null;
    }
    const ed = editorRef.current;
    if (!hasPendingSyncRef.current || !ed || ed.isDestroyed) return;
    hasPendingSyncRef.current = false;
    const cleanMd = normalizeAcademicMarkdown(ed.getMarkdown());
    lastEmittedMarkdownRef.current = cleanMd;
    usePaperStore.getState().updateActiveMarkdown(cleanMd);
  }, []);

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        TableKit,
        Markdown,
        AcademicImageMarkdown,
        Placeholder.configure({
          placeholder:
            'Draft your scientific section… Type [@ to cite from references/Zotero, @fig: / @tbl: / @eq: for cross-refs, or $...$ for math.',
        }),
        Typography.configure(
          smartQuotes
            ? {}
            : {
                openDoubleQuote: false,
                closeDoubleQuote: false,
                openSingleQuote: false,
                closeSingleQuote: false,
              }
        ),
        Focus.configure({ className: 'has-focus', mode: 'shallowest' }),
        Typewriter.configure({
          isEnabled: () => usePaperStore.getState().typewriterMode,
        }),
        SearchAndReplace,
        TriggerPopup,
      ],
      content: activeMarkdown,
      contentType: 'markdown',
      onSelectionUpdate: ({ editor: ed }) => {
        const { from, to } = ed.state.selection;
        const store = usePaperStore.getState();
        if (from !== to) {
          const text = ed.state.doc.textBetween(from, to, ' ').trim();
          const count = text ? text.split(/\s+/).length : 0;
          store.setSelectedWordCount(count);
        } else if (store.selectedWordCount !== 0) {
          store.setSelectedWordCount(0);
        }
      },
      onUpdate: () => {
        if (suppressUpdateRef.current) return;
        const store = usePaperStore.getState();
        store.markDirtyAction();
        hasPendingSyncRef.current = true;

        if (markdownSyncTimerRef.current) clearTimeout(markdownSyncTimerRef.current);
        markdownSyncTimerRef.current = setTimeout(() => {
          flushMarkdownToStore();
        }, 250);

        if (store.autoSaveEnabled && store.projectPath) {
          if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = setTimeout(() => {
            const latest = usePaperStore.getState();
            if (latest.isDirty && latest.autoSaveEnabled) {
              void latest.saveActiveAction();
            }
          }, 1500);
        }
      },
    },
    [smartQuotes]
  );

  editorRef.current = editor;

  // Register pending markdown flush hook so saves, section switches, and exports always flush latest text
  useEffect(() => {
    registerPendingEditorFlush(flushMarkdownToStore);
    return () => {
      flushMarkdownToStore();
      registerPendingEditorFlush(null);
    };
  }, [flushMarkdownToStore]);

  // Sync editor instance to store
  useEffect(() => {
    usePaperStore.getState().setEditorInstance(editor ?? null);
    return () => {
      usePaperStore.getState().setEditorInstance(null);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      if (markdownSyncTimerRef.current) clearTimeout(markdownSyncTimerRef.current);
    };
  }, [editor]);

  // Reload content when switching sections or restoring a snapshot/backup
  useEffect(() => {
    if (!editor || activeTarget === 'frontmatter') return;
    if (
      lastLoadedTargetRef.current !== activeTarget ||
      activeMarkdown !== lastEmittedMarkdownRef.current
    ) {
      if (markdownSyncTimerRef.current) {
        clearTimeout(markdownSyncTimerRef.current);
        markdownSyncTimerRef.current = null;
      }
      hasPendingSyncRef.current = false;
      lastLoadedTargetRef.current = activeTarget;
      lastEmittedMarkdownRef.current = activeMarkdown;
      suppressUpdateRef.current = true;
      editor.commands.setContent(activeMarkdown, { contentType: 'markdown' });
      suppressUpdateRef.current = false;
    }
  }, [editor, activeTarget, activeMarkdown]);

  // Subscribe to TriggerPopup events (`[@` and `@fig:`/`@tbl:`/`@eq:`/`@sec:`)
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent<TriggerPopupState>).detail;
      if (detail?.active) {
        setPopup(detail);
        setSelectedIdx(0);
      } else {
        setPopup(null);
      }
    };
    dom.addEventListener('mirtex-popup-update', onUpdate);
    return () => dom.removeEventListener('mirtex-popup-update', onUpdate);
  }, [editor]);

  // Refresh project figure list when opening cross-reference popup (especially `@fig:`)
  const isFigCrossRef = Boolean(
    popup?.active && popup.kind === 'crossref' && popup.query.startsWith('fig:')
  );
  useEffect(() => {
    if (popup?.active && popup.kind === 'crossref') {
      flushMarkdownToStore();
      void usePaperStore.getState().refreshFiguresAction();
    }
  }, [popup?.active, popup?.kind, isFigCrossRef, flushMarkdownToStore]);

  // Live Zotero search when typing `[@query` and Zotero 10 is connected
  useEffect(() => {
    if (!popup?.active || popup.kind !== 'citation' || !zoteroStatus?.connected) {
      setZoteroLiveHits([]);
      return;
    }
    const timer = setTimeout(() => {
      void searchZoteroLibrary(popup.query, 6, zoteroPort)
        .then((hits) => setZoteroLiveHits(hits))
        .catch(() => setZoteroLiveHits([]));
    }, 220);
    return () => clearTimeout(timer);
  }, [popup?.active, popup?.kind, popup?.query, zoteroStatus?.connected, zoteroPort]);

  const popupOptions: PopupOption[] = useMemo(() => {
    if (!popup?.active) return [];
    const q = popup.query.toLowerCase();

    if (popup.kind === 'citation') {
      const localOpts: PopupOption[] = bibEntries
        .filter(
          (e) =>
            !q ||
            e.key.toLowerCase().includes(q) ||
            (e.fields.title || '').toLowerCase().includes(q) ||
            (e.fields.author || '').toLowerCase().includes(q) ||
            (e.fields.year || '').includes(q)
        )
        .slice(0, 8)
        .map((e) => ({
          id: `local-${e.key}`,
          label: cleanBibValue(e.fields.title || e.key),
          sub: `${formatAuthorShort(e.fields.author || '')} (${e.fields.year || 'n.d.'})`,
          badge: `@${e.key}`,
          insertText: `[@${e.key}] `,
        }));

      const existingKeys = new Set(bibEntries.map((e) => e.key));
      const zoteroOpts: PopupOption[] = zoteroLiveHits
        .filter((z) => !existingKeys.has(z.citekey))
        .map((z) => ({
          id: `zot-${z.key}`,
          label: z.title,
          sub: `${z.authors} (${z.year || 'n.d.'})`,
          badge: `Zotero · @${z.citekey}`,
          insertText: `[@${z.citekey}] `,
          zoteroBibtex: z.bibtex,
        }));

      return [...localOpts, ...zoteroOpts];
    }

    // Cross-references (`@fig:`, `@tbl:`, `@eq:`, `@sec:`)
    const { project, sectionContents } = usePaperStore.getState();
    if (!project) return [];
    const elements = mergePaperAndFolderFigures(
      indexPaperElements(
        project.sections.map((s) => ({
          id: s.id,
          title: s.title,
          markdown:
            s.id === activeTarget ? activeMarkdown : (sectionContents[s.id] ?? ''),
        }))
      ),
      projectFigures
    );
    const qNorm = q.replace(/_/g, '-');
    return elements
      .filter((el) => {
        const lbl = el.label.toLowerCase();
        const title = el.title.toLowerCase();
        const imgPath = (el.imagePath || '').toLowerCase();
        return lbl.includes(q) || lbl.includes(qNorm) || title.includes(q) || imgPath.includes(q);
      })
      .slice(0, 25)
      .map((el) => ({
        id: `ref-${el.sectionId}-${el.label}-${el.number}`,
        label: el.title,
        sub: el.sectionId === 'figures-folder' ? `Folder · ${el.sectionTitle}` : el.sectionTitle,
        badge: el.kind === 'figure' ? `Refer @${el.label}` : `@${el.label}`,
        insertText: `@${el.label} `,
        figRelPath: el.kind === 'figure' ? el.imagePath : undefined,
        figLabel: el.kind === 'figure' ? el.label : undefined,
      }));
  }, [popup, bibEntries, zoteroLiveHits, projectFigures, activeTarget, activeMarkdown]);

  const applyPopupOption = useCallback(
    async (opt: PopupOption, useEmbed = false) => {
      if (!editor || !popup) return;
      if (opt.zoteroBibtex) {
        await usePaperStore.getState().addRawBibtexAction(opt.zoteroBibtex);
      }
      if (useEmbed && opt.figRelPath && opt.figLabel) {
        const targetRange = popup.range;
        const figRelPath = opt.figRelPath;
        const figLabel = opt.figLabel;
        setPopup(null);
        editor.chain().focus().deleteRange(targetRange).run();

        const caption = await promptDialog({
          title: `Insert Figure (${figRelPath})`,
          message: 'Enter the figure caption (appears after "Figure #:" in the PDF):',
          placeholder: 'Describe what this figure shows…',
          defaultValue: '',
          confirmLabel: 'Insert Figure',
        });
        if (caption === null || editor.isDestroyed) return;

        const embedLine = `![${caption.trim()}](${figRelPath}){#${figLabel} width=0.85}`;
        const { $from } = editor.state.selection;
        if ($from.parent.textContent.trim().length === 0) {
          editor.chain().focus().insertContent({ type: 'text', text: embedLine }).run();
        } else {
          const insertPos = $from.depth > 0 ? $from.after() : editor.state.doc.content.size;
          editor
            .chain()
            .focus()
            .insertContentAt(insertPos, {
              type: 'paragraph',
              content: [{ type: 'text', text: embedLine }],
            })
            .run();
        }
      } else {
        editor.chain().focus().deleteRange(popup.range).insertContent(opt.insertText).run();
        setPopup(null);
      }
    },
    [editor, popup]
  );

  // Keyboard nav for popup
  useEffect(() => {
    if (!editor || !popup?.active) return;
    const dom = editor.view.dom;
    const onKey = (e: Event) => {
      const { key, shiftKey } = (e as CustomEvent<{ key: string; shiftKey?: boolean }>).detail;
      if (key === 'Escape') {
        e.preventDefault();
        setPopup(null);
      } else if (key === 'ArrowDown' && popupOptions.length > 0) {
        e.preventDefault();
        setSelectedIdx((i) => (i + 1) % popupOptions.length);
      } else if (key === 'ArrowUp' && popupOptions.length > 0) {
        e.preventDefault();
        setSelectedIdx((i) => (i - 1 + popupOptions.length) % popupOptions.length);
      } else if (key === 'Enter' || key === 'Tab') {
        const chosen = popupOptions[selectedIdx] ?? popupOptions[0];
        if (chosen) {
          e.preventDefault();
          void applyPopupOption(chosen, Boolean(shiftKey && key === 'Enter'));
        }
      }
    };
    dom.addEventListener('mirtex-popup-keydown', onKey);
    return () => dom.removeEventListener('mirtex-popup-keydown', onKey);
  }, [editor, popup?.active, popupOptions, selectedIdx, applyPopupOption]);

  if (activeTarget === 'frontmatter') {
    return <FrontMatterEditor />;
  }

  const surfaceStyle = {
    '--editor-font-family': typefaceInfo(fontFamily).stack,
    '--editor-font-size': `${fontSize}px`,
    '--editor-line-height': String(lineHeight),
    '--editor-line-width': `${lineWidth}px`,
  } as CSSProperties;

  return (
    <div className="editor-wrapper">
      {activeSectionMeta && (
        <div className="editor-section-banner">
          <span>
            <strong>{activeSectionMeta.title}</strong> · <code>sections/{activeSectionMeta.fileName}</code>
          </span>
          <span>
            Role: <strong>{activeSectionMeta.role}</strong> · Tip: type <code>[@</code> to cite or{' '}
            <code>@fig:</code> to cross-ref
          </span>
        </div>
      )}

      <div className="editor-scroll-container">
        <div
          className={`editor-surface ${dimUnfocused ? 'dim-unfocused' : ''}`}
          style={surfaceStyle}
        >
          <EditorContent editor={editor} />
        </div>
      </div>

      {popup?.active && popup.coords && (
        <div
          className="trigger-popup"
          style={{
            left: Math.min(popup.coords.left, window.innerWidth - 440),
            top: Math.min(popup.coords.bottom + 6, window.innerHeight - 310),
          }}
        >
          <div className="trigger-popup-header">
            <span>
              {popup.kind === 'citation' ? 'Insert Citation' : 'Refer (@fig:) or Insert Figure'}
            </span>
            <span>
              {popup.kind === 'citation'
                ? '↑↓ Enter'
                : 'Enter: Refer · Shift+Enter: + Insert Figure'}
            </span>
          </div>
          {popupOptions.length === 0 ? (
            <div style={{ padding: '10px 8px', fontSize: 12, color: 'var(--text-muted)' }}>
              {popup.kind === 'citation'
                ? `No matches for "${popup.query}". Press Ctrl+Shift+C to search Zotero or add by DOI.`
                : `No matching figures, tables, equations, or sections for "@${popup.query}". Place figure images in your paper's figures/ folder or click Figure in the toolbar.`}
            </div>
          ) : (
            popupOptions.map((opt, idx) => (
              <div
                key={opt.id}
                role="option"
                aria-selected={idx === selectedIdx}
                className={`trigger-popup-item ${idx === selectedIdx ? 'selected' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  void applyPopupOption(opt);
                }}
              >
                <span className="trigger-popup-title">{opt.label}</span>
                <span className="trigger-popup-sub">
                  <span>{opt.sub}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {opt.figRelPath && opt.figLabel && (
                      <button
                        type="button"
                        className="trigger-popup-embed-btn"
                        title="Insert figure image and add caption at this position"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void applyPopupOption(opt, true);
                        }}
                      >
                        + Insert Figure
                      </button>
                    )}
                    <span className="element-label-code">{opt.badge}</span>
                  </span>
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
