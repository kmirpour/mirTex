import type { CitationDialect } from '../types/latex';
import type { ProjectFigureFile } from '../types/paper';
import {
  decodeBasicHtmlEntities,
  normalizeAcademicMarkdown,
} from '../utils/normalizeAcademicMarkdown';
import { cleanFigureCaption, figureLabelFromFileName } from '../utils/paperOutline';
export { cleanFigureCaption };
import { sanitizeLatexMath, unicodeToLatexText } from './unicodeToLatex';

export interface TranspileOptions {
  citationDialect: CitationDialect;
  citationCommandOverride?: 'auto' | 'cite' | 'citep' | 'autocite';
  useCleveref?: boolean;
  useBooktabs?: boolean;
  /** Strip a leading `# Heading` line (or matching top-of-section `##` heading) when the template already supplies `\section{...}`. */
  stripTopH1?: boolean;
  /** Optional section title & role metadata to recognize top-of-section `##` headers safely. */
  sectionTitle?: string;
  sectionRole?: string;
  /** Available figure files discovered in `figures/` or `figure/`. */
  projectFigures?: ProjectFigureFile[];
  /** Figure labels/paths already explicitly embedded via `![...]` anywhere in the paper. */
  embeddedFigureLabels?: Set<string>;
  /** Shared mutable set across sections so each auto-emitted folder figure is emitted at most once. */
  emittedAutoFigures?: Set<string>;
}

export interface TranspileResult {
  latex: string;
  usesFigures: boolean;
  usesTables: boolean;
  usesMath: boolean;
  citedKeys: string[];
}

/** Escapes special LaTeX characters and converts Unicode symbols in plain prose (never call on math). */
export function escapeLatexText(text: string): string {
  const escaped = text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/</g, '\\textless{}')
    .replace(/>/g, '\\textgreater{}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
  return unicodeToLatexText(escaped);
}

function chooseCitationCmd(
  opts: TranspileOptions,
  narrative: boolean
): string {
  if (opts.citationCommandOverride && opts.citationCommandOverride !== 'auto') {
    if (narrative && opts.citationCommandOverride === 'citep') return 'citet';
    if (narrative && opts.citationCommandOverride === 'autocite') return 'textcite';
    return opts.citationCommandOverride;
  }
  if (opts.citationDialect === 'biblatex') {
    return narrative ? 'textcite' : 'autocite';
  }
  if (opts.citationDialect === 'natbib') {
    return narrative ? 'citet' : 'citep';
  }
  return 'cite';
}

