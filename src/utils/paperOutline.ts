import type { ProjectFigureFile, SubsectionHeading } from '../types/paper';
import { normalizeAcademicMarkdown } from './normalizeAcademicMarkdown';

export interface IndexedElement {
  kind: 'figure' | 'table' | 'equation' | 'section';
  label: string;
  title: string;
  number: number;
  sectionId: string;
  sectionTitle: string;
  imagePath?: string;
}

export function cleanFigureCaption(rawCaption: string, imgPath: string): string {
  const trimmed = rawCaption.trim();
  if (!trimmed) return '';
  const base = imgPath.trim().replace(/\\/g, '/').split('/').pop() || '';
  if (!base) return trimmed;
  const stem = base.replace(/\.[^.]+$/, '');
  const lower = trimmed.toLowerCase();
  const stemSpaced = stem.replace(/[_-]+/g, ' ').trim().toLowerCase();
  const stemHyphen = stem.replace(/_+/g, '-').trim().toLowerCase();
  if (
    lower === base.toLowerCase() ||
    (stem && lower === stem.toLowerCase()) ||
    (stemSpaced && lower === stemSpaced) ||
    (stemHyphen && lower === stemHyphen)
  ) {
    return '';
  }
  return trimmed;
}

export function figureLabelFromFileName(fileName: string): string {
  const base = fileName.replace(/\\/g, '/').split('/').pop() || fileName;
  const stem = base.replace(/\.[^.]+$/, '');
  let slug = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.startsWith('fig-')) {
    slug = slug.slice(4).replace(/^-+/, '');
  }
  return `fig:${slug || 'figure'}`;
}

export function mergePaperAndFolderFigures(
  elements: IndexedElement[],
  projectFigures: ProjectFigureFile[]
): IndexedElement[] {
  if (projectFigures.length === 0) return elements;

  const embeddedFigures = elements.filter((e) => e.kind === 'figure');
  const existingLabels = new Set(embeddedFigures.map((e) => e.label.toLowerCase()));
  const existingPaths = new Set(
    embeddedFigures
      .map((e) => e.imagePath?.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase())
      .filter((p): p is string => Boolean(p))
  );

  let nextFigNum = embeddedFigures.reduce((max, e) => Math.max(max, e.number), 0);
  const appended: IndexedElement[] = [];

  for (const fig of projectFigures) {
    const relNorm = fig.relPath.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
    const nameNorm = fig.name.toLowerCase();
    const isAlreadyEmbedded =
      existingLabels.has(fig.label.toLowerCase()) ||
      existingPaths.has(relNorm) ||
      existingPaths.has(nameNorm);
    if (isAlreadyEmbedded) continue;

    nextFigNum++;
    appended.push({
      kind: 'figure',
      label: fig.label,
      title: fig.title,
      number: nextFigNum,
      sectionId: 'figures-folder',
      sectionTitle: fig.relPath,
      imagePath: fig.relPath,
    });
  }

  return appended.length > 0 ? [...elements, ...appended] : elements;
}

