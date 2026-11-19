import { useEffect, useState } from 'react';
import { History, RotateCcw, X } from 'lucide-react';
import { getActiveSection, usePaperStore } from '../../stores/paperStore';
import { listBackups, readBackup, type BackupEntry } from '../../services/fileService';

export function BackupsModal() {
  const open = usePaperStore((s) => s.backupsOpen);
  const setOpen = usePaperStore((s) => s.setBackupsOpen);
  const updateActiveMarkdown = usePaperStore((s) => s.updateActiveMarkdown);
  const saveActiveAction = usePaperStore((s) => s.saveActiveAction);
  const setStatusMessage = usePaperStore((s) => s.setStatusMessage);

  const activeSec = getActiveSection(usePaperStore.getState());
  const [entries, setEntries] = useState<BackupEntry[]>([]);
  const [selectedContent, setSelectedContent] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !activeSec) return;
    void listBackups(activeSec.path).then((list) => {
      setEntries(list);
      setSelectedContent(null);
      setSelectedName(null);
    });
  }, [open, activeSec]);

  if (!open) return null;

  const handlePreview = async (name: string) => {
    if (!activeSec) return;
    const text = await readBackup(activeSec.path, name);
    setSelectedName(name);
    setSelectedContent(text);
  };

  const handleRestore = async () => {
    if (selectedContent === null) return;
    updateActiveMarkdown(selectedContent);
    await saveActiveAction();
    setStatusMessage(`Restored backup ${selectedName}`);
    setOpen(false);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card wide" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className="modal-title">
            <History size={16} /> Rolling Backups — {activeSec?.title || 'Select a section'}
          </div>
          <button type="button" className="modal-close-btn" onClick={() => setOpen(false)}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 14, minHeight: 340 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', maxHeight: 380 }}>
            {entries.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                No rolling backups yet for this section. Backups are saved automatically every 10 minutes as you write.
              </div>
            ) : (
              entries.map((e) => (
                <button
                  key={e.name}
                  type="button"
                  className="welcome-recent-item"
                  style={{
                    borderColor: selectedName === e.name ? 'var(--accent-color)' : undefined,
                  }}
                  onClick={() => void handlePreview(e.name)}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{new Date(e.timestamp * 1000).toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.size} bytes</div>
                  </div>
                </button>
              ))
            )}
          </div>
          <pre
            style={{
              background: 'var(--bg-editor)',
              border: '1px solid var(--border-color)',
              borderRadius: 7,
              padding: 12,
              overflow: 'auto',
              maxHeight: 380,
              fontFamily: 'Consolas, monospace',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
            }}
          >
            {selectedContent ?? 'Select a backup timestamp on the left to inspect its text.'}
          </pre>
        </div>
        <div className="modal-footer">
          <button type="button" className="mirtex-btn" onClick={() => setOpen(false)}>
            Close
          </button>
          <button
            type="button"
            className="mirtex-btn primary"
            disabled={selectedContent === null}
            onClick={() => void handleRestore()}
          >
            <RotateCcw size={13} /> Restore Selected Backup
          </button>
        </div>
      </div>
    </div>
  );
}
