import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileText, Loader2, Play, Terminal } from 'lucide-react';
import { usePaperStore, getActiveSection } from '../../stores/paperStore';
import { renderAcademicPreviewHtml } from '../../utils/academicMarkdown';
import { openPathExternal } from '../../services/fileService';
import './Preview.css';

interface PreviewProps {
  mode: 'academic' | 'pdf';
  fullPaper?: boolean;
}

export function Preview({ mode, fullPaper = false }: PreviewProps) {
  const project = usePaperStore((s) => s.project);
  const frontMatter = usePaperStore((s) => s.frontMatter);
  const sectionContents = usePaperStore((s) => s.sectionContents);
  const activeTarget = usePaperStore((s) => s.activeTarget);
  const bibEntries = usePaperStore((s) => s.bibEntries);
  const citationStyle = usePaperStore((s) => s.citationStyle);
  const figureDataUrls = usePaperStore((s) => s.figureDataUrls);
  const lastCompileResult = usePaperStore((s) => s.lastCompileResult);
  const isCompilingPdf = usePaperStore((s) => s.isCompilingPdf);
  const compilePdfAction = usePaperStore((s) => s.compilePdfAction);
  const openInTexstudioAction = usePaperStore((s) => s.openInTexstudioAction);

  const [showWholePaper, setShowWholePaper] = useState(fullPaper);
  const [showRawLog, setShowRawLog] = useState(false);

  // Convert base64 PDF from Rust into an object URL for crisp embedded PDF rendering
  const pdfBlobUrl = useMemo(() => {
    if (!lastCompileResult?.pdf_base64) return null;
    try {
      const bin = atob(lastCompileResult.pdf_base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }, [lastCompileResult?.pdf_base64]);

  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  const activeSec = getActiveSection(usePaperStore.getState());

  const renderedHtml = useMemo(() => {
    if (mode !== 'academic' || !project) return '';
    const useWhole = fullPaper || showWholePaper || activeTarget === 'frontmatter';
    const targetSections = useWhole
      ? project.sections.map((s) => ({
          id: s.id,
          title: s.title,
          markdown: sectionContents[s.id] ?? '',
        }))
      : activeSec
        ? [{ id: activeSec.id, title: activeSec.title, markdown: sectionContents[activeSec.id] ?? '' }]
        : [];

    return renderAcademicPreviewHtml({
      frontMatter,
      sections: targetSections,
      bibEntries,
      citationStyle,
      imageDataUrls: figureDataUrls,
      includeFrontMatter: useWhole,
      includeReferences: true,
    });
  }, [
    mode,
    project,
    fullPaper,
    showWholePaper,
    activeTarget,
    activeSec,
    frontMatter,
    sectionContents,
    bibEntries,
    citationStyle,
    figureDataUrls,
  ]);

  if (mode === 'pdf') {
    const errors = lastCompileResult?.diagnostics.filter((d) => d.severity === 'error') || [];
    const warnings = lastCompileResult?.diagnostics.filter((d) => d.severity === 'warning') || [];

    return (
      <div className="preview-container">
        <div className="preview-header">
          <span>
            <strong>Compiled LaTeX PDF</strong>
            {lastCompileResult && (
              <>
                {' '}
                · {lastCompileResult.engine_used} ({(lastCompileResult.elapsed_ms / 1000).toFixed(1)}s)
              </>
            )}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="mirtex-btn"
              onClick={() => setShowRawLog((v) => !v)}
              disabled={!lastCompileResult}
              title="Toggle compiler log"
            >
              <Terminal size={12} /> Log
            </button>
            <button
              type="button"
              className="mirtex-btn"
              onClick={() => void openInTexstudioAction()}
              disabled={!project}
              title="Open generated .tex in TeXstudio"
            >
              <ExternalLink size={12} /> TeXstudio
            </button>
            {lastCompileResult?.pdf_path && (
              <button
                type="button"
                className="mirtex-btn"
                onClick={() => void openPathExternal(lastCompileResult.pdf_path!)}
                title="Open PDF in external viewer"
              >
                <FileText size={12} /> Open PDF
              </button>
            )}
            <button
              type="button"
              className="mirtex-btn primary"
              disabled={isCompilingPdf || !project}
              onClick={() => void compilePdfAction(true)}
            >
              {isCompilingPdf ? <Loader2 size={12} className="spin" /> : <Play size={12} />}
              {isCompilingPdf ? 'Compiling…' : 'Compile'}
            </button>
          </div>
        </div>

        <div className="pdf-viewer-wrap">
          {pdfBlobUrl && !showRawLog ? (
            <iframe className="pdf-iframe" src={pdfBlobUrl} title="Compiled LaTeX PDF" />
          ) : showRawLog && lastCompileResult ? (
            <pre
              style={{
                flex: 1,
                overflow: 'auto',
                padding: 16,
                fontSize: 11.5,
                fontFamily: 'Consolas, monospace',
                background: 'var(--bg-editor)',
                color: 'var(--text-color)',
                whiteSpace: 'pre-wrap',
              }}
            >
              {lastCompileResult.log}
            </pre>
          ) : (
            <div className="pdf-empty-state">
              <FileText size={36} style={{ opacity: 0.4 }} />
              <p style={{ maxWidth: 380, fontSize: 13.5 }}>
                Click <strong>Compile</strong> (or press <code>Ctrl+Shift+B</code>) to inject your
                sections into the active LaTeX template and build a real PDF with TeX Live 2024.
              </p>
              <button
                type="button"
                className="mirtex-btn primary"
                disabled={isCompilingPdf || !project}
                onClick={() => void compilePdfAction(true)}
              >
                <Play size={13} /> Build PDF Now
              </button>
            </div>
          )}

          {lastCompileResult && (errors.length > 0 || warnings.length > 0) && (
            <div className="compile-diagnostics-drawer">
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                Diagnostics: {errors.length} error(s), {warnings.length} warning(s)
              </div>
              {lastCompileResult.diagnostics.slice(0, 20).map((d, idx) => (
                <div key={idx} className={`diag-row ${d.severity}`}>
                  <strong>
                    {d.severity.toUpperCase()}
                    {d.line ? ` L${d.line}` : ''}
                  </strong>
                  <span>{d.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="preview-container">
      <div className="preview-header">
        <span>
          <strong>Academic Preview</strong> · Style: <code>{citationStyle.toUpperCase()}</code> (KaTeX + CSL)
        </span>
        {!fullPaper && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className={`mirtex-btn ${!showWholePaper ? 'primary' : ''}`}
              onClick={() => setShowWholePaper(false)}
            >
              Current Section
            </button>
            <button
              type="button"
              className={`mirtex-btn ${showWholePaper ? 'primary' : ''}`}
              onClick={() => setShowWholePaper(true)}
            >
              Full Paper
            </button>
          </div>
        )}
      </div>
      <div className="preview-scroll">
        <article
          className="academic-paper-sheet"
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      </div>
    </div>
  );
}
