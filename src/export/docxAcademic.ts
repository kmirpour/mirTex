import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { BibEntry, CitationStyle } from '../types/citation';
import type { PaperFrontMatter, PaperSection } from '../types/paper';
import { extractCitedKeysFromMarkdown } from '../citations/bibtex';
import { buildBibliographyOrder, formatInlineCitation } from '../citations/cslFormatter';
import {
  decodeBasicHtmlEntities,
  normalizeAcademicMarkdown,
} from '../utils/normalizeAcademicMarkdown';

/**
 * Exports the manuscript as a clean Academic Microsoft Word (.docx) document
 * with Title Page, Authors & Affiliations, Keywords, numbered Sections,
 * resolved citations, and a formatted References section.
 */
export async function buildAcademicDocx(params: {
  frontMatter: PaperFrontMatter;
  sections: PaperSection[];
  sectionContents: Record<string, string>;
  bibEntries: BibEntry[];
  citationStyle: CitationStyle;
}): Promise<Blob> {
  const { frontMatter, sections, sectionContents, bibEntries, citationStyle } = params;

  const allCitedKeys: string[] = [];
  for (const s of sections) {
    allCitedKeys.push(...extractCitedKeysFromMarkdown(sectionContents[s.id] ?? ''));
  }
  const bib = buildBibliographyOrder(allCitedKeys, bibEntries, citationStyle);
  const font = 'Times New Roman';

  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: frontMatter.title || 'Untitled Manuscript', bold: true, size: 32, font })],
    })
  );

  // Authors
  const affilIndex = new Map<string, number>();
  frontMatter.affiliations.forEach((a, idx) => affilIndex.set(a.id, idx + 1));
  const authorLine = frontMatter.authors
    .map((a) => {
      const nums = a.affiliationIds
        .map((id) => affilIndex.get(id))
        .filter((n): n is number => n !== undefined)
        .join(',');
      return `${a.firstName} ${a.lastName}${nums ? ` (${nums})` : ''}${a.corresponding ? '*' : ''}`;
    })
    .join(', ');
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: authorLine, size: 22, font })],
    })
  );

  // Affiliations
  frontMatter.affiliations.forEach((aff, idx) => {
    const line = `${idx + 1}. ${[aff.department, aff.institution, aff.city, aff.country].filter(Boolean).join(', ')}`;
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [new TextRun({ text: line, italics: true, size: 20, font })],
      })
    );
  });

  if (frontMatter.keywords.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 160, after: 240 },
        children: [
          new TextRun({ text: 'Keywords: ', bold: true, size: 22, font }),
          new TextRun({ text: frontMatter.keywords.join('; '), size: 22, font }),
        ],
      })
    );
  }

  // Body Sections
  for (const sec of sections) {
    const rawMd = normalizeAcademicMarkdown(sectionContents[sec.id] ?? '');
    const lines = rawMd.split('\n');
    let headingEmitted = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (/^#\s+/.test(line)) {
        headingEmitted = true;
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 280, after: 120 },
            children: [new TextRun({ text: line.replace(/^#\s+/, ''), bold: true, size: 26, font })],
          })
        );
        continue;
      }
      if (!headingEmitted) {
        headingEmitted = true;
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 280, after: 120 },
            children: [new TextRun({ text: sec.title, bold: true, size: 26, font })],
          })
        );
      }

      if (/^##\s+/.test(line)) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 220, after: 100 },
            children: [new TextRun({ text: line.replace(/^##\s+/, ''), bold: true, size: 24, font })],
          })
        );
        continue;
      }

      // Replace inline citations cleanly for Word readers
      const resolvedLine = decodeBasicHtmlEntities(line)
        .replace(/\[([^\]]*@[a-zA-Z0-9_.:-]+[^\]]*)\]/g, (_m, inner: string) => {
          const keys: string[] = [];
          const re = /@([a-zA-Z0-9_.:-]+)/g;
          let km: RegExpExecArray | null;
          while ((km = re.exec(inner)) !== null) {
            if (!/^(?:fig|tbl|eq|sec):/.test(km[1])) keys.push(km[1]);
          }
          return keys.length > 0
            ? formatInlineCitation(keys, bibEntries, citationStyle, bib.numberMap)
            : _m;
        })
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1');

      children.push(
        new Paragraph({
          spacing: { line: 360, after: 140 },
          children: [new TextRun({ text: resolvedLine, size: 24, font })],
        })
      );
    }
  }

  // References
  if (bib.references.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 320, after: 140 },
        children: [new TextRun({ text: 'References', bold: true, size: 26, font })],
      })
    );
    for (const ref of bib.references) {
      children.push(
        new Paragraph({
          spacing: { line: 280, after: 100 },
          children: [new TextRun({ text: ref.formatted, size: 22, font })],
        })
      );
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });
  return await Packer.toBlob(doc);
}
