import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Math as DocxMath,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalAlignTable,
  WidthType,
  type IBorderOptions,
  type IRunOptions,
  type ParagraphChild,
} from 'docx';
import { latexToMath } from 'docx/math';
import { marked, type Token, type Tokens } from 'marked';
import type { BibEntry, CitationStyle } from '../types/citation';
import type { PaperFrontMatter, PaperSection, ProjectFigureFile } from '../types/paper';
import { extractCitedKeysFromMarkdown } from '../citations/bibtex';
import { buildBibliographyOrder, formatInlineCitation } from '../citations/cslFormatter';
import {
  cleanFigureCaption,
  findFolderFigure,
  splitInlineFiguresOntoOwnLines,
} from '../latex/markdownToLatex';
import { sanitizeLatexMath } from '../latex/unicodeToLatex';
import {
  decodeBasicHtmlEntities,
  normalizeAcademicMarkdown,
} from '../utils/normalizeAcademicMarkdown';
import { figureLabelFromFileName, indexPaperElements, type IndexedElement } from '../utils/paperOutline';
import {
  computeFigureDisplaySize,
  resolveFigureImage,
  type ResolvedDocxImage,
} from './docxImageUtils';

export interface BuildAcademicDocxParams {
  frontMatter: PaperFrontMatter;
  sections: PaperSection[];
  sectionContents: Record<string, string>;
  bibEntries: BibEntry[];
  citationStyle: CitationStyle;
  imageDataUrls?: Record<string, string>;
  projectFigures?: ProjectFigureFile[];
  projectPath?: string;
}

const BODY_FONT = 'Georgia';
const CODE_FONT = 'Consolas';

const COLOR_HEADING = '16213E';
const COLOR_SUBHEADING = '2D3748';
const COLOR_BODY = '1A1A2E';
const COLOR_MUTED = '5A6270';
const COLOR_CAPTION = '4B5563';
const COLOR_BORDER = 'D0D5DD';
const COLOR_RULE = '1A1A2E';
const COLOR_ACCENT = '1E3F70';
const COLOR_MISSING = 'B91C1C';
const COLOR_CODE_BG = 'F3F4F6';
const COLOR_QUOTE_BG = 'F8FAFC';
const COLOR_QUOTE_BORDER = '9CA3AF';
const COLOR_HEADER_BG = 'F8FAFC';

const NONE_BORDER: IBorderOptions = { style: BorderStyle.NONE, size: 0 };

type StashedBlock =
  | { kind: 'raw_latex'; text: string }
  | { kind: 'code_block'; lang: string; text: string }
  | { kind: 'display_math'; tex: string; eqNumber: number; label?: string }
  | { kind: 'figure'; src: string; captionMd: string; figNumber: number; widthFraction: number; refKeys: string[] }
  | { kind: 'table_caption'; displayNum: string; captionMd: string };

type StashedInline =
  | { kind: 'inline_code'; text: string }
  | { kind: 'inline_math'; tex: string }
  | { kind: 'citation'; text: string; isMissing: boolean }
  | { kind: 'xref'; label: string };

interface InlineStyle {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  underline?: boolean;
  superScript?: boolean;
  subScript?: boolean;
  code?: boolean;
  size?: number;
  color?: string;
  font?: string;
}

const UNICODE_FALLBACK_MAP: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ϵ',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'ϑ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
  pm: '±',
  mp: '∓',
  times: '×',
  div: '÷',
  cdot: '·',
  leq: '≤',
  le: '≤',
  geq: '≥',
  ge: '≥',
  neq: '≠',
  ne: '≠',
  approx: '≈',
  equiv: '≡',
  sim: '∼',
  simeq: '≃',
  cong: '≅',
  propto: '∝',
  ll: '≪',
  gg: '≫',
  infty: '∞',
  partial: '∂',
  nabla: '∇',
  sum: '∑',
  prod: '∏',
  int: '∫',
  surd: '√',
  sqrt: '√',
  in: '∈',
  notin: '∉',
  subset: '⊂',
  subseteq: '⊆',
  supset: '⊃',
  supseteq: '⊇',
  cup: '∪',
  cap: '∩',
  forall: '∀',
  exists: '∃',
  emptyset: '∅',
  neg: '¬',
  wedge: '∧',
  vee: '∨',
  perp: '⊥',
  parallel: '∥',
  angle: '∠',
  circ: '°',
  rightarrow: '→',
  to: '→',
  leftarrow: '←',
  leftrightarrow: '↔',
  Rightarrow: '⇒',
  Leftarrow: '⇐',
  Leftrightarrow: '⇔',
  uparrow: '↑',
  downarrow: '↓',
  mapsto: '↦',
  star: '★',
  dagger: '†',
  ddagger: '‡',
  ldots: '…',
  cdots: '⋯',
};

function decodeRichEntities(text: string): string {
  return decodeBasicHtmlEntities(text)
    .replace(/&nbsp;/gi, '\u00A0')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&hellip;/gi, '…')
    .replace(/&lsquo;/gi, '‘')
    .replace(/&rsquo;/gi, '’')
    .replace(/&ldquo;/gi, '“')
    .replace(/&rdquo;/gi, '”')
    .replace(/&times;/gi, '×')
    .replace(/&plusmn;/gi, '±')
    .replace(/&le;/gi, '≤')
    .replace(/&ge;/gi, '≥')
    .replace(/&ne;/gi, '≠');
}

function prepareLatexForDocxMath(rawTex: string, displayMode: boolean): string {
  const sanitized = sanitizeLatexMath(rawTex.trim(), displayMode);
  return sanitized.replace(
    /\\(text|mathrm|textrm|textbf|textit|mathsf)\{([^{}]*)\}/g,
    (_m, cmd: string, inner: string) =>
      `\\${cmd}{${inner.replace(/---/g, '—').replace(/--/g, '–')}}`
  );
}

