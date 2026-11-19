import type { PaperFrontMatter, PaperSection } from '../types/paper';
import type { ExtractedSlot, TemplateManifest } from '../types/latex';
import {
  renderAbstractSlot,
  renderAuthorsSlot,
  renderDeclarationsSlot,
  renderHighlightsSlot,
  renderKeywordsSlot,
  renderTitleSlot,
} from './adapters';
import { escapeLatexText, markdownToLatex } from './markdownToLatex';

export interface SectionContentMap {
  /** section.id -> markdown content */
  [sectionId: string]: string;
}

export interface PatchTemplateOptions {
  manifest: TemplateManifest;
  frontMatter: PaperFrontMatter;
  sections: PaperSection[];
  sectionContents: SectionContentMap;
  /** Optional explicit mapping: slot.id -> section.id */
  slotMap?: Record<string, string>;
  citationCommandOverride?: 'auto' | 'cite' | 'citep' | 'autocite';
  bibFileName?: string; // defaults to 'references'
}

export interface PatchedTemplateResult {
  texSource: string;
  citedKeys: string[];
  mappedSlots: Record<string, string>;
  unmappedSections: PaperSection[];
  injectedPackages: string[];
}

/**
 * Automatically maps extracted template slots to MirTex paper sections using:
 * 1. Explicit user overrides in `slotMap`
 * 2. Matching semantic role (`abstract`, `introduction`, `methods`, `results`, `discussion`, etc.)
 * 3. Fuzzy heading title match
 */
export function resolveSlotMapping(
  manifest: TemplateManifest,
  sections: PaperSection[],
  explicitMap: Record<string, string> = {}
): Record<string, string> {
  const result: Record<string, string> = {};
  const usedSections = new Set<string>();

  // 1. Respect valid explicit overrides
  for (const [slotId, secId] of Object.entries(explicitMap)) {
    if (sections.some((s) => s.id === secId) && manifest.slots.some((sl) => sl.id === slotId)) {
      result[slotId] = secId;
      usedSections.add(secId);
    }
  }

  // 2. Match remaining section-like slots by semantic role
  const sectionSlots = manifest.slots.filter(
    (sl) =>
      sl.kind === 'abstract' ||
      sl.kind === 'section' ||
      sl.kind === 'backmatter_heading' ||
      sl.kind === 'declarations' ||
      sl.kind === 'appendix'
  );

  for (const slot of sectionSlots) {
    if (result[slot.id]) continue;
    if (slot.suggestedRole && slot.suggestedRole !== 'custom') {
      const match = sections.find(
        (sec) => !usedSections.has(sec.id) && sec.role === slot.suggestedRole
      );
      if (match) {
        result[slot.id] = match.id;
        usedSections.add(match.id);
      }
    }
  }

  // 3. Match remaining by normalized title
  for (const slot of sectionSlots) {
    if (result[slot.id]) continue;
    const normSlot = (slot.sectionTitle || slot.label).toLowerCase().replace(/[^a-z0-9]/g, '');
    const match = sections.find((sec) => {
      if (usedSections.has(sec.id)) return false;
      const normSec = sec.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      return normSec === normSlot || normSec.includes(normSlot) || normSlot.includes(normSec);
    });
    if (match) {
      result[slot.id] = match.id;
      usedSections.add(match.id);
    }
  }

  return result;
}

/**
 * Performs non-destructive, reverse-offset span patching on the imported `.tex` template,
 * preserving every journal macro, class option, and layout command verbatim while injecting
 * MirTex's structured front matter, transpiled sections, and bibliography pointer.
 */
