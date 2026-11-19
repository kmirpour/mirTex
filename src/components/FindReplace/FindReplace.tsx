import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { usePaperStore } from '../../stores/paperStore';

export function FindReplace() {
  const open = usePaperStore((s) => s.findReplaceOpen);
  const setOpen = usePaperStore((s) => s.setFindReplaceOpen);
  const editor = usePaperStore((s) => s.editorInstance);

  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);

  useEffect(() => {
    if (!editor) return;
    if (!open) {
      editor.commands.clearSearch();
      return;
    }
    editor.commands.setSearchTerm(query, caseSensitive);
  }, [editor, open, query, caseSensitive]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 54,
        right: 24,
        zIndex: 'var(--z-popover)',
        width: 340,
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 8,
        boxShadow: '0 12px 28px var(--shadow-color)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 12.5 }}>Find & Replace</strong>
        <button
          type="button"
          className="modal-close-btn"
          onClick={() => {
            editor?.commands.clearSearch();
            setOpen(false);
          }}
        >
          <X size={14} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        <input
          autoFocus
          className="mirtex-input"
          placeholder="Find in current section…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') editor?.commands.nextSearchMatch();
          }}
        />
        <button
          type="button"
          className="mirtex-btn"
          onClick={() => editor?.commands.prevSearchMatch()}
          title="Previous match"
        >
          <ChevronUp size={13} />
        </button>
        <button
          type="button"
          className="mirtex-btn"
          onClick={() => editor?.commands.nextSearchMatch()}
          title="Next match"
        >
          <ChevronDown size={13} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        <input
          className="mirtex-input"
          placeholder="Replace with…"
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
        />
        <button
          type="button"
          className="mirtex-btn"
          onClick={() => editor?.commands.replaceCurrentMatch(replacement)}
        >
          Replace
        </button>
        <button
          type="button"
          className="mirtex-btn"
          onClick={() => editor?.commands.replaceAllMatches(replacement)}
        >
          All
        </button>
      </div>

      <label style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)' }}>
        <input
          type="checkbox"
          checked={caseSensitive}
          onChange={(e) => setCaseSensitive(e.target.checked)}
        />
        Case sensitive
      </label>
    </div>
  );
}
