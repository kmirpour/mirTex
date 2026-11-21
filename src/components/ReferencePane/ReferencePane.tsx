import { useMemo } from 'react';
import { usePaperStore } from '../../stores/paperStore';
import { renderAcademicPreviewHtml } from '../../utils/academicMarkdown';

export function ReferencePane() {
  const project = usePaperStore((s) => s.project);
  const sectionContents = usePaperStore((s) => s.sectionContents);
  const referenceSectionId = usePaperStore((s) => s.referenceSectionId);
  const setReferenceSectionId = usePaperStore((s) => s.setReferenceSectionId);
  const bibEntries = usePaperStore((s) => s.bibEntries);
  const citationStyle = usePaperStore((s) => s.citationStyle);
  const projectFigures = usePaperStore((s) => s.projectFigures);
  const figureDataUrls = usePaperStore((s) => s.figureDataUrls);

  const selectedSec =
    project?.sections.find((s) => s.id === referenceSectionId) ?? project?.sections[0] ?? null;

  const html = useMemo(() => {
    if (!selectedSec) return '';
    return renderAcademicPreviewHtml({
      sections: [{ id: selectedSec.id, title: selectedSec.title, markdown: sectionContents[selectedSec.id] ?? '' }],
      bibEntries,
      citationStyle,
      imageDataUrls: figureDataUrls,
      projectFigures,
      includeFrontMatter: false,
      includeReferences: false,
    });
  }, [selectedSec, sectionContents, bibEntries, citationStyle, figureDataUrls, projectFigures]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-preview)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '7px 14px',
          background: 'var(--bg-toolbar)',
          borderBottom: '1px solid var(--border-color)',
          gap: 8,
        }}
      >
        <strong style={{ fontSize: 12 }}>Reference Section (Read-Only)</strong>
        <select
          className="mirtex-select"
          style={{ width: 220, padding: '4px 8px', fontSize: 12 }}
          value={selectedSec?.id || ''}
          onChange={(e) => setReferenceSectionId(e.target.value)}
        >
          {(project?.sections || []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        <article
          className="academic-paper-sheet"
          style={{ padding: '28px 32px' }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
