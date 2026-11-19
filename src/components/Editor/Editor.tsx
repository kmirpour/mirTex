import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import Focus from '@tiptap/extension-focus';
import { Markdown } from '@tiptap/markdown';
import { usePaperStore, getActiveSection } from '../../stores/paperStore';
import { typefaceInfo } from '../../services/settings';
import { Typewriter } from '../../extensions/typewriter';
import { SearchAndReplace } from '../../extensions/searchAndReplace';
import { TriggerPopup, type TriggerPopupState } from '../../extensions/triggerPopup';
import { cleanBibValue, formatAuthorShort } from '../../citations/bibtex';
import { searchZoteroLibrary } from '../../citations/zoteroService';
import { indexPaperElements } from '../../utils/paperOutline';
import { normalizeAcademicMarkdown } from '../../utils/normalizeAcademicMarkdown';
import type { ZoteroSearchItem } from '../../types/citation';
import { FrontMatterEditor } from '../FrontMatterEditor/FrontMatterEditor';
import './Editor.css';

interface PopupOption {
  id: string;
  label: string;
  sub: string;
  badge: string;
  insertText: string;
  zoteroBibtex?: string;
}

export function Editor() {
  const activeTarget = usePaperStore((s) => s.activeTarget);
  const project = usePaperStore((s) => s.project);
  const sectionContents = usePaperStore((s) => s.sectionContents);
  const fontFamily = usePaperStore((s) => s.fontFamily);
  const fontSize = usePaperStore((s) => s.fontSize);
  const lineHeight = usePaperStore((s) => s.lineHeight);
  const lineWidth = usePaperStore((s) => s.lineWidth);
  const smartQuotes = usePaperStore((s) => s.smartQuotes);
  const dimUnfocused = usePaperStore((s) => s.dimUnfocused);
  const bibEntries = usePaperStore((s) => s.bibEntries);
  const zoteroStatus = usePaperStore((s) => s.zoteroStatus);
  const zoteroPort = usePaperStore((s) => s.zoteroPort);

  const activeSection = getActiveSection(usePaperStore.getState());
  const activeMarkdown =
    activeTarget !== 'frontmatter' ? sectionContents[activeTarget] ?? '' : '';

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoadedTargetRef = useRef<string>('');
  const lastEmittedMarkdownRef = useRef<string>(activeMarkdown);
  const suppressUpdateRef = useRef(false);

  const [popup, setPopup] = useState<TriggerPopupState | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [zoteroLiveHits, setZoteroLiveHits] = useState<ZoteroSearchItem[]>([]);

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Markdown,
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
        if (from !== to) {
          const text = ed.state.doc.textBetween(from, to, ' ').trim();
          usePaperStore
            .getState()
            .setSelectedWordCount(text ? text.split(/\s+/).length : 0);
        } else {
          usePaperStore.getState().setSelectedWordCount(0);
        }
      },
      onUpdate: ({ editor: ed }) => {
        if (suppressUpdateRef.current) return;
        const store = usePaperStore.getState();
        const cleanMd = normalizeAcademicMarkdown(ed.getMarkdown());
        lastEmittedMarkdownRef.current = cleanMd;
        store.updateActiveMarkdown(cleanMd);

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

  // Sync editor instance to store
  useEffect(() => {
    usePaperStore.getState().setEditorInstance(editor ?? null);
    return () => {
      usePaperStore.getState().setEditorInstance(null);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [editor]);

  // Reload content when switching sections or restoring a snapshot/backup
  useEffect(() => {
    if (!editor || activeTarget === 'frontmatter') return;
    if (
      lastLoadedTargetRef.current !== activeTarget ||
      activeMarkdown !== lastEmittedMarkdownRef.current
    ) {
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
    if (!project) return [];
    const elements = indexPaperElements(
      project.sections.map((s) => ({
        id: s.id,
        title: s.title,
        markdown: sectionContents[s.id] ?? '',
      }))
    );
    return elements
      .filter((el) => el.label.toLowerCase().includes(q) || el.title.toLowerCase().includes(q))
      .slice(0, 10)
      .map((el) => ({
        id: `ref-${el.label}`,
        label: el.title,
        sub: el.sectionTitle,
        badge: `@${el.label}`,
        insertText: `@${el.label} `,
      }));
  }, [popup, bibEntries, zoteroLiveHits, project, sectionContents]);

  const applyPopupOption = async (opt: PopupOption) => {
    if (!editor || !popup) return;
    if (opt.zoteroBibtex) {
      await usePaperStore.getState().addRawBibtexAction(opt.zoteroBibtex);
    }
    editor
      .chain()
      .focus()
      .deleteRange(popup.range)
      .insertContent(opt.insertText)
      .run();
    setPopup(null);
  };

  // Keyboard nav for popup
  useEffect(() => {
    if (!editor || !popup?.active) return;
    const dom = editor.view.dom;
    const onKey = (e: Event) => {
      const key = (e as CustomEvent<{ key: string }>).detail.key;
      if (key === 'Escape') {
        e.preventDefault();
        setPopup(null);
      } else if (key === 'ArrowDown' && popupOptions.length > 0) {
        e.preventDefault();
        setSelectedIdx((i) => (i + 1) % popupOptions.length);
      } else if (key === 'ArrowUp' && popupOptions.length > 0) {
        e.preventDefault();
        setSelectedIdx((i) => (i - 1 + popupOptions.length) % popupOptions.length);
      } else if ((key === 'Enter' || key === 'Tab') && popupOptions[selectedIdx]) {
        e.preventDefault();
        void applyPopupOption(popupOptions[selectedIdx]);
      }
    };
    dom.addEventListener('mirtex-popup-keydown', onKey);
    return () => dom.removeEventListener('mirtex-popup-keydown', onKey);
  });

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
      {activeSection && (
        <div className="editor-section-banner">
          <span>
            <strong>{activeSection.title}</strong> · <code>sections/{activeSection.fileName}</code>
          </span>
          <span>
            Role: <strong>{activeSection.role}</strong> · Tip: type <code>[@</code> to cite or{' '}
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
            left: Math.min(popup.coords.left, window.innerWidth - 380),
            top: Math.min(popup.coords.bottom + 6, window.innerHeight - 310),
          }}
        >
          <div className="trigger-popup-header">
            <span>{popup.kind === 'citation' ? 'Insert Citation' : 'Insert Cross-Reference'}</span>
            <span>↑↓ Enter</span>
          </div>
          {popupOptions.length === 0 ? (
            <div style={{ padding: '10px 8px', fontSize: 12, color: 'var(--text-muted)' }}>
              No matches for "{popup.query}". Press Ctrl+Shift+C to search Zotero or add by DOI.
            </div>
          ) : (
            popupOptions.map((opt, idx) => (
              <button
                key={opt.id}
                type="button"
                className={`trigger-popup-item ${idx === selectedIdx ? 'selected' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  void applyPopupOption(opt);
                }}
              >
                <span className="trigger-popup-title">{opt.label}</span>
                <span className="trigger-popup-sub">
                  <span>{opt.sub}</span>
                  <span className="element-label-code">{opt.badge}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
