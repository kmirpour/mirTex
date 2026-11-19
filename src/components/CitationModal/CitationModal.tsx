import { useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  BookMarked,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { usePaperStore } from '../../stores/paperStore';
import { auditCitations, cleanBibValue, formatAuthorShort } from '../../citations/bibtex';
import {
  exportZoteroCollectionBibtex,
  listZoteroCollections,
  searchZoteroLibrary,
} from '../../citations/zoteroService';
import type { ZoteroCollection, ZoteroSearchItem } from '../../types/citation';

type TabKind = 'library' | 'zotero' | 'quickadd' | 'audit';

export function CitationModal() {
  const open = usePaperStore((s) => s.citationModalOpen);
  const setOpen = usePaperStore((s) => s.setCitationModalOpen);
  const bibEntries = usePaperStore((s) => s.bibEntries);
  const zoteroStatus = usePaperStore((s) => s.zoteroStatus);
  const zoteroPort = usePaperStore((s) => s.zoteroPort);
  const project = usePaperStore((s) => s.project);
  const sectionContents = usePaperStore((s) => s.sectionContents);
  const editorInstance = usePaperStore((s) => s.editorInstance);
  const activeTarget = usePaperStore((s) => s.activeTarget);
  const pingZoteroAction = usePaperStore((s) => s.pingZoteroAction);
  const addRawBibtexAction = usePaperStore((s) => s.addRawBibtexAction);
  const addReferenceByIdAction = usePaperStore((s) => s.addReferenceByIdAction);
  const deleteBibEntryAction = usePaperStore((s) => s.deleteBibEntryAction);
  const importBibFileAction = usePaperStore((s) => s.importBibFileAction);
  const setStatusMessage = usePaperStore((s) => s.setStatusMessage);

  const [tab, setTab] = useState<TabKind>('library');
  const [libFilter, setLibFilter] = useState('');

  // Zotero tab state
  const [zQuery, setZQuery] = useState('');
  const [zResults, setZResults] = useState<ZoteroSearchItem[]>([]);
  const [zCollections, setZCollections] = useState<ZoteroCollection[]>([]);
  const [zLoading, setZLoading] = useState(false);
  const [zError, setZError] = useState<string | null>(null);

  // Quick Add tab state
  const [idInput, setIdInput] = useState('');
  const [idLoading, setIdLoading] = useState(false);
  const [idFeedback, setIdFeedback] = useState<string | null>(null);
  const [rawBibInput, setRawBibInput] = useState('');

  const audit = useMemo(() => {
    const mds = project ? project.sections.map((s) => sectionContents[s.id] ?? '') : [];
    return auditCitations(mds, bibEntries);
  }, [project, sectionContents, bibEntries]);

  const filteredLib = useMemo(() => {
    const q = libFilter.trim().toLowerCase();
    if (!q) return bibEntries;
    return bibEntries.filter(
      (e) =>
        e.key.toLowerCase().includes(q) ||
        (e.fields.title || '').toLowerCase().includes(q) ||
        (e.fields.author || '').toLowerCase().includes(q) ||
        (e.fields.year || '').includes(q)
    );
  }, [bibEntries, libFilter]);

  if (!open) return null;

  const insertKeyIntoEditor = (key: string) => {
    if (editorInstance && activeTarget !== 'frontmatter') {
      editorInstance.chain().focus().insertContent(`[@${key}]`).run();
      setOpen(false);
    } else {
      void navigator.clipboard?.writeText(`[@${key}]`);
      setStatusMessage(`Copied [@${key}] to clipboard`);
    }
  };

  const handleZoteroSearch = async (e?: FormEvent) => {
    e?.preventDefault();
    setZLoading(true);
    setZError(null);
    try {
      const status = await pingZoteroAction();
      if (!status.connected) {
        setZError(status.message);
        setZResults([]);
        return;
      }
      const [hits, cols] = await Promise.all([
        searchZoteroLibrary(zQuery, 25, zoteroPort),
        zCollections.length === 0 ? listZoteroCollections(zoteroPort).catch(() => []) : Promise.resolve(zCollections),
      ]);
      setZResults(hits);
      if (cols.length > 0) setZCollections(cols);
    } catch (err) {
      setZError(err instanceof Error ? err.message : String(err));
    } finally {
      setZLoading(false);
    }
  };

  const handleImportZoteroCollection = async (col: ZoteroCollection) => {
    setZLoading(true);
    setZError(null);
    try {
      const bib = await exportZoteroCollectionBibtex(col.key, zoteroPort);
      const count = await addRawBibtexAction(bib);
      setStatusMessage(`Imported ${count} reference(s) from Zotero collection "${col.name}"`);
    } catch (err) {
      setZError(err instanceof Error ? err.message : String(err));
    } finally {
      setZLoading(false);
    }
  };

  const handleQuickLookup = async (e: FormEvent) => {
    e.preventDefault();
    if (!idInput.trim()) return;
    setIdLoading(true);
    setIdFeedback(null);
    try {
      const added = await addReferenceByIdAction(idInput.trim());
      if (added) {
        setIdFeedback(`Added @${added.key}: "${cleanBibValue(added.fields.title || '')}"`);
        setIdInput('');
      }
    } catch (err) {
      setIdFeedback(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIdLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card wide" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className="modal-title">
            <BookMarked size={16} /> References, Zotero 10 & Bibliography Manager
          </div>
          <button type="button" className="modal-close-btn" onClick={() => setOpen(false)}>
            <X size={16} />
          </button>
        </div>

        {/* Modal Tabs */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: '10px 18px 0',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-app)',
          }}
        >
          {(
            [
              ['library', `Paper Library (${bibEntries.length})`],
              ['zotero', `Zotero 10 Live ${zoteroStatus?.connected ? '●' : '○'}`],
              ['quickadd', 'Add by DOI / PMID / arXiv / BibTeX'],
              ['audit', `Citation Audit (${audit.missingKeys.length} broken)`],
            ] as [TabKind, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              style={{
                padding: '7px 12px',
                border: 'none',
                borderBottom: `2px solid ${tab === id ? 'var(--accent-color)' : 'transparent'}`,
                background: 'transparent',
                color: tab === id ? 'var(--accent-hover)' : 'var(--text-muted)',
                fontWeight: tab === id ? 600 : 500,
                fontSize: 12.5,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tab === 'library' && (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="mirtex-input"
                  placeholder="Search paper references.bib by author, title, year, or key…"
                  value={libFilter}
                  onChange={(e) => setLibFilter(e.target.value)}
                />
                <button
                  type="button"
                  className="mirtex-btn"
                  onClick={() => void importBibFileAction()}
                >
                  <Upload size={13} /> Import .bib…
                </button>
              </div>

              {filteredLib.length === 0 ? (
                <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No entries in <code>references.bib</code> yet. Switch to <strong>Zotero 10 Live</strong> or{' '}
                  <strong>Add by DOI / PMID / arXiv</strong> to add papers in one click.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {filteredLib.map((entry) => {
                    const uses = audit.usageCounts[entry.key] || 0;
                    return (
                      <div
                        key={entry.key}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 7,
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-app)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 12,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--heading-color)' }}>
                            {cleanBibValue(entry.fields.title || entry.key)}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                            {formatAuthorShort(entry.fields.author || '')} ({entry.fields.year || 'n.d.'})
                            {entry.fields.journal ? ` · ${cleanBibValue(entry.fields.journal)}` : ''}
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                            <span className="element-label-code">@{entry.key}</span>
                            <span className={`pill-badge ${uses > 0 ? 'success' : ''}`}>
                              {uses > 0 ? `Cited ${uses}×` : 'Unused'}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button
                            type="button"
                            className="mirtex-btn primary"
                            onClick={() => insertKeyIntoEditor(entry.key)}
                          >
                            Insert Cite
                          </button>
                          <button
                            type="button"
                            className="mirtex-btn danger"
                            onClick={() => void deleteBibEntryAction(entry.key)}
                            title="Remove from references.bib"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === 'zotero' && (
            <>
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 7,
                  border: '1px solid var(--border-color)',
                  background: zoteroStatus?.connected ? 'var(--success-bg)' : 'var(--bg-app)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  fontSize: 12.5,
                }}
              >
                <span>{zoteroStatus?.message || 'Click Check Connection to connect to Zotero 10.'}</span>
                <button
                  type="button"
                  className="mirtex-btn"
                  onClick={() => void handleZoteroSearch()}
                  disabled={zLoading}
                >
                  <RefreshCw size={13} className={zLoading ? 'spin' : ''} /> Refresh
                </button>
              </div>

              <form onSubmit={(e) => void handleZoteroSearch(e)} style={{ display: 'flex', gap: 8 }}>
                <input
                  className="mirtex-input"
                  placeholder="Search your Zotero 10 library (author, keyword, title, or leave blank for recent items)…"
                  value={zQuery}
                  onChange={(e) => setZQuery(e.target.value)}
                />
                <button type="submit" className="mirtex-btn primary" disabled={zLoading}>
                  {zLoading ? <Loader2 size={13} className="spin" /> : <Search size={13} />} Search Zotero
                </button>
              </form>

              {zError && (
                <div className="pill-badge danger" style={{ padding: '8px 12px', borderRadius: 6 }}>
                  {zError}
                </div>
              )}

              {zCollections.length > 0 && (
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                    Import an Entire Zotero Collection into references.bib:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {zCollections.slice(0, 12).map((col) => (
                      <button
                        key={col.key}
                        type="button"
                        className="mirtex-btn"
                        style={{ fontSize: 11.5, padding: '4px 9px' }}
                        onClick={() => void handleImportZoteroCollection(col)}
                      >
                        <Download size={11} /> {col.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {zResults.map((item) => (
                  <div
                    key={item.key}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 7,
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-app)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {item.authors} ({item.year || 'n.d.'}) {item.journal ? `· ${item.journal}` : ''}
                      </div>
                      <span className="element-label-code" style={{ marginTop: 4, display: 'inline-block' }}>
                        @{item.citekey}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        type="button"
                        className="mirtex-btn"
                        onClick={() => void addRawBibtexAction(item.bibtex)}
                      >
                        <Plus size={12} /> Add to .bib
                      </button>
                      <button
                        type="button"
                        className="mirtex-btn primary"
                        onClick={async () => {
                          await addRawBibtexAction(item.bibtex);
                          insertKeyIntoEditor(item.citekey);
                        }}
                      >
                        Add & Cite
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'quickadd' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <form
                onSubmit={(e) => void handleQuickLookup(e)}
                style={{
                  padding: 14,
                  borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-app)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <strong style={{ fontSize: 13 }}>Instant Lookup by DOI, PubMed ID (PMID), or arXiv ID</strong>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Examples: <code>10.1038/s41586-021-03819-2</code> · <code>PMID:34265844</code> ·{' '}
                  <code>2305.12345</code>
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="mirtex-input"
                    placeholder="Paste DOI, PMID, or arXiv ID…"
                    value={idInput}
                    onChange={(e) => setIdInput(e.target.value)}
                  />
                  <button type="submit" className="mirtex-btn primary" disabled={idLoading}>
                    {idLoading ? <Loader2 size={13} className="spin" /> : <Plus size={13} />} Fetch & Add
                  </button>
                </div>
                {idFeedback && <div style={{ fontSize: 12, color: 'var(--accent-hover)' }}>{idFeedback}</div>}
              </form>

              <div
                style={{
                  padding: 14,
                  borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-app)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <strong style={{ fontSize: 13 }}>Paste Raw BibTeX (from Google Scholar, PubMed, or Zotero)</strong>
                <textarea
                  className="mirtex-textarea"
                  style={{ minHeight: 130, fontFamily: 'Consolas, monospace', fontSize: 12 }}
                  placeholder="@article{smith2024,&#10;  author = {Smith, Jane},&#10;  title = {...},&#10;  journal = {Nature},&#10;  year = {2024}&#10;}"
                  value={rawBibInput}
                  onChange={(e) => setRawBibInput(e.target.value)}
                />
                <div>
                  <button
                    type="button"
                    className="mirtex-btn primary"
                    disabled={!rawBibInput.trim()}
                    onClick={async () => {
                      const n = await addRawBibtexAction(rawBibInput);
                      if (n > 0) setRawBibInput('');
                    }}
                  >
                    Add BibTeX to references.bib
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'audit' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <span className="pill-badge info">Cited unique keys: {audit.totalCitedKeys}</span>
                <span className="pill-badge">Library entries: {audit.totalLibraryEntries}</span>
                <span className={`pill-badge ${audit.missingKeys.length > 0 ? 'danger' : 'success'}`}>
                  Missing keys: {audit.missingKeys.length}
                </span>
                <span className="pill-badge">Unused entries: {audit.unusedKeys.length}</span>
              </div>

              {audit.missingKeys.length > 0 && (
                <div>
                  <strong style={{ fontSize: 12.5, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <AlertTriangle size={14} /> Broken Citation Keys (Cited in Paper, Missing in references.bib)
                  </strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {audit.missingKeys.map((k) => (
                      <span key={k} className="pill-badge danger">
                        @{k}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {audit.incompleteEntries.length > 0 && (
                <div>
                  <strong style={{ fontSize: 12.5 }}>Entries Missing Recommended BibTeX Fields</strong>
                  {audit.incompleteEntries.map((item) => (
                    <div key={item.key} style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      <code>@{item.key}</code> — missing: {item.missingFields.join(', ')}
                    </div>
                  ))}
                </div>
              )}

              {audit.missingKeys.length === 0 && audit.incompleteEntries.length === 0 && (
                <div className="pill-badge success" style={{ padding: '10px 14px', borderRadius: 7 }}>
                  All citations in your manuscript resolve cleanly against references.bib.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="mirtex-btn" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
