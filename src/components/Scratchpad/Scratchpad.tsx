import { Archive } from 'lucide-react';
import { usePaperStore } from '../../stores/paperStore';

export function Scratchpad() {
  const scratchpadContent = usePaperStore((s) => s.scratchpadContent);
  const setScratchpadContent = usePaperStore((s) => s.setScratchpadContent);
  const flushScratchpadAction = usePaperStore((s) => s.flushScratchpadAction);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-preview)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px',
          background: 'var(--bg-toolbar)',
          borderBottom: '1px solid var(--border-color)',
          fontSize: 12,
        }}
      >
        <span>
          <strong>Lab & Reviewer Scratchpad</strong> · Saved in <code>scratchpad.md</code> (never exported)
        </span>
        <button
          type="button"
          className="mirtex-btn"
          disabled={!scratchpadContent.trim()}
          onClick={() => void flushScratchpadAction()}
          title="Archive notes to graveyard/ and clear"
        >
          <Archive size={13} /> Flush to Graveyard
        </button>
      </div>
      <textarea
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          padding: '22px 24px',
          background: 'transparent',
          color: 'var(--text-color)',
          fontFamily: 'Georgia, serif',
          fontSize: 15,
          lineHeight: 1.7,
          resize: 'none',
        }}
        placeholder="Jot down experimental notes, reviewer feedback, outline ideas, or equations to refine later…"
        value={scratchpadContent}
        onChange={(e) => setScratchpadContent(e.target.value)}
      />
    </div>
  );
}