/** Counts prose words while ignoring markdown punctuation and LaTeX display math delimiters. */
export function countAcademicWords(markdown: string): number {
  const cleaned = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' EQUATION ')
    .replace(/!\[((?:[^[\]\n]|\[[^[\]\n]*\])*)\]\([^)\n]+\)(?:\{[^}\n]*\})?/g, ' $1 ')
    .replace(/\[((?:[^[\]\n]|\[[^[\]\n]*\])*)\]\([^)\n]+\)/g, ' $1 ')
    .replace(/[#*_>`~|]/g, ' ')
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

export function formatWordsCompact(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

function normalizeHeadingForCompare(raw: string): string {
  return raw
    .replace(/[*_`]/g, '')
    .replace(/^\d+(?:\.\d+)*\.?\s*/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Extracts `##` and `###` subsection headings from a section's Markdown. */
export function extractSubsections(markdown: string, sectionTitle?: string): SubsectionHeading[] {
  const headings: SubsectionHeading[] = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let inFence = false;
  let idx = 0;
  let seenContentLine = false;
  const normSection = sectionTitle ? normalizeHeadingForCompare(sectionTitle) : '';

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('```')) {
      inFence = !inFence;
      seenContentLine = true;
      continue;
    }
    if (inFence) continue;
    const isFirstContentLine = !seenContentLine;
    seenContentLine = true;

    const m = /^(#{2,3})[ \t]+(.+?)(?:\s*\{#[^}]+\})?\s*$/.exec(line);
    if (m) {
      const cleanTitle = m[2].replace(/[*_`]/g, '').trim();
      if (isFirstContentLine && m[1].length === 2 && normSection) {
        const normHeading = normalizeHeadingForCompare(cleanTitle);
        if (
          normHeading === normSection ||
          normHeading === `${normSection}s` ||
          normSection === `${normHeading}s` ||
          normHeading.includes(normSection) ||
          normSection.includes(normHeading)
        ) {
          continue;
        }
      }
      headings.push({
        index: idx++,
        level: m[1].length as 2 | 3,
        title: cleanTitle,
      });
    }
  }
  return headings;
}

/** Indexes every figure, table, labeled equation, and labeled section across the whole paper. */
export function indexPaperElements(
  sections: { id: string; title: string; markdown: string }[],
  projectFigures?: ProjectFigureFile[]
): IndexedElement[] {
  const elements: IndexedElement[] = [];
  let figNum = 0;
  let tblNum = 0;
  let eqNum = 0;
  let secNum = 0;

  for (const rawSec of sections) {
    const sec = { ...rawSec, markdown: normalizeAcademicMarkdown(rawSec.markdown) };
    secNum++;
    const secSlug = sec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    elements.push({
      kind: 'section',
      label: `sec:${secSlug || sec.id}`,
      title: sec.title,
      number: secNum,
      sectionId: sec.id,
      sectionTitle: sec.title,
    });

    // Figures: ![Caption](path){#fig:id ...} (supports nested [...] inside captions)
    const figRe =
      /!\[((?:[^[\]\n]|\[[^[\]\n]*\])*)\]\(([^)\n]+)\)(?:[ \t]*\{([^}\n]*)\})?(?:[ \t]*\n(?:[ \t]*\n)?(?:Caption|Figure):[ \t]*(.+?))?(?=\n|$)/gim;
    let m: RegExpExecArray | null;
    while ((m = figRe.exec(sec.markdown)) !== null) {
      figNum++;
      const attrs = m[3] || '';
      const imgPath = m[2].trim();
      const derivedLabel = imgPath ? figureLabelFromFileName(imgPath) : '';
      const lbl =
        /#(fig:[a-zA-Z0-9_.-]+)/.exec(attrs)?.[1] || derivedLabel || `fig:figure-${figNum}`;
      const rawCap = m[4] !== undefined ? m[4] : m[1];
      const cleanedCap = cleanFigureCaption(rawCap, imgPath);
      elements.push({
        kind: 'figure',
        label: lbl,
        title: cleanedCap || `Figure ${figNum}`,
        number: figNum,
        sectionId: sec.id,
        sectionTitle: sec.title,
        imagePath: imgPath,
      });
    }

    // Standalone `@fig:id: Caption` or `@fig:id [Caption]` declarations
    const standaloneFigRe =
      /^@(fig:[a-zA-Z0-9_.-]+)(?:[ \t]*\{[^}\n]*\})?(?:[ \t]*:[ \t]*(.+?)|[ \t]+\[([^[\]\n]+)\])(?:[ \t]*\n(?:[ \t]*\n)?(?:Caption|Figure):[ \t]*(.+?))?[ \t]*$/gim;
    while ((m = standaloneFigRe.exec(sec.markdown)) !== null) {
      const lbl = m[1];
      if (elements.some((e) => e.kind === 'figure' && e.label.toLowerCase() === lbl.toLowerCase())) {
        continue;
      }
      figNum++;
      const matchedFile = projectFigures?.find(
        (f) => f.label.toLowerCase() === lbl.toLowerCase()
      );
      const rawCap = m[4] ?? m[2] ?? m[3] ?? '';
      const cleanedCap = cleanFigureCaption(rawCap, matchedFile?.relPath || lbl);
      elements.push({
        kind: 'figure',
        label: lbl,
        title: cleanedCap || `Figure ${figNum}`,
        number: figNum,
        sectionId: sec.id,
        sectionTitle: sec.title,
        imagePath: matchedFile?.relPath,
      });
    }

    // Tables: `Table: Caption {#tbl:id}`, `Table N: Caption`, or `**Table N. Caption**`
    const tblRe =
      /^(?:Table(?:\s+(\d+))?:\s*(.+?)(?:\s*\{#(tbl:[a-zA-Z0-9_.-]+)\})?|\*\*Table(?:\s+(\d+))?[.:]\s*(.+?)\*\*(?:\s*\{#(tbl:[a-zA-Z0-9_.-]+)\})?)[ \t]*$/gim;
    while ((m = tblRe.exec(sec.markdown)) !== null) {
      tblNum++;
      const explicitNum = m[1] || m[4];
      const title = (m[2] ?? m[5] ?? '').trim();
      const explicitLabel = m[3] || m[6];
      elements.push({
        kind: 'table',
        label: explicitLabel || `tbl:table-${explicitNum || tblNum}`,
        title,
        number: tblNum,
        sectionId: sec.id,
        sectionTitle: sec.title,
      });
    }

    // Equations: $$ ... $$ {#eq:id}
    const eqRe = /\$\$[\s\S]*?\$\$(?:\s*\{#(eq:[a-zA-Z0-9_.-]+)\})?/g;
    while ((m = eqRe.exec(sec.markdown)) !== null) {
      eqNum++;
      if (m[1]) {
        elements.push({
          kind: 'equation',
          label: m[1],
          title: `Equation (${eqNum})`,
          number: eqNum,
          sectionId: sec.id,
          sectionTitle: sec.title,
        });
      }
    }
  }

  return projectFigures && projectFigures.length > 0
    ? mergePaperAndFolderFigures(elements, projectFigures)
    : elements;
}

export function slugifySectionName(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'section'
  );
}
