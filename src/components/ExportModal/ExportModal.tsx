import { useMemo, useState } from 'react';
import {
  Archive,
  ExternalLink,
  FileCode2,
  FileDown,
  FileText,
  Loader2,
  Play,
  X,
} from 'lucide-react';
import { usePaperStore } from '../../stores/paperStore';
import { patchLatexTemplate } from '../../latex/templatePatcher';
import {
  assembleLatexBuildDir,
  buildCombinedMarkdown,
  buildOverleafZip,
} from '../../export/exportPaper';
import { buildAcademicDocx } from '../../export/docxAcademic';
import { saveBinaryAs, saveTextAs } from '../../services/fileService';

export function ExportModal() {
  const open = usePaperStore((s) => s.exportModalOpen);
  const setOpen = usePaperStore((s) => s.setExportModalOpen);
  const projectPath = usePaperStore((s) => s.projectPath);
  const project = usePaperStore((s) => s.project);
  const frontMatter = usePaperStore((s) => s.frontMatter);
  const sectionContents = usePaperStore((s) => s.sectionContents);
  const activeManifest = usePaperStore((s) => s.activeManifest);
  const bibEntries = usePaperStore((s) => s.bibEntries);
  const citationStyle = usePaperStore((s) => s.citationStyle);
  const isCompilingPdf = usePaperStore((s) => s.isCompilingPdf);
  const compilePdfAction = usePaperStore((s) => s.compilePdfAction);
  const openInTexstudioAction = usePaperStore((s) => s.openInTexstudioAction);
  const setStatusMessage = usePaperStore((s) => s.setStatusMessage);

  const [pruneBib, setPruneBib] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showGeneratedTex, setShowGeneratedTex] = useState(false);

  const previewPatched = useMemo(() => {
    if (!open || !project) return null;
    return patchLatexTemplate({
      manifest: activeManifest,
      frontMatter,
      sections: project.sections,
      sectionContents,
      slotMap: project.templateSlotMap,
      citationCommandOverride: project.citationCommandMode,
      bibFileName: 'references',
    });
  }, [open, project, activeManifest, frontMatter, sectionContents]);

  if (!open || !project || !projectPath) return null;

  const baseName = (frontMatter.shortTitle || project.name || 'manuscript')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .slice(0, 48);

  const handleExportZip = async () => {
    setBusy(true);
    try {
      const assembled = await assembleLatexBuildDir({
        projectPath,
        project,
        frontMatter,
        sectionContents,
        manifest: activeManifest,
        bibEntries,
        pruneUnusedBib: pruneBib,
      });
      const blob = await buildOverleafZip({ projectPath, assembled, manifest: activeManifest });
      const saved = await saveBinaryAs(blob, `${baseName}_latex.zip`, {
        name: 'Overleaf / LaTeX ZIP Archive',
        extensions: ['zip'],
      });
      if (saved) setStatusMessage(`Exported Overleaf/Journal ZIP: ${saved.name}`);
    } finally {
      setBusy(false);
    }
  };

  const handleExportTex = async () => {
    if (!previewPatched) return;
    const saved = await saveTextAs(previewPatched.texSource, `${baseName}.tex`, [
      { name: 'LaTeX Source', extensions: ['tex'] },
    ]);
    if (saved) setStatusMessage(`Exported LaTeX file: ${saved.name}`);
  };

  const handleExportDocx = async () => {
    setBusy(true);
    try {
      const blob = await buildAcademicDocx({
        frontMatter,
        sections: project.sections,
        sectionContents,
        bibEntries,
        citationStyle,
      });
      const saved = await saveBinaryAs(blob, `${baseName}.docx`, {
        name: 'Microsoft Word Document',
        extensions: ['docx'],
      });
      if (saved) setStatusMessage(`Exported Word manuscript: ${saved.name}`);
    } finally {
      setBusy(false);
    }
  };

  const handleExportMd = async () => {
    const md = buildCombinedMarkdown(frontMatter, project, sectionContents);
    const saved = await saveTextAs(md, `${baseName}.md`, [
      { name: 'Markdown File', extensions: ['md'] },
    ]);
    if (saved) setStatusMessage(`Exported Markdown: ${saved.name}`);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card wide" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className="modal-title">
            <FileDown size={16} /> Compile & Export Scientific Paper
          </div>
          <button type="button" className="modal-close-btn" onClick={() => setOpen(false)}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 10,
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid var(--border-color)',
              background: 'var(--bg-app)',
            }}
          >
            <div style={{ fontSize: 12.5 }}>
              Active Template: <strong>{activeManifest.name}</strong> (
              <code>{activeManifest.documentClass}</code>) · Cited keys:{' '}
              <strong>{previewPatched?.citedKeys.length ?? 0}</strong>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
              <input
                type="checkbox"
                checked={pruneBib}
                onChange={(e) => setPruneBib(e.target.checked)}
              />
              Prune unused entries from exported <code>references.bib</code>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            <button
              type="button"
              className="welcome-preset-card"
              disabled={isCompilingPdf || busy}
              onClick={async () => {
                setOpen(false);
                await compilePdfAction(true);
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isCompilingPdf ? <Loader2 size={16} className="spin" /> : <Play size={16} style={{ color: 'var(--accent-color)' }} />}
                <strong>Compile PDF Locally (TeX Live 2024)</strong>
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Runs pdflatex/bibtex into <code>build/</code> and opens the real typeset PDF in MirTex.
              </span>
            </button>

            <button
              type="button"
              className="welcome-preset-card"
              disabled={busy}
              onClick={() => void handleExportZip()}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Archive size={16} style={{ color: 'var(--accent-color)' }} />
                <strong>Overleaf / Journal Submission .zip</strong>
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Self-contained package with patched <code>.tex</code>, <code>references.bib</code>, <code>figures/</code>, and template <code>.cls/.sty</code>.
              </span>
            </button>

            <button
              type="button"
              className="welcome-preset-card"
              disabled={busy}
              onClick={() => void handleExportTex()}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileCode2 size={16} style={{ color: 'var(--accent-color)' }} />
                <strong>Single LaTeX Source (.tex)</strong>
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Save the assembled <code>.tex</code> manuscript directly to disk.
              </span>
            </button>

            <button
              type="button"
              className="welcome-preset-card"
              disabled={busy}
              onClick={() => void handleExportDocx()}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={16} style={{ color: 'var(--accent-color)' }} />
                <strong>Academic Word Document (.docx)</strong>
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Formatted Word manuscript with title page, resolved citations, and bibliography for collaborators.
              </span>
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="mirtex-btn" onClick={() => void handleExportMd()}>
              Export Combined Markdown (.md)
            </button>
            <button
              type="button"
              className="mirtex-btn"
              onClick={() => void openInTexstudioAction()}
            >
              <ExternalLink size={13} /> Open Build .tex in TeXstudio
            </button>
            <button
              type="button"
              className="mirtex-btn"
              onClick={() => setShowGeneratedTex((v) => !v)}
            >
              <FileCode2 size={13} /> {showGeneratedTex ? 'Hide' : 'Inspect'} Generated LaTeX Preview
            </button>
          </div>

          {showGeneratedTex && previewPatched && (
            <pre
              style={{
                maxHeight: 280,
                overflow: 'auto',
                padding: 12,
                borderRadius: 7,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-editor)',
                fontFamily: 'Consolas, monospace',
                fontSize: 11.5,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
              }}
            >
              {previewPatched.texSource}
            </pre>
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