export function splitInlineFiguresOntoOwnLines(markdown: string): string {
  if (!markdown || !markdown.includes('![')) return markdown;

  const protectedBlocks: string[] = [];
  const mask = (s: string) => {
    const idx = protectedBlocks.length;
    protectedBlocks.push(s);
    return `\uE012FIGMASK${idx}\uE013`;
  };

  let working = markdown
    .replace(/```[\s\S]*?```/g, mask)
    .replace(/\$\$[\s\S]*?\$\$/g, mask)
    .replace(/`[^`\n]+`/g, mask);

  const lines = working.split('\n');
  const outLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      !trimmed.includes('![') ||
      /^!\[((?:[^[\]\n]|\[[^[\]\n]*\])*)\]\([^)\n]+\)(?:\s*\{[^}\n]*\})?\s*$/.test(trimmed)
    ) {
      outLines.push(line);
      continue;
    }
    const splitLine = line.replace(
      /!\[((?:[^[\]\n]|\[[^[\]\n]*\])*)\]\(([^)\n]+)\)(?:\s*\{([^}\n]*)\})?/g,
      (match) => `\n\n${match.trim()}\n\n`
    );
    outLines.push(splitLine);
  }

  working = outLines
    .join('\n')
    .replace(/[ \t]+\n\n/g, '\n\n')
    .replace(/\n\n[ \t]+/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n');

  return working.replace(
    /\uE012FIGMASK(\d+)\uE013/g,
    (_m, idxStr: string) => protectedBlocks[Number(idxStr)] ?? ''
  );
}

export function findFolderFigure(
  label: string,
  projectFigures?: ProjectFigureFile[]
): ProjectFigureFile | undefined {
  if (!projectFigures || projectFigures.length === 0) return undefined;
  const target = label.toLowerCase();
  const targetNorm = target.replace(/_/g, '-');
  const targetStem = targetNorm.replace(/^fig:/, '');
  return projectFigures.find((fig) => {
    const figLbl = fig.label.toLowerCase();
    if (figLbl === target || figLbl === targetNorm) return true;
    if (figureLabelFromFileName(fig.name).toLowerCase() === targetNorm) return true;
    const rawStem = fig.name
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return rawStem === targetStem;
  });
}

function renderAutoFigureBlock(
  fig: ProjectFigureFile,
  label: string,
  attrStr = '',
  explicitCaption = '',
  opts?: TranspileOptions,
  citedKeysSet?: Set<string>,
  onMath?: () => void
): string {
  const widthMatch = /width=([0-9.]+)/.exec(attrStr);
  const wide = /wide=true/i.test(attrStr);
  const width = widthMatch ? widthMatch[1] : '0.85';
  const env = wide ? 'figure*' : 'figure';
  const imgPath = fig.relPath.replace(/\\/g, '/');
  const cleanCap = cleanFigureCaption(explicitCaption, fig.relPath);
  const captionLatex =
    cleanCap && opts && citedKeysSet && onMath
      ? transpileInline(cleanCap, opts, citedKeysSet, onMath)
      : cleanCap
        ? escapeLatexText(cleanCap)
        : '';
  const labels = [label];
  if (fig.label && fig.label.toLowerCase() !== label.toLowerCase()) {
    labels.push(fig.label);
  }
  const labelLines = labels.map((l) => `  \\label{${l}}`).join('\n');
  return `\\begin{${env}}[htbp]\n  \\centering\n  \\includegraphics[width=${width}\\textwidth]{${imgPath}}\n  \\caption{${captionLatex}}\n${labelLines}\n\\end{${env}}`;
}

function emitUnembeddedFolderFigures(
  figLabels: string[],
  opts: TranspileOptions,
  emittedSet: Set<string>,
  out: string[],
  onFigure: () => void
): void {
  if (!opts.projectFigures || opts.projectFigures.length === 0 || figLabels.length === 0) return;
  for (const lbl of figLabels) {
    const lblKey = lbl.toLowerCase();
    const normLblKey = lbl.startsWith('fig:')
      ? figureLabelFromFileName(lbl.slice(4)).toLowerCase()
      : lblKey;
    if (
      opts.embeddedFigureLabels?.has(lblKey) ||
      opts.embeddedFigureLabels?.has(normLblKey) ||
      emittedSet.has(lblKey) ||
      emittedSet.has(normLblKey)
    ) {
      continue;
    }
    const fig = findFolderFigure(lbl, opts.projectFigures);
    if (!fig) continue;
    const figLblKey = fig.label.toLowerCase();
    const figPathKey = fig.relPath.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
    if (
      opts.embeddedFigureLabels?.has(figLblKey) ||
      opts.embeddedFigureLabels?.has(figPathKey) ||
      emittedSet.has(figPathKey)
    ) {
      continue;
    }
    emittedSet.add(lblKey);
    emittedSet.add(normLblKey);
    emittedSet.add(figLblKey);
    emittedSet.add(figPathKey);
    onFigure();
    out.push(renderAutoFigureBlock(fig, lbl));
  }
}

const TOP_SECTION_NAMES = new Set([
  'abstract',
  'introduction',
  'results',
  'discussion',
  'methods',
  'materials and methods',
  'conclusion',
  'conclusions',
  'acknowledgements',
  'acknowledgments',
]);

function normSectionHeading(raw: string): string {
  return raw
    .replace(/[*_`]/g, '')
    .replace(/^\d+(?:\.\d+)*\.?\s*/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function shouldStripLeadingH2(
  lines: string[],
  startIdx: number,
  opts: TranspileOptions
): boolean {
  const m = /^##[ \t]+(.+?)(?:\s*\{#[^}\s]+\})?\s*$/.exec(lines[startIdx].trim());
  if (!m) return false;
  const headingNorm = normSectionHeading(m[1]);

  let otherH2Count = 0;
  let hasH3 = false;
  let inFence = false;
  for (let idx = startIdx + 1; idx < lines.length; idx++) {
    const t = lines[idx].trim();
    if (t.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^##[ \t]+/.test(t)) otherH2Count++;
    else if (/^###[ \t]+/.test(t)) hasH3 = true;
  }

  if (otherH2Count === 0 && hasH3) return true;

  const candidates: string[] = [];
  if (opts.sectionTitle) candidates.push(normSectionHeading(opts.sectionTitle));
  if (opts.sectionRole) candidates.push(normSectionHeading(opts.sectionRole));
  for (const cand of candidates) {
    if (!cand) continue;
    if (
      headingNorm === cand ||
      headingNorm === `${cand}s` ||
      cand === `${headingNorm}s` ||
      headingNorm.includes(cand) ||
      cand.includes(headingNorm)
    ) {
      return true;
    }
  }

  return otherH2Count === 0 && TOP_SECTION_NAMES.has(headingNorm);
}

function parseTableCaptionLine(line: string): { caption: string; label: string | null } | null {
  const m1 = /^Table(?:\s+(\d+))?:\s*(.+?)(?:\s*\{#([^}\s]+)\})?\s*$/i.exec(line);
  if (m1) {
    return {
      caption: m1[2].trim(),
      label: m1[3] || (m1[1] ? `tbl:table-${m1[1]}` : null),
    };
  }
  const m2 = /^\*\*Table(?:\s+(\d+))?[.:]\s*(.+?)\*\*(?:\s*\{#([^}\s]+)\})?\s*$/i.exec(line);
  if (m2) {
    return {
      caption: m2[2].trim(),
      label: m2[3] || (m2[1] ? `tbl:table-${m2[1]}` : null),
    };
  }
  return null;
}

/**
 * Transpiles MirTex academic Markdown into clean, compilable LaTeX.
 * Supports:
 * - Inline `$...$` and display `$$...$$` math with optional `{#eq:label}`
 * - Citations `[@key1; @key2]`, `[see @key, p. 12]`, narrative `@key`
 * - Cross-references `@fig:id`, `@tbl:id`, `@eq:id`, `@sec:id`
 * - Figures `![Caption](figures/img.png){#fig:id width=0.8 wide=true}`
 * - Pipe tables with optional `Table: Caption {#tbl:id}`
 * - Headings (`##` -> `\subsection`, `###` -> `\subsubsection`, `####` -> `\paragraph`)
 * - Lists, blockquotes, bold, italic, underline, code, superscript `^x^`, subscript `~x~`
 * - Raw LaTeX passthrough blocks (```latex-raw ... ```)
 */
export function markdownToLatex(markdown: string, opts: TranspileOptions): TranspileResult {
  let usesFigures = false;
  let usesTables = false;
  let usesMath = false;
  const citedKeysSet = new Set<string>();
  const emittedSet = opts.emittedAutoFigures ?? new Set<string>();

  const normalized = splitInlineFiguresOntoOwnLines(normalizeAcademicMarkdown(markdown));
  const lines = normalized.split('\n');
  const out: string[] = [];

  let i = 0;
  let skippedFirstH1 = false;
  let promotedSubheadings = false;

  // Skip leading blank lines
  while (i < lines.length && lines[i].trim() === '') i++;

  // Optionally drop the top `# Section Title` (or matching leading `## Section Title`)
  if (opts.stripTopH1 && i < lines.length) {
    if (/^#[ \t]+/.test(lines[i])) {
      skippedFirstH1 = true;
      i++;
      while (i < lines.length && lines[i].trim() === '') i++;
    } else if (shouldStripLeadingH2(lines, i, opts)) {
      skippedFirstH1 = true;
      promotedSubheadings = true;
      i++;
      while (i < lines.length && lines[i].trim() === '') i++;
    }
  }
  void skippedFirstH1;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      out.push('');
      i++;
      continue;
    }

    // Standalone Markdown horizontal rules (`---`, `***`, `___`) are visual dividers, not em-dash paragraphs
    if (/^(?:---+|___+|\*\*\*+)$/.test(trimmed) || /^(?:-\s+){2,}-$/.test(trimmed)) {
      i++;
      continue;
    }

    // 1. Raw LaTeX passthrough block: ```latex-raw or ```tex-raw
    if (/^```(?:latex-raw|tex-raw|raw-latex)\s*$/i.test(trimmed)) {
      i++;
      const rawLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        rawLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      out.push(rawLines.join('\n'));
      continue;
    }

    // 2. Standard fenced code block
    if (trimmed.startsWith('```')) {
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      out.push(`\\begin{verbatim}\n${codeLines.join('\n')}\n\\end{verbatim}`);
      continue;
    }

    // 3. Display Math block: $$ ... $$ {#eq:label}
    if (trimmed.startsWith('$$')) {
      usesMath = true;
      let mathBody: string;
      let label: string | null = null;

      // Single-line $$ ... $$ {#eq:foo}
      const singleMatch = /^\$\$(.+?)\$\$(?:\s*\{#(eq:[^}\s]+)\})?\s*$/.exec(trimmed);
      if (singleMatch) {
        mathBody = singleMatch[1].trim();
        label = singleMatch[2] || null;
        i++;
      } else {
        const afterOpen = trimmed.slice(2).trim();
        const bodyLines: string[] = afterOpen ? [afterOpen] : [];
        i++;
        while (i < lines.length) {
          const cur = lines[i].trim();
          const closeMatch = /^(.*?)\$\$(?:\s*\{#(eq:[^}\s]+)\})?\s*$/.exec(cur);
          if (closeMatch) {
            if (closeMatch[1].trim()) bodyLines.push(closeMatch[1].trim());
            label = closeMatch[2] || null;
            i++;
            break;
          }
          bodyLines.push(lines[i]);
          i++;
        }
        mathBody = bodyLines.join('\n').trim();
      }

      const cleanMath = sanitizeLatexMath(mathBody, true);
      if (label) {
        out.push(`\\begin{equation}\n\\label{${label}}\n${cleanMath}\n\\end{equation}`);
      } else {
        out.push(`\\begin{equation}\n${cleanMath}\n\\end{equation}`);
      }
      continue;
    }

    // 4. Headings (# / ## / ### / ####) with optional {#sec:label}
    const headingMatch = /^(#{1,4})[ \t]+(.+?)(?:\s*\{#([^}\s]+)\})?\s*$/.exec(trimmed);
    if (headingMatch) {
      const rawLevel = headingMatch[1].length;
      const effectiveLevel =
        promotedSubheadings && rawLevel >= 2 ? Math.max(2, rawLevel - 1) : rawLevel;
      const cleanHeadingTitle = headingMatch[2].replace(/^\d+(?:\.\d+)+\.?\s+/, '');
      const titleLatex = transpileInline(cleanHeadingTitle, opts, citedKeysSet, () => {
        usesMath = true;
      });
      const label = headingMatch[3];
      const cmd =
        effectiveLevel === 1
          ? 'section'
          : effectiveLevel === 2
            ? 'subsection'
            : effectiveLevel === 3
              ? 'subsubsection'
              : 'paragraph';
      out.push(`\\${cmd}{${titleLatex}}${label ? `\\label{${label}}` : ''}`);
      i++;
      continue;
    }

    // 5. Figure block: ![Caption](path){#fig:id width=0.8 wide=true}
    const figMatch =
      /^!\[((?:[^[\]\n]|\[[^[\]\n]*\])*)\]\(([^)\n]+)\)(?:\s*\{([^}\n]*)\})?\s*$/.exec(trimmed);
    if (figMatch) {
      usesFigures = true;
      let captionRaw = figMatch[1];
      const imgPath = figMatch[2].trim().replace(/\\/g, '/').replace(/^\.\//, '');
      const attrStr = figMatch[3] || '';
      const labelMatch = /#([a-zA-Z0-9:_-]+)/.exec(attrStr);
      const widthMatch = /width=([0-9.]+)/.exec(attrStr);
      const wide = /wide=true/i.test(attrStr);
      const width = widthMatch ? widthMatch[1] : '0.85';
      const env = wide ? 'figure*' : 'figure';

      let nextIdx = i + 1;
      if (nextIdx < lines.length && lines[nextIdx].trim() === '' && nextIdx + 1 < lines.length) {
        if (/^(?:Caption|Figure):\s*(.+?)\s*$/i.test(lines[nextIdx + 1].trim())) {
          nextIdx++;
        }
      }
      if (nextIdx < lines.length) {
        const capNext = /^(?:Caption|Figure):\s*(.+?)\s*$/i.exec(lines[nextIdx].trim());
        if (capNext) {
          captionRaw = capNext[1];
          i = nextIdx;
        }
      }

      const cleanedCap = cleanFigureCaption(captionRaw, imgPath);
      const captionLatex = cleanedCap
        ? transpileInline(cleanedCap, opts, citedKeysSet, () => {
            usesMath = true;
          })
        : '';
      const canonicalLabel = figureLabelFromFileName(imgPath);
      const rawStem = (imgPath.split('/').pop() || '').replace(/\.[^.]+$/, '');
      const rawStemLabel = rawStem ? `fig:${rawStem}` : '';
      let labelLines: string;
      if (labelMatch) {
        emittedSet.add(labelMatch[1].toLowerCase());
        labelLines = `\n  \\label{${labelMatch[1]}}`;
      } else {
        const autoLabels = [canonicalLabel];
        if (rawStemLabel && rawStemLabel !== canonicalLabel) {
          autoLabels.push(rawStemLabel);
        }
        labelLines = autoLabels.map((l) => `\n  \\label{${l}}`).join('');
        for (const l of autoLabels) emittedSet.add(l.toLowerCase());
      }
      emittedSet.add(imgPath.toLowerCase());
      emittedSet.add(canonicalLabel.toLowerCase());
      if (rawStemLabel) emittedSet.add(rawStemLabel.toLowerCase());
      out.push(
        `\\begin{${env}}[htbp]\n  \\centering\n  \\includegraphics[width=${width}\\textwidth]{${imgPath}}\n  \\caption{${captionLatex}}${labelLines}\n\\end{${env}}`
      );
      i++;
      continue;
    }

    // 5b. Standalone `@fig:id` line referencing an unembedded figure file in figures/ or figure/
    const standaloneFigRef =
      /^@(fig:[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)(?:\s*\{([^}]*)\})?(?:\s*:\s*(.+?)|\s+\[([^\]]+)\])?\s*$/.exec(
        trimmed
      );
    if (standaloneFigRef && opts.projectFigures && opts.projectFigures.length > 0) {
      const lbl = standaloneFigRef[1];
      const attrs = standaloneFigRef[2] || '';
      let explicitCaption = standaloneFigRef[3] ?? standaloneFigRef[4] ?? '';
      const lblKey = lbl.toLowerCase();
      const fig = findFolderFigure(lbl, opts.projectFigures);
      if (fig) {
        const figLblKey = fig.label.toLowerCase();
        const figPathKey = fig.relPath.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
        const alreadyHandled =
          opts.embeddedFigureLabels?.has(lblKey) ||
          opts.embeddedFigureLabels?.has(figLblKey) ||
          opts.embeddedFigureLabels?.has(figPathKey) ||
          emittedSet.has(lblKey) ||
          emittedSet.has(figPathKey);
        if (!alreadyHandled) {
          let nextIdx = i + 1;
          if (nextIdx < lines.length && lines[nextIdx].trim() === '' && nextIdx + 1 < lines.length) {
            if (/^(?:Caption|Figure):\s*(.+?)\s*$/i.test(lines[nextIdx + 1].trim())) {
              nextIdx++;
            }
          }
          if (nextIdx < lines.length) {
            const capNext = /^(?:Caption|Figure):\s*(.+?)\s*$/i.exec(lines[nextIdx].trim());
            if (capNext) {
              explicitCaption = capNext[1];
              i = nextIdx;
            }
          }
          emittedSet.add(lblKey);
          emittedSet.add(figLblKey);
          emittedSet.add(figPathKey);
          usesFigures = true;
          out.push(
            renderAutoFigureBlock(fig, lbl, attrs, explicitCaption, opts, citedKeysSet, () => {
              usesMath = true;
            })
          );
          i++;
          continue;
        }
      }
    }

    // 6. Optional table caption line (`Table: Caption {#tbl:id}` or `**Table N. Caption**`) followed by pipe table (optional blank line)
    let tableCaption: string | null = null;
    let tableLabel: string | null = null;
    const capParsed = parseTableCaptionLine(trimmed);
    if (capParsed) {
      let tblStartIdx = i + 1;
      while (tblStartIdx < lines.length && lines[tblStartIdx].trim() === '') {
        tblStartIdx++;
      }
      if (
        tblStartIdx + 1 < lines.length &&
        lines[tblStartIdx].trim().startsWith('|') &&
        /^\|[\s:|-]+\|?\s*$/.test(lines[tblStartIdx + 1].trim())
      ) {
        tableCaption = capParsed.caption;
        tableLabel = capParsed.label;
        i = tblStartIdx;
      }
    }

    // Pipe table
    if (
      lines[i].trim().startsWith('|') &&
      i + 1 < lines.length &&
      /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1].trim())
    ) {
      usesTables = true;
      const rawHeaderLine = lines[i].trim();
      const headerRow = splitTableRow(lines[i]);
      const alignRow = splitTableRow(lines[i + 1]);
      i += 2;
      const bodyRows: string[][] = [];
      let maxRawRowLen = rawHeaderLine.length;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const rowRaw = lines[i].trim();
        if (rowRaw.length > maxRawRowLen) maxRawRowLen = rowRaw.length;
        bodyRows.push(splitTableRow(lines[i]));
        i++;
      }

      // Check if a trailing caption line sits right below the table
      if (!tableCaption && i < lines.length) {
        const belowCap = parseTableCaptionLine(lines[i].trim());
        if (belowCap) {
          tableCaption = belowCap.caption;
          tableLabel = belowCap.label;
          i++;
        }
      }

      const colSpec = alignRow
        .map((cell) => {
          const c = cell.trim();
          if (c.startsWith(':') && c.endsWith(':')) return 'c';
          if (c.endsWith(':')) return 'r';
          return 'l';
        })
        .join('');

      const fmtRow = (cells: string[]) =>
        cells
          .map((c) =>
            transpileInline(c, opts, citedKeysSet, () => {
              usesMath = true;
            })
          )
          .join(' & ') + ' \\\\';

      const topRule = opts.useBooktabs !== false ? '\\toprule' : '\\hline';
      const midRule = opts.useBooktabs !== false ? '\\midrule' : '\\hline';
      const botRule = opts.useBooktabs !== false ? '\\bottomrule' : '\\hline';

      const colCount = Math.max(headerRow.length, alignRow.length);
      const isWideTable = colCount >= 5 || maxRawRowLen > 90;
      if (isWideTable) usesFigures = true;

      const tabularLines = [
        `  \\begin{tabular}{${colSpec || 'l'.repeat(headerRow.length)}}`,
        `    ${topRule}`,
        `    ${fmtRow(headerRow)}`,
        `    ${midRule}`,
        ...bodyRows.map((row) => `    ${fmtRow(row)}`),
        `    ${botRule}`,
        '  \\end{tabular}',
      ];

      const tblLines = ['\\begin{table}[htbp]', '  \\centering'];
      if (tableCaption) {
        const capLatex = transpileInline(tableCaption, opts, citedKeysSet, () => {
          usesMath = true;
        });
        tblLines.push(`  \\caption{${capLatex}}`);
      }
      if (tableLabel) {
        tblLines.push(`  \\label{${tableLabel}}`);
      }
      if (isWideTable) {
        tblLines.push('{\\footnotesize\\setlength{\\tabcolsep}{4pt}');
        tblLines.push('\\resizebox{\\textwidth}{!}{%');
        tblLines.push(...tabularLines);
        tblLines.push('}}');
      } else {
        tblLines.push(...tabularLines);
      }
      tblLines.push('\\end{table}');
      out.push(tblLines.join('\n'));
      continue;
    }

    // 7. Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      const figRefs: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[-*+]\s+/, '');
        items.push(
          `  \\item ${transpileInline(
            itemText,
            opts,
            citedKeysSet,
            () => {
              usesMath = true;
            },
            figRefs
          )}`
        );
        i++;
      }
      out.push(`\\begin{itemize}\n${items.join('\n')}\n\\end{itemize}`);
      emitUnembeddedFolderFigures(figRefs, opts, emittedSet, out, () => {
        usesFigures = true;
      });
      continue;
    }

    // 8. Ordered list
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      const figRefs: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^\d+[.)]\s+/, '');
        items.push(
          `  \\item ${transpileInline(
            itemText,
            opts,
            citedKeysSet,
            () => {
              usesMath = true;
            },
            figRefs
          )}`
        );
        i++;
      }
      out.push(`\\begin{enumerate}\n${items.join('\n')}\n\\end{enumerate}`);
      emitUnembeddedFolderFigures(figRefs, opts, emittedSet, out, () => {
        usesFigures = true;
      });
      continue;
    }

    // 9. Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      const figRefs: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      const qLatex = transpileInline(
        quoteLines.join(' '),
        opts,
        citedKeysSet,
        () => {
          usesMath = true;
        },
        figRefs
      );
      out.push(`\\begin{quote}\n${qLatex}\n\\end{quote}`);
      emitUnembeddedFolderFigures(figRefs, opts, emittedSet, out, () => {
        usesFigures = true;
      });
      continue;
    }

    // 10. Regular paragraph (merge consecutive plain lines)
    const paraLines: string[] = [];
    const figRefs: string[] = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (
        t === '' ||
        t.startsWith('#') ||
        t.startsWith('$$') ||
        t.startsWith('```') ||
        t.startsWith('>') ||
        t.startsWith('|') ||
        /^(?:---+|___+|\*\*\*+)$/.test(t) ||
        /^(?:-\s+){2,}-$/.test(t) ||
        /^!\[/.test(t) ||
        /^@(fig:[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)(?:\s*\{[^}]*\})?(?:\s*:\s*.+?|\s+\[[^[\]\n]+\])?\s*$/.test(t) ||
        /^[-*+]\s+/.test(t) ||
        /^\d+[.)]\s+/.test(t) ||
        /^(?:Table(?:\s+\d+)?:|\*\*Table(?:\s+\d+)?[.:])/i.test(t)
      ) {
        break;
      }
      paraLines.push(t);
      i++;
    }
    const paraLatex = transpileInline(
      paraLines.join(' '),
      opts,
      citedKeysSet,
      () => {
        usesMath = true;
      },
      figRefs
    );
    out.push(paraLatex);
    emitUnembeddedFolderFigures(figRefs, opts, emittedSet, out, () => {
      usesFigures = true;
    });
  }

  return {
    latex: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    usesFigures,
    usesTables,
    usesMath,
    citedKeys: Array.from(citedKeysSet),
  };
}

function splitTableRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map((c) => c.trim());
}

/**
 * Transpiles inline Markdown constructs while protecting inline math (`$...$`),
 * citations (`[@key]`), cross-references (`@fig:id`), and inline code.
 */
function transpileInline(
  text: string,
  opts: TranspileOptions,
  citedKeys: Set<string>,
  onMath: () => void,
  referencedFigLabels?: string[]
): string {
  // Tokenize protected spans so escaping & formatting never corrupt math/code/citations
  const placeholders: string[] = [];
  const stash = (latex: string): string => {
    const token = `\uE000MTX${placeholders.length}\uE001`;
    placeholders.push(latex);
    return token;
  };

  let working = text;

  // 1. Inline math `$...$` (not `$$`)
  working = working.replace(/(?<!\\)\$(?!\$)([^$\n]+?)(?<!\\)\$/g, (_m, expr: string) => {
    onMath();
    return stash(`$${sanitizeLatexMath(expr, false)}$`);
  });

  // 2. Inline code `` `...` ``
  working = working.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    return stash(`\\texttt{${escapeLatexText(code)}}`);
  });

  // 3. Bracketed citations: `[@key1; @key2]` or `[see @key, p. 12]`
  working = working.replace(/\[([^[\]\n]*@[a-zA-Z0-9_.:-]+[^[\]\n]*)\]/g, (_m, inner: string) => {
    const items = inner.split(';').map((p) => p.trim()).filter(Boolean);
    const keys: string[] = [];
    let prefix = '';
    let suffix = '';

    for (let idx = 0; idx < items.length; idx++) {
      const part = items[idx];
      const m = /^(.*?)-?@([a-zA-Z0-9_.:-]+)(.*)$/.exec(part);
      if (m) {
        if (idx === 0 && m[1].trim()) prefix = m[1].trim();
        keys.push(m[2]);
        citedKeys.add(m[2]);
        if (idx === items.length - 1 && m[3].trim()) {
          suffix = m[3].trim().replace(/^,\s*/, '');
        }
      }
    }
    if (keys.length === 0) return _m;

    const cmd = chooseCitationCmd(opts, false);
    if (prefix && suffix) {
      return stash(`\\${cmd}[${escapeLatexText(prefix)}][${escapeLatexText(suffix)}]{${keys.join(',')}}`);
    }
    if (suffix) {
      return stash(`\\${cmd}[${escapeLatexText(suffix)}]{${keys.join(',')}}`);
    }
    if (prefix) {
      return stash(`\\${cmd}[${escapeLatexText(prefix)}][]{${keys.join(',')}}`);
    }
    return stash(`\\${cmd}{${keys.join(',')}}`);
  });

  // 4. Cross-references: `@fig:foo`, `@tbl:bar`, `@eq:baz`, `@sec:intro`
  working = working.replace(
    /(?<![a-zA-Z0-9_])@((?:fig|tbl|eq|sec):[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)/g,
    (_m, label: string) => {
    if (label.startsWith('fig:')) referencedFigLabels?.push(label);
    if (opts.useCleveref) {
      return stash(`\\cref{${label}}`);
    }
    if (label.startsWith('fig:')) return stash(`Fig.~\\ref{${label}}`);
    if (label.startsWith('tbl:')) return stash(`Table~\\ref{${label}}`);
    if (label.startsWith('eq:')) return stash(`Eq.~(\\ref{${label}})`);
    return stash(`Section~\\ref{${label}}`);
  });

  // 5. Narrative inline citation `@smith2024` (when not an email address)
  working = working.replace(/(?<![a-zA-Z0-9_.+-])@([a-zA-Z][a-zA-Z0-9_:-]{2,})/g, (_m, key: string) => {
    citedKeys.add(key);
    const cmd = chooseCitationCmd(opts, true);
    return stash(`\\${cmd}{${key}}`);
  });

  // 6. Markdown links `[label](url)`
  working = working.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_m, label: string, url: string) => {
    return stash(`\\href{${url}}{${escapeLatexText(label)}}`);
  });

  // 6b. Underline HTML tags `<u>...</u>` before escaping `<` / `>` in prose
  working = working.replace(/<u>(.+?)<\/u>/gi, (_m, inner: string) => {
    return stash(`\\underline{${escapeLatexText(decodeBasicHtmlEntities(inner))}}`);
  });

  // 7. Protect literal escaped asterisks `\*`, decode HTML entities & CommonMark escapes
  //    produced by TipTap's Markdown serializer, then escape plain prose for LaTeX
  working = working.replace(/\\\*/g, () => stash('*'));
  working = decodeBasicHtmlEntities(working);
  working = working.replace(/\\([\\`_[\]~{}#&%$^!])/g, '$1');
  working = escapeLatexText(working);

  // 8. Bold + Italic, Bold, Italic, Superscript, Subscript
  working = working.replace(/\*\*\*(.+?)\*\*\*/g, '\\textbf{\\textit{$1}}');
  working = working.replace(/\*\*(.+?)\*\*/g, '\\textbf{$1}');
  working = working.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '\\textit{$1}');
  working = working.replace(/\\textasciicircum\{\}([^\s\\]+?)\\textasciicircum\{\}/g, '\\textsuperscript{$1}');
  working = working.replace(/\\textasciitilde\{\}([^\s\\]+?)\\textasciitilde\{\}/g, '\\textsubscript{$1}');

  // 9. Restore protected tokens
  working = working.replace(/\uE000MTX(\d+)\uE001/g, (_m, idxStr: string) => placeholders[Number(idxStr)] ?? '');

  return working;
}
