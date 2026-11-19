import type { SubsectionHeading } from '../types/paper';
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

/** Counts prose words while ignoring markdown punctuation and LaTeX display math delimiters. */
export function countAcademicWords(markdown: string): number {
  const cleaned = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' EQUATION ')
    .replace(/!\[([^\]]*)\]\([^)]+\)(?:\{[^}]*\})?/g, ' $1 ')
    .replace(/\[([^\]]*)\]\([^)]+\)/g, ' $1 ')
    .replace(/[#*_>`~|]/g, ' ')
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

export function formatWordsCompact(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

/** Extracts `##` and `###` subsection headings from a section's Markdown. */
export function extractSubsections(markdown: string): SubsectionHeading[] {
  const headings: SubsectionHeading[] = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let inFence = false;
  let idx = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{2,3})[ \t]+(.+?)(?:\s*\{#[^}]+\})?\s*$/.exec(line);
    if (m) {
      headings.push({
        index: idx++,
        level: m[1].length as 2 | 3,
        title: m[2].replace(/[*_`]/g, '').trim(),
      });
    }
  }
  return headings;
}

/** Indexes every figure, table, labeled equation, and labeled section across the whole paper. */
export function indexPaperElements(
  sections: { id: string; title: string; markdown: string }[]
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

    // Figures: ![Caption](path){#fig:id ...}
    const figRe = /!\[([^\]]*)\]\(([^)]+)\)(?:\{([^}]*)\})?/g;
    let m: RegExpExecArray | null;
    while ((m = figRe.exec(sec.markdown)) !== null) {
      figNum++;
      const attrs = m[3] || '';
      const lbl = /#(fig:[a-zA-Z0-9_.-]+)/.exec(attrs)?.[1] || `fig:figure-${figNum}`;
      elements.push({
        kind: 'figure',
        label: lbl,
        title: m[1].trim() || `Figure ${figNum}`,
        number: figNum,
        sectionId: sec.id,
        sectionTitle: sec.title,
        imagePath: m[2].trim(),
      });
    }

    // Tables: Table: Caption {#tbl:id}
    const tblRe = /^Table:\s*(.+?)(?:\s*\{#(tbl:[a-zA-Z0-9_.-]+)\})?\s*$/gim;
    while ((m = tblRe.exec(sec.markdown)) !== null) {
      tblNum++;
      elements.push({
        kind: 'table',
        label: m[2] || `tbl:table-${tblNum}`,
        title: m[1].trim(),
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

  return elements;
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