function latexToUnicodeFallback(rawTex: string): string {
  return rawTex
    .replace(/\\(text|mathrm|textrm|textbf|textit|mathsf|mathbf|mathit|mathcal|mathbb|operatorname)\*?\{([^{}]*)\}/g, '$2')
    .replace(/\\(hat|bar|tilde|vec|dot|ddot|overline|underline)\{([^{}]*)\}/g, '$2')
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
    .replace(/\\%/g, '%')
    .replace(/\\_/g, '_')
    .replace(/\\&/g, '&')
    .replace(/\\([,;:])/g, ' ')
    .replace(/\\quad|\\qquad/g, ' ')
    .replace(/\\\\/g, '; ')
    .replace(/\\([a-zA-Z]+)/g, (_m, cmd: string) => UNICODE_FALLBACK_MAP[cmd] ?? cmd)
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildDocxMathNodes(
  rawTex: string,
  displayMode: boolean,
  baseStyle: InlineStyle
): ParagraphChild[] {
  const prepared = prepareLatexForDocxMath(rawTex, displayMode);
  if (!prepared) return [];

  try {
    const components = latexToMath(prepared);
    if (components.length > 0) {
      return [new DocxMath({ children: [...components] })];
    }
  } catch {
    // Fall through to clean Unicode text rendering on unsupported LaTeX macros
  }

  const fallbackText = latexToUnicodeFallback(prepared) || rawTex.trim();
  return [
    new TextRun({
      text: fallbackText,
      font: baseStyle.font ?? BODY_FONT,
      size: baseStyle.size ?? 22,
      color: baseStyle.color ?? COLOR_BODY,
      italics: true,
    }),
  ];
}

function parseWidthFraction(attrs: string): number {
  const m = /width=([0-9.]+)/.exec(attrs);
  if (!m) return 0.85;
  const val = Number(m[1]);
  return Number.isFinite(val) ? Math.min(1.0, Math.max(0.15, val)) : 0.85;
}

function isSafeExternalUrl(href: string): boolean {
  const lower = href.trim().toLowerCase();
  return lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('mailto:');
}

function mapTableAlignment(align: 'center' | 'left' | 'right' | null | undefined) {
  if (align === 'center') return AlignmentType.CENTER;
  if (align === 'right') return AlignmentType.RIGHT;
  return AlignmentType.LEFT;
}

function makeTextRun(text: string, style: InlineStyle): TextRun {
  const opts: IRunOptions = {
    text,
    font: style.code ? CODE_FONT : (style.font ?? BODY_FONT),
    size: style.code ? Math.max(16, (style.size ?? 22) - 2) : (style.size ?? 22),
    color: style.color ?? COLOR_BODY,
    ...(style.bold ? { bold: true } : {}),
    ...(style.italics ? { italics: true } : {}),
    ...(style.strike ? { strike: true } : {}),
    ...(style.underline ? { underline: { type: UnderlineType.SINGLE } } : {}),
    ...(style.superScript ? { superScript: true } : {}),
    ...(style.subScript ? { subScript: true } : {}),
    ...(style.code ? { shading: { type: ShadingType.CLEAR, fill: COLOR_CODE_BG } } : {}),
  };
  return new TextRun(opts);
}

/**
 * Exports the manuscript as an Academic Microsoft Word (.docx) document styled
 * to match MirTex's Inside App Preview: Title/Author/Affiliation/Keyword header,
 * Georgia typography, formatted headings, inline & display OMML equations,
 * embedded figures with captions, booktabs tables, lists, blockquotes,
 * resolved citations, cross-references, and a hanging-indent References section.
 */
export async function buildAcademicDocx(params: BuildAcademicDocxParams): Promise<Blob> {
  const {
    frontMatter,
    sections,
    sectionContents,
    bibEntries,
    citationStyle,
    imageDataUrls = {},
    projectFigures = [],
    projectPath,
  } = params;

  const sectionInputs = sections.map((s) => ({
    id: s.id,
    title: s.title,
    markdown: sectionContents[s.id] ?? '',
  }));

  // 1. Global citation order & cross-reference indexing (mirrors academicMarkdown.ts)
  const stripCodeForScan = (md: string): string =>
    md
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/``[^`\n]+?``|`[^`\n]+`/g, ' ');

  const allCitedKeys: string[] = [];
  const embeddedFigureLabels = new Set<string>();
  for (const s of sectionInputs) {
    allCitedKeys.push(...extractCitedKeysFromMarkdown(stripCodeForScan(s.markdown)));
    const normMd = normalizeAcademicMarkdown(stripCodeForScan(s.markdown));
    const figScanRe =
      /!\[((?:[^[\]\n]|\[[^[\]\n]*\])*)\]\(([^)\n]+)\)(?:[ \t]*\{([^}\n]*)\})?/g;
    let fm: RegExpExecArray | null;
    while ((fm = figScanRe.exec(normMd)) !== null) {
      const imgPath = fm[2].trim().replace(/\\/g, '/').replace(/^\.\//, '');
      const attrs = fm[3] || '';
      const lblMatch = /#(fig:[a-zA-Z0-9_.-]+)/.exec(attrs);
      if (lblMatch) embeddedFigureLabels.add(lblMatch[1].toLowerCase());
      embeddedFigureLabels.add(figureLabelFromFileName(imgPath).toLowerCase());
      const rawStem = (imgPath.split('/').pop() || '').replace(/\.[^.]+$/, '').toLowerCase();
      if (rawStem) embeddedFigureLabels.add(`fig:${rawStem}`);
      embeddedFigureLabels.add(imgPath.toLowerCase());
    }
  }

  const bib = buildBibliographyOrder(allCitedKeys, bibEntries, citationStyle);
  const elements = indexPaperElements(sectionInputs, projectFigures);
  const labelMap = new Map<string, IndexedElement>();
  for (const el of elements) {
    labelMap.set(el.label, el);
    const lower = el.label.toLowerCase();
    if (!labelMap.has(lower)) labelMap.set(lower, el);
  }

  const emittedAutoFigures = new Set<string>();
  const renderedFigNums = new Map<string, number>();
  const renderedEqNums = new Map<string, number>();

  let figCounter = 0;
  let tblCounter = 0;
  let eqCounter = 0;

  interface PreparedSection {
    blockTokens: StashedBlock[];
    inlineTokens: StashedInline[];
    tokens: Token[];
  }

  const preparedSections: PreparedSection[] = [];

  const resolveCrossRef = (label: string): { text: string; isMissing: boolean } => {
    const normFigLbl = label.startsWith('fig:')
      ? figureLabelFromFileName(label.slice(4)).toLowerCase()
      : '';
    let el =
      labelMap.get(label) ??
      labelMap.get(label.toLowerCase()) ??
      (normFigLbl ? labelMap.get(normFigLbl) : undefined);
    if (!el && label.startsWith('fig:') && projectFigures.length > 0) {
      const fig = findFolderFigure(label, projectFigures);
      if (fig) el = labelMap.get(fig.label) ?? labelMap.get(fig.label.toLowerCase());
    }
    if (!el) {
      const eqNum = renderedEqNums.get(label) ?? renderedEqNums.get(label.toLowerCase());
      if (eqNum !== undefined) return { text: `Eq. (${eqNum})`, isMissing: false };
      return { text: `@${label}`, isMissing: true };
    }
    const num =
      el.kind === 'figure'
        ? (renderedFigNums.get(label) ??
          renderedFigNums.get(label.toLowerCase()) ??
          (normFigLbl ? renderedFigNums.get(normFigLbl) : undefined) ??
          renderedFigNums.get(el.label) ??
          renderedFigNums.get(el.label.toLowerCase()) ??
          el.number)
        : el.kind === 'equation'
          ? (renderedEqNums.get(label) ?? renderedEqNums.get(label.toLowerCase()) ?? el.number)
          : el.number;
    const text =
      el.kind === 'figure'
        ? `Figure ${num}`
        : el.kind === 'table'
          ? `Table ${num}`
          : el.kind === 'equation'
            ? `Eq. (${num})`
            : `Section ${num}`;
    return { text, isMissing: false };
  };

  // Pass 1: Preprocess all sections so global figure numbers are finalized before rendering xrefs
  for (const sec of sectionInputs) {
    if (!sec.markdown.trim()) continue;

    const blockTokens: StashedBlock[] = [];
    const inlineTokens: StashedInline[] = [];

    const stashBlock = (blk: StashedBlock, wrapWithBlankLines = true): string => {
      const idx = blockTokens.length;
      blockTokens.push(blk);
      return wrapWithBlankLines ? `\n\nMIRTEXBLK${idx}END\n\n` : `MIRTEXBLK${idx}END`;
    };

    const stashInline = (inl: StashedInline): string => {
      const idx = inlineTokens.length;
      inlineTokens.push(inl);
      return `MIRTEXINL${idx}END`;
    };

    const resolveInlinePlainText = (text: string): string => {
      let out = text;
      for (let pass = 0; pass < 10 && out.includes('MIRTEXINL'); pass++) {
        const next = out.replace(/MIRTEXINL(\d+)END/g, (_m, idxStr: string) => {
          const item = inlineTokens[Number(idxStr)];
          if (!item) return '';
          if (item.kind === 'inline_code') return item.text;
          if (item.kind === 'inline_math') return latexToUnicodeFallback(item.tex) || item.tex;
          if (item.kind === 'citation') return item.text;
          return resolveCrossRef(item.label).text;
        });
        if (next === out) break;
        out = next;
      }
      return out;
    };

    const replaceInlineCitationsAndRefs = (text: string): string => {
      let out = text;
      // Bracketed citations [@a; @b]
      out = out.replace(/\[([^[\]\n]*@[a-zA-Z0-9_.:-]+[^[\]\n]*)\]/g, (_m, inner: string) => {
        const keys: string[] = [];
        const keyRe = /@([a-zA-Z0-9_.:-]+)/g;
        let km: RegExpExecArray | null;
        while ((km = keyRe.exec(inner)) !== null) {
          if (!/^(?:fig|tbl|eq|sec):/.test(km[1])) keys.push(km[1]);
        }
        if (keys.length === 0) return _m;
        const formatted = formatInlineCitation(keys, bibEntries, citationStyle, bib.numberMap, false);
        const isMissing = keys.some((k) => !bibEntries.some((e) => e.key === k));
        return stashInline({ kind: 'citation', text: formatted, isMissing });
      });
      // Cross-references @fig:foo, @tbl:bar, @eq:baz, @sec:intro
      out = out.replace(
        /(?<![a-zA-Z0-9_])@((?:fig|tbl|eq|sec):[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)/g,
        (_m, label: string) => stashInline({ kind: 'xref', label })
      );
      // Narrative citations @smith2024
      out = out.replace(/(?<![a-zA-Z0-9_.+-])@([a-zA-Z][a-zA-Z0-9_:-]{2,})/g, (_m, key: string) => {
        const formatted = formatInlineCitation([key], bibEntries, citationStyle, bib.numberMap, true);
        const isMissing = !bibEntries.some((e) => e.key === key);
        return stashInline({ kind: 'citation', text: formatted, isMissing });
      });
      return out;
    };

    let md = splitInlineFiguresOntoOwnLines(normalizeAcademicMarkdown(sec.markdown));

    // 1. Raw LaTeX fenced blocks
    md = md.replace(/```(?:latex-raw|tex-raw|raw-latex)[ \t]*\n([\s\S]*?)```/gi, (_m, raw: string) =>
      stashBlock({ kind: 'raw_latex', text: raw.replace(/\n$/, '') })
    );

    // 2. Standard fenced code blocks (protects code from math/citation/figure matching)
    md = md.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_m, lang: string, code: string) =>
      stashBlock({ kind: 'code_block', lang: lang.trim(), text: code.replace(/\n$/, '') })
    );

    // 3. Inline code spans (protects e.g. `[@key]` or `$x$` from citation/math matching)
    md = md.replace(/``([^`\n]+?)``|`([^`\n]+)`/g, (_m, dbl?: string, sgl?: string) =>
      stashInline({ kind: 'inline_code', text: dbl ?? sgl ?? '' })
    );

    // 4. Display Math $$ ... $$ {#eq:label}
    md = md.replace(/\$\$([\s\S]*?)\$\$(?:\s*\{#(eq:[^}\s]+)\})?/g, (_m, tex: string, label?: string) => {
      return stashBlock({ kind: 'display_math', tex: tex.trim(), eqNumber: 0, label });
    });

    // 5. Inline Math $ ... $
    md = md.replace(/(?<!\\)\$(?!\$)([^$\n]+?)(?<!\\)\$/g, (_m, tex: string) =>
      stashInline({ kind: 'inline_math', tex: tex.trim() })
    );

    // 6. Explicit Figures ![Caption](path){#fig:id width=0.8} (with optional following Caption:/Figure: line)
    md = md.replace(
      /^!\[((?:[^[\]\n]|\[[^[\]\n]*\])*)\]\(([^)\n]+)\)(?:[ \t]*\{([^}\n]*)\})?(?:\n(?:[ \t]*\n)?(?:Caption|Figure):[ \t]*(.+?))?[ \t]*$/gim,
      (_m, caption: string, srcPath: string, attrs = '', nextCap?: string) => {
        const cleanSrc = srcPath.trim().replace(/\\/g, '/').replace(/^\.\//, '');
        const refKeys: string[] = [cleanSrc.toLowerCase()];
        const lblMatch = /#(fig:[a-zA-Z0-9_.-]+)/.exec(attrs);
        if (lblMatch) {
          refKeys.push(lblMatch[1], lblMatch[1].toLowerCase());
        }
        const derivedLbl = figureLabelFromFileName(cleanSrc);
        refKeys.push(derivedLbl, derivedLbl.toLowerCase());
        const rawStem = (cleanSrc.split('/').pop() || '').replace(/\.[^.]+$/, '');
        if (rawStem) {
          refKeys.push(`fig:${rawStem}`, `fig:${rawStem.toLowerCase()}`);
        }

        const effectiveCaption = nextCap !== undefined ? nextCap : caption;
        const plainCap = cleanFigureCaption(resolveInlinePlainText(effectiveCaption), cleanSrc);
        const captionMd = plainCap ? replaceInlineCitationsAndRefs(effectiveCaption.trim()) : '';

        return stashBlock({
          kind: 'figure',
          src: cleanSrc,
          captionMd,
          figNumber: 0,
          widthFraction: parseWidthFraction(attrs),
          refKeys,
        });
      }
    );

    // 6b. Auto-render referenced folder figures from figures/ or figure/ when not explicitly embedded
    if (projectFigures.length > 0) {
      const tryAutoFigure = (label: string, attrs = '', explicitCaption = ''): string | null => {
        const lblKey = label.toLowerCase();
        const normLblKey = `fig:${figureLabelFromFileName(label.slice(4)).slice(4)}`.toLowerCase();
        if (
          embeddedFigureLabels.has(lblKey) ||
          embeddedFigureLabels.has(normLblKey) ||
          emittedAutoFigures.has(lblKey) ||
          emittedAutoFigures.has(normLblKey)
        ) {
          return null;
        }
        const fig = findFolderFigure(label, projectFigures);
        if (!fig) return null;
        const figLblKey = fig.label.toLowerCase();
        const figPathKey = fig.relPath.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
        if (
          embeddedFigureLabels.has(figLblKey) ||
          embeddedFigureLabels.has(figPathKey) ||
          emittedAutoFigures.has(figPathKey)
        ) {
          return null;
        }
        emittedAutoFigures.add(lblKey);
        emittedAutoFigures.add(normLblKey);
        emittedAutoFigures.add(figLblKey);
        emittedAutoFigures.add(figPathKey);

        const refKeys = [label, lblKey, normLblKey, fig.label, figLblKey, figPathKey];
        const cleanSrc = fig.relPath.replace(/\\/g, '/').replace(/^\.\//, '');
        const plainCap = cleanFigureCaption(resolveInlinePlainText(explicitCaption), cleanSrc);
        const captionMd = plainCap ? replaceInlineCitationsAndRefs(explicitCaption.trim()) : '';
        return stashBlock(
          {
            kind: 'figure',
            src: cleanSrc,
            captionMd,
            figNumber: 0,
            widthFraction: parseWidthFraction(attrs),
            refKeys,
          },
          false
        );
      };

      md = md.replace(
        /^@(fig:[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)(?:[ \t]*\{([^}\n]*)\})?(?:[ \t]*:[ \t]*(.+?)|[ \t]+\[([^[\]\n]+)\])?(?:\n(?:[ \t]*\n)?(?:Caption|Figure):[ \t]*(.+?))?[ \t]*$/gim,
        (
          full,
          label: string,
          attrs = '',
          colonCap?: string,
          bracketCap?: string,
          nextCap?: string
        ) => {
          const cap = nextCap ?? colonCap ?? bracketCap ?? '';
          const blk = tryAutoFigure(label, attrs, cap);
          return blk ? `\n\n${blk}\n\n` : full;
        }
      );

      md = md
        .split(/\n{2,}/)
        .map((block) => {
          const refRe = /(?<![a-zA-Z0-9_])@(fig:[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)/g;
          const extraFigs: string[] = [];
          let rm: RegExpExecArray | null;
          while ((rm = refRe.exec(block)) !== null) {
            const figBlk = tryAutoFigure(rm[1]);
            if (figBlk) extraFigs.push(figBlk);
          }
          return extraFigs.length > 0 ? `${block}\n\n${extraFigs.join('\n\n')}` : block;
        })
        .join('\n\n');
    }

    // 7. Table caption lines (`Table: Caption`, `Table N: Caption`, or `**Table N. Caption**`)
    md = md.replace(
      /^(?:Table(?:\s+(\d+))?:\s*(.+?)(?:\s*\{#([^}\s]+)\})?|\*\*Table(?:\s+(\d+))?[.:]\s*(.+?)\*\*(?:\s*\{#([^}\s]+)\})?)[ \t]*$/gim,
      (_m, n1?: string, cap1?: string, _l1?: string, n2?: string, cap2?: string) => {
        tblCounter++;
        const displayNum = n1 || n2 || String(tblCounter);
        const rawCap = (cap1 ?? cap2 ?? '').trim();
        return stashBlock({
          kind: 'table_caption',
          displayNum,
          captionMd: replaceInlineCitationsAndRefs(rawCap),
        });
      }
    );

    // 8. Inline citations & cross-references across prose/lists/tables
    md = replaceInlineCitationsAndRefs(md);

    // 9. Strip trailing `{#sec:...}` on headings
    md = md.replace(/^(#{1,6}\s+.+?)\s*\{#[^}\s]+\}\s*$/gm, '$1');

    // 9b. Assign final sequential figure & equation numbers in true top-to-bottom document order
    const blkOrderRe = /MIRTEXBLK(\d+)END/g;
    let blkOrdMatch: RegExpExecArray | null;
    while ((blkOrdMatch = blkOrderRe.exec(md)) !== null) {
      const blk = blockTokens[Number(blkOrdMatch[1])];
      if (!blk) continue;
      if (blk.kind === 'figure') {
        figCounter++;
        blk.figNumber = figCounter;
        for (const rk of blk.refKeys) {
          renderedFigNums.set(rk, figCounter);
          renderedFigNums.set(rk.toLowerCase(), figCounter);
        }
      } else if (blk.kind === 'display_math') {
        eqCounter++;
        blk.eqNumber = eqCounter;
        if (blk.label) {
          renderedEqNums.set(blk.label, eqCounter);
          renderedEqNums.set(blk.label.toLowerCase(), eqCounter);
        }
      }
    }

    // 10. Clean excess blank lines and tokenize with marked
    const tokens = marked.lexer(md.replace(/\n{3,}/g, '\n\n'), { gfm: true, breaks: false });
    preparedSections.push({ blockTokens, inlineTokens, tokens });
  }

  // Image resolution cache (memoized across the document)
  const imageCache = new Map<string, Promise<ResolvedDocxImage | null>>();
  const getOrResolveImage = (src: string): Promise<ResolvedDocxImage | null> => {
    const key = src.trim();
    const existing = imageCache.get(key);
    if (existing) return existing;
    const p = resolveFigureImage(key, { imageDataUrls, projectFigures, projectPath });
    imageCache.set(key, p);
    return p;
  };

  const docChildren: (Paragraph | Table)[] = [];

  // 2. Front Matter Block (matches .academic-frontmatter in Preview.css)
  const affilIndex = new Map<string, number>();
  frontMatter.affiliations.forEach((a, idx) => affilIndex.set(a.id, idx + 1));

  const validAuthors = frontMatter.authors.filter((a) => `${a.firstName} ${a.lastName}`.trim().length > 0);
  const validAffils = frontMatter.affiliations
    .map((aff, idx) => ({
      num: idx + 1,
      line: [aff.department, aff.institution, aff.city, aff.country].filter(Boolean).join(', '),
    }))
    .filter((a) => a.line.length > 0);
  const hasKeywords = frontMatter.keywords.length > 0;
  const hasSubtitle = Boolean(frontMatter.subtitle?.trim());

  const fmLastSection: 'title' | 'subtitle' | 'authors' | 'affils' | 'keywords' = hasKeywords
    ? 'keywords'
    : validAffils.length > 0
      ? 'affils'
      : validAuthors.length > 0
        ? 'authors'
        : hasSubtitle
          ? 'subtitle'
          : 'title';

  const fmDividerBorder = {
    bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_BORDER, space: 12 },
  };

  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: fmLastSection === 'title' ? 280 : 140 },
      ...(fmLastSection === 'title' ? { border: fmDividerBorder } : {}),
      children: [
        new TextRun({
          text: frontMatter.title || 'Untitled Manuscript',
          bold: true,
          size: 38,
          font: BODY_FONT,
          color: COLOR_HEADING,
        }),
      ],
    })
  );

  if (hasSubtitle) {
    docChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: fmLastSection === 'subtitle' ? 280 : 120 },
        ...(fmLastSection === 'subtitle' ? { border: fmDividerBorder } : {}),
        children: [
          new TextRun({
            text: frontMatter.subtitle!.trim(),
            italics: true,
            size: 24,
            font: BODY_FONT,
            color: COLOR_MUTED,
          }),
        ],
      })
    );
  }

  if (validAuthors.length > 0) {
    const authorRuns: TextRun[] = [];
    validAuthors.forEach((a, idx) => {
      if (idx > 0) {
        authorRuns.push(
          new TextRun({ text: ', ', size: 22, font: BODY_FONT, color: COLOR_BODY })
        );
      }
      authorRuns.push(
        new TextRun({
          text: `${a.firstName} ${a.lastName}`.trim(),
          size: 22,
          font: BODY_FONT,
          color: COLOR_BODY,
        })
      );
      const nums = a.affiliationIds
        .map((id) => affilIndex.get(id))
        .filter((n): n is number => n !== undefined)
        .join(',');
      const supText = `${nums}${a.corresponding ? '*' : ''}`;
      if (supText) {
        authorRuns.push(
          new TextRun({
            text: supText,
            superScript: true,
            size: 22,
            font: BODY_FONT,
            color: COLOR_BODY,
          })
        );
      }
    });
    docChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: fmLastSection === 'authors' ? 280 : 100 },
        ...(fmLastSection === 'authors' ? { border: fmDividerBorder } : {}),
        children: authorRuns,
      })
    );
  }

  validAffils.forEach((aff, idx) => {
    const isLast = idx === validAffils.length - 1 && fmLastSection === 'affils';
    docChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: isLast ? 280 : 50 },
        ...(isLast ? { border: fmDividerBorder } : {}),
        children: [
          new TextRun({
            text: String(aff.num),
            superScript: true,
            size: 19,
            font: BODY_FONT,
            color: COLOR_MUTED,
          }),
          new TextRun({
            text: ` ${aff.line}`,
            size: 19,
            font: BODY_FONT,
            color: COLOR_MUTED,
          }),
        ],
      })
    );
  });

  if (hasKeywords) {
    docChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 100, after: 280 },
        border: fmDividerBorder,
        children: [
          new TextRun({
            text: 'Keywords: ',
            bold: true,
            size: 19,
            font: BODY_FONT,
            color: COLOR_MUTED,
          }),
          new TextRun({
            text: frontMatter.keywords.join(' · '),
            size: 19,
            font: BODY_FONT,
            color: COLOR_MUTED,
          }),
        ],
      })
    );
  }

  // 3. Pass 2: Render each section AST into native docx elements
  let orderedListCounter = 0;

  for (const sec of preparedSections) {
    const { blockTokens, inlineTokens, tokens } = sec;

    const resolvePlainTextPass2 = (text: string): string => {
      let out = text;
      for (let pass = 0; pass < 10 && out.includes('MIRTEXINL'); pass++) {
        const next = out.replace(/MIRTEXINL(\d+)END/g, (_m, idxStr: string) => {
          const item = inlineTokens[Number(idxStr)];
          if (!item) return '';
          if (item.kind === 'inline_code') return item.text;
          if (item.kind === 'inline_math') return latexToUnicodeFallback(item.tex) || item.tex;
          if (item.kind === 'citation') return item.text;
          return resolveCrossRef(item.label).text;
        });
        if (next === out) break;
        out = next;
      }
      return decodeRichEntities(out).replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
    };

    const emitPlainProseWithScripts = (
      text: string,
      style: InlineStyle,
      out: ParagraphChild[]
    ): void => {
      // Split inline superscript ^x^ and subscript ~x~
      const scriptRe = /(\^[^\s^]+?\^|(?<!~)~[^\s~]+?~(?!~))/g;
      let lastIdx = 0;
      let m: RegExpExecArray | null;
      while ((m = scriptRe.exec(text)) !== null) {
        if (m.index > lastIdx) {
          out.push(makeTextRun(text.slice(lastIdx, m.index), style));
        }
        const tok = m[1];
        if (tok.startsWith('^') && tok.endsWith('^')) {
          out.push(makeTextRun(tok.slice(1, -1), { ...style, superScript: true }));
        } else {
          out.push(makeTextRun(tok.slice(1, -1), { ...style, subScript: true }));
        }
        lastIdx = m.index + tok.length;
      }
      if (lastIdx < text.length) {
        out.push(makeTextRun(text.slice(lastIdx), style));
      }
    };

    const emitLeafText = (rawText: string, style: InlineStyle, out: ParagraphChild[]): void => {
      const decoded = decodeRichEntities(rawText);
      const parts = decoded.split(/(MIRTEXINL\d+END)/g);
      for (const part of parts) {
        if (!part) continue;
        const inlMatch = /^MIRTEXINL(\d+)END$/.exec(part);
        if (inlMatch) {
          const item = inlineTokens[Number(inlMatch[1])];
          if (!item) continue;
          if (item.kind === 'inline_code') {
            out.push(makeTextRun(item.text, { ...style, code: true }));
          } else if (item.kind === 'inline_math') {
            out.push(...buildDocxMathNodes(item.tex, false, style));
          } else if (item.kind === 'citation') {
            out.push(
              makeTextRun(item.text, {
                ...style,
                color: item.isMissing ? COLOR_MISSING : COLOR_ACCENT,
              })
            );
          } else {
            const xref = resolveCrossRef(item.label);
            out.push(
              makeTextRun(xref.text, {
                ...style,
                color: xref.isMissing ? COLOR_MISSING : COLOR_ACCENT,
              })
            );
          }
        } else {
          emitPlainProseWithScripts(part, style, out);
        }
      }
    };

    const renderInlineTokens = async (
      inTokens: Token[],
      initialStyle: InlineStyle
    ): Promise<ParagraphChild[]> => {
      const out: ParagraphChild[] = [];
      const styleStack: InlineStyle[] = [{ ...initialStyle }];
      const curStyle = (): InlineStyle => styleStack[styleStack.length - 1];

      const pushTagStyle = (patch: Partial<InlineStyle>) => {
        styleStack.push({ ...curStyle(), ...patch });
      };
      const popTagStyle = () => {
        if (styleStack.length > 1) styleStack.pop();
      };

      for (const tok of inTokens) {
        switch (tok.type) {
          case 'strong': {
            const t = tok as Tokens.Strong;
            out.push(...(await renderInlineTokens(t.tokens, { ...curStyle(), bold: true })));
            break;
          }
          case 'em': {
            const t = tok as Tokens.Em;
            out.push(...(await renderInlineTokens(t.tokens, { ...curStyle(), italics: true })));
            break;
          }
          case 'del': {
            const t = tok as Tokens.Del;
            const isSingleTildeSub =
              t.raw.startsWith('~') && !t.raw.startsWith('~~') && !/\s/.test(t.text);
            out.push(
              ...(await renderInlineTokens(
                t.tokens,
                isSingleTildeSub
                  ? { ...curStyle(), subScript: true }
                  : { ...curStyle(), strike: true }
              ))
            );
            break;
          }
          case 'codespan': {
            const t = tok as Tokens.Codespan;
            out.push(makeTextRun(decodeRichEntities(t.text), { ...curStyle(), code: true }));
            break;
          }
          case 'br': {
            out.push(new TextRun({ break: 1 }));
            break;
          }
          case 'escape': {
            const t = tok as Tokens.Escape;
            out.push(makeTextRun(t.text, curStyle()));
            break;
          }
          case 'link': {
            const t = tok as Tokens.Link;
            const linkStyle: InlineStyle = {
              ...curStyle(),
              color: COLOR_ACCENT,
              underline: true,
            };
            const children =
              t.tokens && t.tokens.length > 0
                ? await renderInlineTokens(t.tokens, linkStyle)
                : [makeTextRun(decodeRichEntities(t.text), linkStyle)];
            if (isSafeExternalUrl(t.href)) {
              out.push(new ExternalHyperlink({ link: t.href.trim(), children }));
            } else {
              out.push(...children);
            }
            break;
          }
          case 'image': {
            const t = tok as Tokens.Image;
            const cleanSrc = t.href.trim().replace(/\\/g, '/').replace(/^\.\//, '');
            const resolved = await getOrResolveImage(cleanSrc);
            if (resolved) {
              const dims = computeFigureDisplaySize(
                resolved.width,
                resolved.height,
                0.85,
                resolved.kind === 'svg'
              );
              const altText = resolvePlainTextPass2(t.text || 'Figure');
              out.push(
                resolved.kind === 'svg'
                  ? new ImageRun({
                      type: 'svg',
                      data: resolved.data,
                      fallback: { type: 'png', data: resolved.fallbackPng },
                      transformation: dims,
                      altText: { name: altText, title: altText, description: altText },
                    })
                  : new ImageRun({
                      type: resolved.type,
                      data: resolved.data,
                      transformation: dims,
                      altText: { name: altText, title: altText, description: altText },
                    })
              );
            } else if (t.text) {
              emitLeafText(t.text, curStyle(), out);
            }
            break;
          }
          case 'html': {
            const rawTag = (tok as Tokens.HTML | Tokens.Tag).raw.trim();
            const lower = rawTag.toLowerCase();
            if (/^<br\s*\/?>$/i.test(lower)) {
              out.push(new TextRun({ break: 1 }));
            } else if (/^<(u|ins)\b[^>]*>$/i.test(lower)) {
              pushTagStyle({ underline: true });
            } else if (/^<\/(u|ins)>$/i.test(lower)) {
              popTagStyle();
            } else if (/^<sup\b[^>]*>$/i.test(lower)) {
              pushTagStyle({ superScript: true });
            } else if (/^<\/sup>$/i.test(lower)) {
              popTagStyle();
            } else if (/^<sub\b[^>]*>$/i.test(lower)) {
              pushTagStyle({ subScript: true });
            } else if (/^<\/sub>$/i.test(lower)) {
              popTagStyle();
            } else if (/^<(b|strong)\b[^>]*>$/i.test(lower)) {
              pushTagStyle({ bold: true });
            } else if (/^<\/(b|strong)>$/i.test(lower)) {
              popTagStyle();
            } else if (/^<(i|em)\b[^>]*>$/i.test(lower)) {
              pushTagStyle({ italics: true });
            } else if (/^<\/(i|em)>$/i.test(lower)) {
              popTagStyle();
            } else if (/^<(s|del|strike)\b[^>]*>$/i.test(lower)) {
              pushTagStyle({ strike: true });
            } else if (/^<\/(s|del|strike)>$/i.test(lower)) {
              popTagStyle();
            } else if (/^<code\b[^>]*>$/i.test(lower)) {
              pushTagStyle({ code: true });
            } else if (/^<\/code>$/i.test(lower)) {
              popTagStyle();
            }
            // Any other HTML tag or comment is intentionally ignored so raw HTML never leaks
            break;
          }
          case 'text': {
            const t = tok as Tokens.Text;
            if (Array.isArray(t.tokens) && t.tokens.length > 0) {
              out.push(...(await renderInlineTokens(t.tokens, curStyle())));
            } else {
              emitLeafText(t.text, curStyle(), out);
            }
            break;
          }
          default: {
            if ('tokens' in tok && Array.isArray(tok.tokens) && tok.tokens.length > 0) {
              out.push(...(await renderInlineTokens(tok.tokens, curStyle())));
            } else if ('text' in tok && typeof tok.text === 'string') {
              emitLeafText(tok.text, curStyle(), out);
            }
            break;
          }
        }
      }
      return out;
    };

    const renderStashedBlock = async (blk: StashedBlock): Promise<(Paragraph | Table)[]> => {
      if (blk.kind === 'display_math') {
        const mathNodes = buildDocxMathNodes(blk.tex, true, { size: 22, color: COLOR_BODY });
        const eqTable = new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.FIXED,
          borders: {
            top: NONE_BORDER,
            bottom: NONE_BORDER,
            left: NONE_BORDER,
            right: NONE_BORDER,
            insideHorizontal: NONE_BORDER,
            insideVertical: NONE_BORDER,
          },
          rows: [
            new TableRow({
              cantSplit: true,
              children: [
                new TableCell({
                  width: { size: 10, type: WidthType.PERCENTAGE },
                  verticalAlign: VerticalAlignTable.CENTER,
                  children: [new Paragraph({ children: [] })],
                }),
                new TableCell({
                  width: { size: 80, type: WidthType.PERCENTAGE },
                  verticalAlign: VerticalAlignTable.CENTER,
                  margins: { top: 80, bottom: 80, left: 40, right: 40 },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { before: 40, after: 40 },
                      children: mathNodes,
                    }),
                  ],
                }),
                new TableCell({
                  width: { size: 10, type: WidthType.PERCENTAGE },
                  verticalAlign: VerticalAlignTable.CENTER,
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.RIGHT,
                      children: [
                        new TextRun({
                          text: `(${blk.eqNumber})`,
                          size: 20,
                          font: BODY_FONT,
                          color: COLOR_MUTED,
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        });
        return [
          new Paragraph({ spacing: { before: 0, after: 40 }, children: [] }),
          eqTable,
          new Paragraph({ spacing: { before: 0, after: 80 }, children: [] }),
        ];
      }

      if (blk.kind === 'figure') {
        const outBlocks: (Paragraph | Table)[] = [];
        const resolved = await getOrResolveImage(blk.src);
        const plainAlt = blk.captionMd
          ? resolvePlainTextPass2(blk.captionMd)
          : `Figure ${blk.figNumber}`;

        if (resolved) {
          const dims = computeFigureDisplaySize(
            resolved.width,
            resolved.height,
            blk.widthFraction,
            resolved.kind === 'svg'
          );
          const imageRun =
            resolved.kind === 'svg'
              ? new ImageRun({
                  type: 'svg',
                  data: resolved.data,
                  fallback: { type: 'png', data: resolved.fallbackPng },
                  transformation: dims,
                  altText: {
                    name: `Figure ${blk.figNumber}`,
                    title: `Figure ${blk.figNumber}`,
                    description: plainAlt,
                  },
                })
              : new ImageRun({
                  type: resolved.type,
                  data: resolved.data,
                  transformation: dims,
                  altText: {
                    name: `Figure ${blk.figNumber}`,
                    title: `Figure ${blk.figNumber}`,
                    description: plainAlt,
                  },
                });
          outBlocks.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              keepNext: true,
              spacing: { before: 200, after: 80 },
              children: [imageRun],
            })
          );
        } else {
          outBlocks.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              keepNext: true,
              spacing: { before: 200, after: 80 },
              shading: { type: ShadingType.CLEAR, fill: COLOR_CODE_BG },
              border: {
                top: { style: BorderStyle.DASHED, size: 6, color: COLOR_BORDER, space: 8 },
                bottom: { style: BorderStyle.DASHED, size: 6, color: COLOR_BORDER, space: 8 },
                left: { style: BorderStyle.DASHED, size: 6, color: COLOR_BORDER, space: 12 },
                right: { style: BorderStyle.DASHED, size: 6, color: COLOR_BORDER, space: 12 },
              },
              children: [
                new TextRun({
                  text: 'Figure image: ',
                  size: 20,
                  font: BODY_FONT,
                  color: COLOR_MUTED,
                }),
                new TextRun({
                  text: blk.src,
                  size: 19,
                  font: CODE_FONT,
                  color: COLOR_MUTED,
                }),
              ],
            })
          );
        }

        const captionChildren: ParagraphChild[] = [
          new TextRun({
            text: blk.captionMd ? `Figure ${blk.figNumber}: ` : `Figure ${blk.figNumber}`,
            bold: true,
            size: 19,
            font: BODY_FONT,
            color: COLOR_CAPTION,
          }),
        ];
        if (blk.captionMd) {
          const capTokens = marked.Lexer.lexInline(blk.captionMd, { gfm: true });
          captionChildren.push(
            ...(await renderInlineTokens(capTokens, {
              size: 19,
              font: BODY_FONT,
              color: COLOR_CAPTION,
            }))
          );
        }

        outBlocks.push(
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 40, after: 200, line: 280 },
            children: captionChildren,
          })
        );
        return outBlocks;
      }

      if (blk.kind === 'table_caption') {
        const capChildren: ParagraphChild[] = [
          new TextRun({
            text: `Table ${blk.displayNum}. `,
            bold: true,
            size: 20,
            font: BODY_FONT,
            color: COLOR_BODY,
          }),
        ];
        if (blk.captionMd) {
          const capTokens = marked.Lexer.lexInline(blk.captionMd, { gfm: true });
          capChildren.push(
            ...(await renderInlineTokens(capTokens, {
              size: 20,
              font: BODY_FONT,
              color: COLOR_BODY,
            }))
          );
        }
        return [
          new Paragraph({
            keepNext: true,
            spacing: { before: 220, after: 80 },
            children: capChildren,
          }),
        ];
      }

      // code_block or raw_latex
      const codeLines = blk.text.split('\n');
      const codeRuns: TextRun[] = [];
      codeLines.forEach((lineText, idx) => {
        if (idx > 0) codeRuns.push(new TextRun({ break: 1 }));
        codeRuns.push(
          new TextRun({
            text: lineText,
            font: CODE_FONT,
            size: 18,
            color: COLOR_BODY,
          })
        );
      });
      return [
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { before: 120, after: 140, line: 260 },
          shading: { type: ShadingType.CLEAR, fill: COLOR_CODE_BG },
          border: {
            top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER, space: 6 },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER, space: 6 },
            left: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER, space: 10 },
            right: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER, space: 10 },
          },
          children: codeRuns,
        }),
      ];
    };

    const renderCodeBlockToken = (text: string): Paragraph => {
      const codeLines = text.replace(/\n$/, '').split('\n');
      const runs: TextRun[] = [];
      codeLines.forEach((lineText, idx) => {
        if (idx > 0) runs.push(new TextRun({ break: 1 }));
        runs.push(
          new TextRun({
            text: lineText,
            font: CODE_FONT,
            size: 18,
            color: COLOR_BODY,
          })
        );
      });
      return new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 120, after: 140, line: 260 },
        shading: { type: ShadingType.CLEAR, fill: COLOR_CODE_BG },
        border: {
          top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER, space: 6 },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER, space: 6 },
          left: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER, space: 10 },
          right: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER, space: 10 },
        },
        children: runs,
      });
    };

    const renderProseOrStashedBlocks = async (
      rawText: string,
      inlineToks: Token[] | undefined,
      paraOpts: {
        alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
        spacing?: { before?: number; after?: number; line?: number };
        indent?: { left?: number; hanging?: number };
        numbering?: { reference: string; level: number; instance?: number };
        border?: { left?: IBorderOptions };
        shading?: { type: (typeof ShadingType)[keyof typeof ShadingType]; fill: string };
        style?: InlineStyle;
        prefixText?: string;
      }
    ): Promise<(Paragraph | Table)[]> => {
      const trimmed = rawText.trim();
      const exactMatch = /^MIRTEXBLK(\d+)END$/.exec(trimmed);
      if (exactMatch) {
        const blk = blockTokens[Number(exactMatch[1])];
        return blk ? await renderStashedBlock(blk) : [];
      }

      if (rawText.includes('MIRTEXBLK')) {
        const results: (Paragraph | Table)[] = [];
        const parts = rawText.split(/(MIRTEXBLK\d+END)/g);
        let usedFirst = false;
        for (const piece of parts) {
          if (!piece.trim()) continue;
          const blkM = /^MIRTEXBLK(\d+)END$/.exec(piece.trim());
          if (blkM) {
            const blk = blockTokens[Number(blkM[1])];
            if (blk) results.push(...(await renderStashedBlock(blk)));
          } else {
            const lexed = marked.Lexer.lexInline(piece.trim(), { gfm: true });
            const runs = await renderInlineTokens(lexed, paraOpts.style ?? { size: 22, color: COLOR_BODY });
            if (!usedFirst && paraOpts.prefixText) {
              runs.unshift(makeTextRun(paraOpts.prefixText, paraOpts.style ?? { size: 22, color: COLOR_BODY }));
            }
            const useNumbering = !usedFirst ? paraOpts.numbering : undefined;
            usedFirst = true;
            results.push(
              new Paragraph({
                alignment: paraOpts.alignment ?? AlignmentType.JUSTIFIED,
                spacing: paraOpts.spacing ?? { line: 340, after: 140 },
                ...(paraOpts.indent ? { indent: paraOpts.indent } : {}),
                ...(useNumbering ? { numbering: useNumbering } : {}),
                ...(paraOpts.border ? { border: paraOpts.border } : {}),
                ...(paraOpts.shading ? { shading: paraOpts.shading } : {}),
                children: runs,
              })
            );
          }
        }
        return results;
      }

      const toks = inlineToks && inlineToks.length > 0 ? inlineToks : marked.Lexer.lexInline(rawText, { gfm: true });
      const runs = await renderInlineTokens(toks, paraOpts.style ?? { size: 22, color: COLOR_BODY });
      if (paraOpts.prefixText) {
        runs.unshift(makeTextRun(paraOpts.prefixText, paraOpts.style ?? { size: 22, color: COLOR_BODY }));
      }
      return [
        new Paragraph({
          alignment: paraOpts.alignment ?? AlignmentType.JUSTIFIED,
          spacing: paraOpts.spacing ?? { line: 340, after: 140 },
          ...(paraOpts.indent ? { indent: paraOpts.indent } : {}),
          ...(paraOpts.numbering ? { numbering: paraOpts.numbering } : {}),
          ...(paraOpts.border ? { border: paraOpts.border } : {}),
          ...(paraOpts.shading ? { shading: paraOpts.shading } : {}),
          children: runs,
        }),
      ];
    };

    const renderListBlock = async (
      list: Tokens.List,
      depth: number
    ): Promise<(Paragraph | Table)[]> => {
      const outBlocks: (Paragraph | Table)[] = [];
      const level = Math.min(3, depth);
      const instance = list.ordered ? ++orderedListCounter : undefined;

      for (const item of list.items) {
        let emittedFirstPara = false;
        const checkboxPrefix = item.task ? (item.checked ? '☑ ' : '☐ ') : undefined;

        for (const subTok of item.tokens) {
          if (subTok.type === 'space' || subTok.type === 'checkbox') {
            continue;
          }
          if (subTok.type === 'list') {
            outBlocks.push(...(await renderListBlock(subTok as Tokens.List, depth + 1)));
            continue;
          }
          if (subTok.type === 'code') {
            outBlocks.push(renderCodeBlockToken((subTok as Tokens.Code).text));
            emittedFirstPara = true;
            continue;
          }
          if (subTok.type === 'blockquote') {
            const bq = subTok as Tokens.Blockquote;
            outBlocks.push(...(await renderBlockList(bq.tokens, { inQuote: true })));
            emittedFirstPara = true;
            continue;
          }
          if (subTok.type === 'paragraph' || subTok.type === 'text') {
            const t = subTok as Tokens.Paragraph | Tokens.Text;
            const isFirst = !emittedFirstPara;
            emittedFirstPara = true;

            const useTaskIndent = isFirst && item.task && !list.ordered;
            const numbering =
              isFirst && !useTaskIndent
                ? {
                    reference: list.ordered ? 'academic-numbered' : 'academic-bullets',
                    level,
                    ...(instance !== undefined ? { instance } : {}),
                  }
                : undefined;
            const indent = useTaskIndent
              ? { left: (level + 1) * 720, hanging: 320 }
              : !isFirst
                ? { left: (level + 1) * 720 }
                : undefined;

            outBlocks.push(
              ...(await renderProseOrStashedBlocks(t.text, t.tokens, {
                alignment: AlignmentType.JUSTIFIED,
                spacing: { line: 320, after: 80 },
                numbering,
                indent,
                prefixText: isFirst ? checkboxPrefix : undefined,
              }))
            );
            continue;
          }
          outBlocks.push(...(await renderBlockList([subTok])));
        }
      }
      return outBlocks;
    };

    const renderBlockList = async (
      blkTokens: Token[],
      ctx?: { inQuote?: boolean }
    ): Promise<(Paragraph | Table)[]> => {
      const outBlocks: (Paragraph | Table)[] = [];

      for (const tok of blkTokens) {
        switch (tok.type) {
          case 'space':
            break;

          case 'heading': {
            const h = tok as Tokens.Heading;
            const headingLevel =
              h.depth === 1
                ? HeadingLevel.HEADING_1
                : h.depth === 2
                  ? HeadingLevel.HEADING_2
                  : h.depth === 3
                    ? HeadingLevel.HEADING_3
                    : HeadingLevel.HEADING_4;
            const size =
              h.depth === 1 ? 30 : h.depth === 2 ? 25 : h.depth === 3 ? 23 : 22;
            const color = h.depth <= 2 ? COLOR_HEADING : COLOR_SUBHEADING;
            const italics = h.depth >= 4;
            const runs = await renderInlineTokens(h.tokens, {
              bold: true,
              italics,
              size,
              color,
              font: BODY_FONT,
            });
            outBlocks.push(
              new Paragraph({
                heading: headingLevel,
                keepNext: true,
                spacing: {
                  before: h.depth === 1 ? 320 : h.depth === 2 ? 240 : 180,
                  after: h.depth === 1 ? 140 : 100,
                },
                ...(h.depth === 1
                  ? {
                      border: {
                        bottom: {
                          style: BorderStyle.SINGLE,
                          size: 4,
                          color: COLOR_BORDER,
                          space: 4,
                        },
                      },
                    }
                  : {}),
                children: runs,
              })
            );
            break;
          }

          case 'paragraph': {
            const p = tok as Tokens.Paragraph;
            outBlocks.push(
              ...(await renderProseOrStashedBlocks(
                p.text,
                p.tokens,
                ctx?.inQuote
                  ? {
                      alignment: AlignmentType.LEFT,
                      spacing: { before: 80, after: 120, line: 320 },
                      indent: { left: 480 },
                      border: {
                        left: {
                          style: BorderStyle.SINGLE,
                          size: 18,
                          color: COLOR_QUOTE_BORDER,
                          space: 12,
                        },
                      },
                      shading: { type: ShadingType.CLEAR, fill: COLOR_QUOTE_BG },
                      style: { size: 22, color: '374151', italics: true },
                    }
                  : {
                      alignment: AlignmentType.JUSTIFIED,
                      spacing: { line: 340, after: 140 },
                    }
              ))
            );
            break;
          }

          case 'list': {
            outBlocks.push(...(await renderListBlock(tok as Tokens.List, 0)));
            break;
          }

          case 'blockquote': {
            const bq = tok as Tokens.Blockquote;
            outBlocks.push(...(await renderBlockList(bq.tokens, { inQuote: true })));
            break;
          }

          case 'code': {
            const c = tok as Tokens.Code;
            outBlocks.push(renderCodeBlockToken(c.text));
            break;
          }

          case 'table': {
            const tbl = tok as Tokens.Table;
            const colCount = Math.max(
              tbl.header.length,
              ...tbl.rows.map((r) => r.length),
              1
            );

            const makeCell = async (
              cell: Tokens.TableCell | undefined,
              colIdx: number,
              isHeader: boolean,
              isLastRow: boolean
            ): Promise<TableCell> => {
              const align = mapTableAlignment(cell?.align ?? tbl.align[colIdx]);
              const cellStyle: InlineStyle = {
                size: 20,
                font: BODY_FONT,
                color: COLOR_BODY,
                ...(isHeader ? { bold: true } : {}),
              };
              const cellChildren =
                cell && cell.tokens.length > 0
                  ? await renderInlineTokens(cell.tokens, cellStyle)
                  : cell?.text
                    ? await renderInlineTokens(
                        marked.Lexer.lexInline(cell.text, { gfm: true }),
                        cellStyle
                      )
                    : [];

              return new TableCell({
                verticalAlign: VerticalAlignTable.CENTER,
                margins: { top: 80, bottom: 80, left: 110, right: 110 },
                ...(isHeader
                  ? { shading: { type: ShadingType.CLEAR, fill: COLOR_HEADER_BG } }
                  : {}),
                borders: {
                  top: isHeader
                    ? { style: BorderStyle.SINGLE, size: 12, color: COLOR_RULE }
                    : NONE_BORDER,
                  bottom: isHeader
                    ? { style: BorderStyle.SINGLE, size: 6, color: COLOR_RULE }
                    : isLastRow
                      ? { style: BorderStyle.SINGLE, size: 12, color: COLOR_RULE }
                      : { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB' },
                  left: NONE_BORDER,
                  right: NONE_BORDER,
                },
                children: [
                  new Paragraph({
                    alignment: align,
                    spacing: { before: 20, after: 20, line: 260 },
                    children: cellChildren,
                  }),
                ],
              });
            };

            const tableRows: TableRow[] = [];
            const headerCells = await Promise.all(
              Array.from({ length: colCount }, (_, colIdx) =>
                makeCell(tbl.header[colIdx], colIdx, true, tbl.rows.length === 0)
              )
            );
            tableRows.push(
              new TableRow({
                tableHeader: true,
                cantSplit: true,
                children: headerCells,
              })
            );

            for (let rIdx = 0; rIdx < tbl.rows.length; rIdx++) {
              const row = tbl.rows[rIdx];
              const isLastRow = rIdx === tbl.rows.length - 1;
              const bodyCells = await Promise.all(
                Array.from({ length: colCount }, (_, colIdx) =>
                  makeCell(row[colIdx], colIdx, false, isLastRow)
                )
              );
              tableRows.push(
                new TableRow({
                  cantSplit: true,
                  children: bodyCells,
                })
              );
            }

            outBlocks.push(
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                layout: TableLayoutType.AUTOFIT,
                borders: {
                  top: NONE_BORDER,
                  bottom: NONE_BORDER,
                  left: NONE_BORDER,
                  right: NONE_BORDER,
                  insideHorizontal: NONE_BORDER,
                  insideVertical: NONE_BORDER,
                },
                rows: tableRows,
              }),
              new Paragraph({ spacing: { before: 0, after: 140 }, children: [] })
            );
            break;
          }

          case 'hr': {
            outBlocks.push(
              new Paragraph({
                spacing: { before: 100, after: 180 },
                border: {
                  bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER, space: 4 },
                },
                children: [],
              })
            );
            break;
          }

          case 'html': {
            const rawHtml = (tok as Tokens.HTML).raw.trim();
            if (/^<!--[\s\S]*-->$/.test(rawHtml)) break;
            if (/^<hr\s*\/?>$/i.test(rawHtml)) {
              outBlocks.push(
                new Paragraph({
                  spacing: { before: 100, after: 180 },
                  border: {
                    bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER, space: 4 },
                  },
                  children: [],
                })
              );
              break;
            }
            const strippedText = rawHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            if (strippedText) {
              outBlocks.push(
                ...(await renderProseOrStashedBlocks(strippedText, undefined, {
                  alignment: AlignmentType.JUSTIFIED,
                  spacing: { line: 340, after: 140 },
                }))
              );
            }
            break;
          }

          default:
            break;
        }
      }

      return outBlocks;
    };

    docChildren.push(...(await renderBlockList(tokens)));
  }

  // 4. References Section (matches .academic-references in Preview.css)
  if (bib.references.length > 0) {
    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        keepNext: true,
        spacing: { before: 320, after: 140 },
        border: {
          top: { style: BorderStyle.SINGLE, size: 6, color: COLOR_BORDER, space: 12 },
        },
        children: [
          new TextRun({
            text: 'References',
            bold: true,
            size: 28,
            font: BODY_FONT,
            color: COLOR_HEADING,
          }),
        ],
      })
    );

    for (const ref of bib.references) {
      docChildren.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { line: 276, after: 100 },
          indent: { left: 420, hanging: 420 },
          children: [
            new TextRun({
              text: ref.formatted,
              size: 20,
              font: BODY_FONT,
              color: COLOR_BODY,
            }),
          ],
        })
      );
    }
  }

  const runningHeaderText = (frontMatter.shortTitle || frontMatter.title || '').trim();

  const doc = new Document({
    title: frontMatter.title || 'Untitled Manuscript',
    styles: {
      default: {
        document: {
          run: {
            font: BODY_FONT,
            size: 22,
            color: COLOR_BODY,
          },
          paragraph: {
            spacing: { line: 340, after: 140 },
          },
        },
        heading1: {
          run: {
            font: BODY_FONT,
            size: 30,
            bold: true,
            color: COLOR_HEADING,
          },
          paragraph: {
            spacing: { before: 320, after: 140 },
            keepNext: true,
          },
        },
        heading2: {
          run: {
            font: BODY_FONT,
            size: 25,
            bold: true,
            color: COLOR_HEADING,
          },
          paragraph: {
            spacing: { before: 240, after: 100 },
            keepNext: true,
          },
        },
        heading3: {
          run: {
            font: BODY_FONT,
            size: 23,
            bold: true,
            color: COLOR_SUBHEADING,
          },
          paragraph: {
            spacing: { before: 180, after: 90 },
            keepNext: true,
          },
        },
        heading4: {
          run: {
            font: BODY_FONT,
            size: 22,
            bold: true,
            italics: true,
            color: COLOR_SUBHEADING,
          },
          paragraph: {
            spacing: { before: 160, after: 80 },
            keepNext: true,
          },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: 'academic-bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
            {
              level: 1,
              format: LevelFormat.BULLET,
              text: '◦',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 1080, hanging: 360 } } },
            },
            {
              level: 2,
              format: LevelFormat.BULLET,
              text: '▪',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 1440, hanging: 360 } } },
            },
            {
              level: 3,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 1800, hanging: 360 } } },
            },
          ],
        },
        {
          reference: 'academic-numbered',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
            {
              level: 1,
              format: LevelFormat.LOWER_LETTER,
              text: '%2.',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 1080, hanging: 360 } } },
            },
            {
              level: 2,
              format: LevelFormat.LOWER_ROMAN,
              text: '%3.',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 1440, hanging: 360 } } },
            },
            {
              level: 3,
              format: LevelFormat.DECIMAL,
              text: '%4.',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 1800, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          titlePage: true,
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
          },
        },
        headers: runningHeaderText
          ? {
              first: new Header({ children: [] }),
              default: new Header({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                      new TextRun({
                        text: runningHeaderText,
                        italics: true,
                        size: 18,
                        font: BODY_FONT,
                        color: COLOR_MUTED,
                      }),
                    ],
                  }),
                ],
              }),
            }
          : undefined,
        footers: {
          first: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 18,
                    font: BODY_FONT,
                    color: COLOR_MUTED,
                  }),
                ],
              }),
            ],
          }),
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 18,
                    font: BODY_FONT,
                    color: COLOR_MUTED,
                  }),
                ],
              }),
            ],
          }),
        },
        children: docChildren,
      },
    ],
  });

  return await Packer.toBlob(doc);
}