export function patchLatexTemplate(opts: PatchTemplateOptions): PatchedTemplateResult {
  const { manifest, frontMatter, sections, sectionContents } = opts;
  const bibBase = (opts.bibFileName || 'references').replace(/\.bib$/i, '');
  const mappedSlots = resolveSlotMapping(manifest, sections, opts.slotMap);

  const transpileOpts = {
    citationDialect: manifest.citationDialect,
    citationCommandOverride: opts.citationCommandOverride,
    useCleveref: manifest.hasCleveref,
    useBooktabs: true,
    stripTopH1: true,
  };

  let usesFigures = false;
  let usesTables = false;
  let usesMath = false;
  const allCitedKeys = new Set<string>();

  const transpileSection = (sec: PaperSection): string => {
    const md = sectionContents[sec.id] ?? '';
    const res = markdownToLatex(md, transpileOpts);
    if (res.usesFigures) usesFigures = true;
    if (res.usesTables) usesTables = true;
    if (res.usesMath) usesMath = true;
    for (const k of res.citedKeys) allCitedKeys.add(k);
    return res.latex;
  };

  interface SpanEdit {
    start: number;
    end: number;
    replacement: string;
  }

  const edits: SpanEdit[] = [];
  const usedSectionIds = new Set<string>(Object.values(mappedSlots));
  let lastBodySectionSlotEnd: number | null = null;
  let bibSlotStart: number | null = null;

  for (const slot of manifest.slots) {
    const edit = buildSlotReplacement(
      slot,
      manifest,
      frontMatter,
      sections,
      mappedSlots,
      transpileSection,
      bibBase
    );
    if (slot.kind === 'section') {
      lastBodySectionSlotEnd = slot.end;
    }
    if (slot.kind === 'bibliography') {
      bibSlotStart = slot.start;
    }
    if (edit !== null) {
      edits.push({ start: slot.start, end: slot.end, replacement: edit });
    }
  }

  // Handle any user sections that didn't match an existing slot in the template
  const unmappedSections = sections.filter(
    (s) => !usedSectionIds.has(s.id) && s.role !== 'abstract'
  );
  if (unmappedSections.length > 0) {
    const extraLatex = unmappedSections
      .map((sec) => {
        const body = transpileSection(sec);
        const cmd = sec.starred ? '\\section*' : '\\section';
        return `\n${cmd}{${escapeLatexText(sec.title)}}\n\n${body}\n`;
      })
      .join('\n');

    const insertAt =
      lastBodySectionSlotEnd ?? bibSlotStart ?? manifest.documentEndOffset;
    edits.push({ start: insertAt, end: insertAt, replacement: extraLatex });
  }

  // Auto-inject required packages into preamble if used by the paper and absent from template
  const injectedPackages: string[] = [];
  if (usesFigures && !manifest.hasGraphicx) injectedPackages.push('graphicx');
  if (usesTables && !manifest.hasBooktabs) injectedPackages.push('booktabs');
  if (usesMath && !manifest.hasAmsmath) injectedPackages.push('amsmath');

  if (injectedPackages.length > 0 && manifest.preambleEndOffset > 0) {
    const pkgBlock =
      `\n% Added automatically by MirTex for paper elements\n` +
      injectedPackages.map((p) => `\\usepackage{${p}}`).join('\n') +
      `\n`;
    edits.push({
      start: manifest.preambleEndOffset,
      end: manifest.preambleEndOffset,
      replacement: pkgBlock,
    });
  }

  // Also update \addbibresource{...} in preamble for BibLaTeX templates
  if (manifest.bibSystem === 'biblatex') {
    const addBibRegex = /\\addbibresource\{[^}]*\}/;
    const match = addBibRegex.exec(manifest.rawSource);
    if (match && match.index !== undefined) {
      edits.push({
        start: match.index,
        end: match.index + match[0].length,
        replacement: `\\addbibresource{${bibBase}.bib}`,
      });
    }
  }

  // Apply edits in descending start-offset order so earlier indices stay valid!
  edits.sort((a, b) => b.start - a.start || b.end - a.end);

  let output = manifest.rawSource;
  let lastAppliedStart = Number.POSITIVE_INFINITY;
  for (const edit of edits) {
    // Guard against overlapping spans
    if (edit.end > lastAppliedStart) continue;
    output = output.slice(0, edit.start) + edit.replacement + output.slice(edit.end);
    lastAppliedStart = edit.start;
  }

  return {
    texSource: output,
    citedKeys: Array.from(allCitedKeys),
    mappedSlots,
    unmappedSections,
    injectedPackages,
  };
}

function buildSlotReplacement(
  slot: ExtractedSlot,
  manifest: TemplateManifest,
  fm: PaperFrontMatter,
  sections: PaperSection[],
  mappedSlots: Record<string, string>,
  transpileSection: (sec: PaperSection) => string,
  bibBase: string
): string | null {
  switch (slot.kind) {
    case 'title':
      return renderTitleSlot(fm, manifest);
    case 'authors':
      return renderAuthorsSlot(fm, manifest);
    case 'date':
      return fm.date?.trim() ? `\\date{${escapeLatexText(fm.date.trim())}}` : `\\date{\\today}`;
    case 'keywords':
      return renderKeywordsSlot(fm.keywords, slot, manifest);
    case 'highlights':
      return renderHighlightsSlot(fm.highlights);
    case 'bibliography':
      if (slot.commandName === 'printbibliography') {
        return '\\printbibliography';
      }
      return `\\bibliography{${bibBase}}`;
    case 'abstract': {
      const secId = mappedSlots[slot.id];
      const sec = sections.find((s) => s.id === secId) || sections.find((s) => s.role === 'abstract');
      const body = sec ? transpileSection(sec) : '';
      return renderAbstractSlot(body, slot);
    }
    case 'declarations': {
      const secId = mappedSlots[slot.id];
      const sec = sections.find((s) => s.id === secId);
      const overrideBody = sec ? transpileSection(sec) : undefined;
      return `${renderDeclarationsSlot(fm, overrideBody)}\n`;
    }
    case 'backmatter_heading': {
      const secId = mappedSlots[slot.id];
      const sec = sections.find((s) => s.id === secId);
      if (!sec) return '';
      const body = transpileSection(sec);
      if (!body.trim()) return '';
      return `\\bmhead{${escapeLatexText(sec.title)}}\n\n${body}\n\n`;
    }
    case 'appendix': {
      const secId = mappedSlots[slot.id];
      const sec = sections.find((s) => s.id === secId);
      if (!sec) return '';
      const body = transpileSection(sec);
      if (!body.trim()) return '';
      const env = slot.commandName || 'appendices';
      return `\\begin{${env}}\n\\section{${escapeLatexText(sec.title)}}\n\n${body}\n\\end{${env}}\n`;
    }
    case 'section': {
      const secId = mappedSlots[slot.id];
      const sec = sections.find((s) => s.id === secId);
      if (!sec) {
        // Unmapped template placeholder section is omitted cleanly
        return '';
      }
      const body = transpileSection(sec);
      const cmd = slot.starred || sec.starred ? '\\section*' : '\\section';
      const lbl = slot.latexLabel ? `\\label{${slot.latexLabel}}` : '';
      return `${cmd}{${escapeLatexText(sec.title)}}${lbl}\n\n${body}\n\n`;
    }
    default:
      return null;
  }
}
