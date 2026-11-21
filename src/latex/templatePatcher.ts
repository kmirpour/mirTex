import type { CitationStyle } from '../types/citation';
import type { PaperFrontMatter, PaperSection, ProjectFigureFile } from '../types/paper';
import type { ExtractedSlot, TemplateManifest } from '../types/latex';
import { normalizeAcademicMarkdown } from '../utils/normalizeAcademicMarkdown';
import { figureLabelFromFileName } from '../utils/paperOutline';
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
  /** Applies the user's selected citation style (APA author-year, Nature, IEEE, Vancouver) to natbib / sn-jnl templates */
  citationStyle?: CitationStyle;
  bibFileName?: string; // defaults to 'references'
  /** Discovered figure files in figures/ or figure/ folders */
  projectFigures?: ProjectFigureFile[];
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

  const embeddedFigureLabels = new Set<string>();
  for (const sec of sections) {
    const normMd = normalizeAcademicMarkdown(sectionContents[sec.id] ?? '');
    const figScanRe =
      /!\[((?:[^[\]\n]|\[[^[\]\n]*\])*)\]\(([^)\n]+)\)(?:[ \t]*\{([^}\n]*)\})?/g;
    let m: RegExpExecArray | null;
    while ((m = figScanRe.exec(normMd)) !== null) {
      const imgPath = m[2].trim().replace(/\\/g, '/').replace(/^\.\//, '');
      const attrs = m[3] || '';
      const lblMatch = /#(fig:[a-zA-Z0-9_.-]+)/.exec(attrs);
      if (lblMatch) embeddedFigureLabels.add(lblMatch[1].toLowerCase());
      embeddedFigureLabels.add(figureLabelFromFileName(imgPath).toLowerCase());
      const rawStem = (imgPath.split('/').pop() || '').replace(/\.[^.]+$/, '').toLowerCase();
      if (rawStem) embeddedFigureLabels.add(`fig:${rawStem}`);
      embeddedFigureLabels.add(imgPath.toLowerCase());
    }
  }

  const emittedAutoFigures = new Set<string>();
  const relocatedAbstractFigures: string[] = [];

  const transpileOpts = {
    citationDialect: manifest.citationDialect,
    citationCommandOverride: opts.citationCommandOverride,
    useCleveref: manifest.hasCleveref,
    useBooktabs: true,
    stripTopH1: true,
    projectFigures: opts.projectFigures,
    embeddedFigureLabels,
    emittedAutoFigures,
  };

  let usesFigures = false;
  let usesTables = false;
  let usesMath = false;
  const allCitedKeys = new Set<string>();

  const transpileSection = (sec: PaperSection): string => {
    const md = sectionContents[sec.id] ?? '';
    const res = markdownToLatex(md, {
      ...transpileOpts,
      sectionTitle: sec.title,
      sectionRole: sec.role,
    });
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
      bibBase,
      relocatedAbstractFigures
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
      .map((sec, idx) => {
        const body = transpileSection(sec);
        const cmd = sec.starred ? '\\section*' : '\\section';
        const relocated =
          idx === 0 && relocatedAbstractFigures.length > 0
            ? `${relocatedAbstractFigures.splice(0, relocatedAbstractFigures.length).join('\n\n')}\n\n`
            : '';
        return `\n${cmd}{${escapeLatexText(sec.title)}}\n\n${relocated}${body}\n`;
      })
      .join('\n');

    const insertAt =
      lastBodySectionSlotEnd ?? bibSlotStart ?? manifest.documentEndOffset;
    edits.push({ start: insertAt, end: insertAt, replacement: extraLatex });
  } else if (relocatedAbstractFigures.length > 0) {
    const insertAt =
      lastBodySectionSlotEnd ?? bibSlotStart ?? manifest.documentEndOffset;
    edits.push({
      start: insertAt,
      end: insertAt,
      replacement: `\n${relocatedAbstractFigures.splice(0, relocatedAbstractFigures.length).join('\n\n')}\n`,
    });
  }

  // Auto-inject required packages & \graphicspath into preamble if used by the paper
  const injectedPackages: string[] = [];
  if (usesFigures && !manifest.hasGraphicx) injectedPackages.push('graphicx');
  if (usesTables && !manifest.hasBooktabs) injectedPackages.push('booktabs');
  if (usesMath && !manifest.hasAmsmath) injectedPackages.push('amsmath');

  const needsGraphicsPath =
    usesFigures && !/\\graphicspath\s*\{/.test(manifest.rawSource);

  if ((injectedPackages.length > 0 || needsGraphicsPath) && manifest.preambleEndOffset > 0) {
    const preambleLines = [
      ...injectedPackages.map((p) => `\\usepackage{${p}}`),
      ...(needsGraphicsPath ? ['\\graphicspath{{figures/}{figure/}{./}}'] : []),
    ];
    const pkgBlock =
      `\n% Added automatically by MirTex for paper elements\n` +
      preambleLines.join('\n') +
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

  // Synchronize LaTeX bibliography style & natbib / sn-jnl options with the selected citationStyle
  if (opts.citationStyle) {
    output = applyCitationStyleToLatex(output, manifest, opts.citationStyle);
  }

  return {
    texSource: output,
    citedKeys: Array.from(allCitedKeys),
    mappedSlots,
    unmappedSections,
    injectedPackages,
  };
}

function applyCitationStyleToLatex(
  texSource: string,
  manifest: TemplateManifest,
  style: CitationStyle
): string {
  let out = texSource;

  // 1. Springer Nature sn-jnl controls citation style via \documentclass[...,sn-...]{sn-jnl}
  if (manifest.detectedAdapter === 'sn-jnl') {
    const snOpt =
      style === 'apa'
        ? 'sn-apa'
        : style === 'vancouver'
          ? 'sn-vancouver'
          : 'sn-mathphys-num';
    out = out.replace(
      /(\\documentclass\[[^\]]*?)\bsn-(?:mathphys-num|mathphys-ay|apa|vancouver|basic|chicago|aps|nature)\b([^\]]*\]\{sn-jnl\})/,
      `$1${snOpt}$2`
    );
    return out;
  }

  // 2. natbib-based templates (e.g. Springer Nature Ready-to-Compile, Standard IMRaD, article + natbib)
  if (manifest.packages.includes('natbib')) {
    const natbibSpec: Record<CitationStyle, { opts: string; bst: string }> = {
      apa: { opts: 'authoryear,round', bst: 'apalike' },
      nature: { opts: 'numbers,square,sort&compress', bst: 'unsrtnat' },
      ieee: { opts: 'numbers,square,sort&compress', bst: 'IEEEtran' },
      vancouver: { opts: 'numbers,round,sort&compress', bst: 'vancouver' },
    };
    const spec = natbibSpec[style];
    out = out.replace(
      /\\usepackage(?:\[[^\]]*\])?\{natbib\}/,
      `\\usepackage[${spec.opts}]{natbib}`
    );
    if (/\\bibliographystyle\{[^}]*\}/.test(out)) {
      out = out.replace(
        /\\bibliographystyle\{[^}]*\}/,
        `\\bibliographystyle{${spec.bst}}`
      );
    }
  }

  return out;
}

function buildSlotReplacement(
  slot: ExtractedSlot,
  manifest: TemplateManifest,
  fm: PaperFrontMatter,
  sections: PaperSection[],
  mappedSlots: Record<string, string>,
  transpileSection: (sec: PaperSection) => string,
  bibBase: string,
  relocatedAbstractFigures: string[]
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
      const rawBody = sec ? transpileSection(sec) : '';
      const cleanBody = rawBody
        .replace(/\\begin\{figure\*?\}[\s\S]*?\\end\{figure\*?\}/g, (figBlock) => {
          relocatedAbstractFigures.push(figBlock.trim());
          return '';
        })
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      return renderAbstractSlot(cleanBody, slot);
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
      const relocated =
        relocatedAbstractFigures.length > 0
          ? `${relocatedAbstractFigures.splice(0, relocatedAbstractFigures.length).join('\n\n')}\n\n`
          : '';
      const cmd = slot.starred || sec.starred ? '\\section*' : '\\section';
      const lbl = slot.latexLabel ? `\\label{${slot.latexLabel}}` : '';
      return `${cmd}{${escapeLatexText(sec.title)}}${lbl}\n\n${relocated}${body}\n\n`;
    }
    default:
      return null;
  }
}
