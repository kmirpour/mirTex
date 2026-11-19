import type { CitationDialect } from '../types/latex';

export interface TranspileOptions {
  citationDialect: CitationDialect;
  citationCommandOverride?: 'auto' | 'cite' | 'citep' | 'autocite';
  useCleveref?: boolean;
  useBooktabs?: boolean;
  /** Strip a leading `# Heading` line when the template already supplies `\section{...}`. */
  stripTopH1?: boolean;
}

export interface TranspileResult {
  latex: string;
  usesFigures: boolean;
  usesTables: boolean;
  usesMath: boolean;
  citedKeys: string[];
}

/** Escapes special LaTeX characters in plain prose (never call on math or emitted commands). */
export function escapeLatexText(text: string): string {
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
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

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];

  let i = 0;
  let skippedFirstH1 = false;

  // Skip leading blank lines
  while (i < lines.length && lines[i].trim() === '') i++;

  // Optionally drop the top `# Section Title` since the template emits `\section{...}`
  if (opts.stripTopH1 && i < lines.length && /^#[ \t]+/.test(lines[i])) {
    skippedFirstH1 = true;
    i++;
    while (i < lines.length && lines[i].trim() === '') i++;
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

      if (label) {
        out.push(`\\begin{equation}\n\\label{${label}}\n${mathBody}\n\\end{equation}`);
      } else {
        out.push(`\\begin{equation}\n${mathBody}\n\\end{equation}`);
      }
      continue;
    }

    // 4. Headings (# / ## / ### / ####) with optional {#sec:label}
    const headingMatch = /^(#{1,4})[ \t]+(.+?)(?:\s*\{#([^}\s]+)\})?\s*$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const titleLatex = transpileInline(headingMatch[2], opts, citedKeysSet, () => {
        usesMath = true;
      });
      const label = headingMatch[3];
      const cmd =
        level === 1
          ? 'section'
          : level === 2
            ? 'subsection'
            : level === 3
              ? 'subsubsection'
              : 'paragraph';
      out.push(`\\${cmd}{${titleLatex}}${label ? `\\label{${label}}` : ''}`);
      i++;
      continue;
    }

    // 5. Figure block: ![Caption](path){#fig:id width=0.8 wide=true}
    const figMatch = /^!\[([^\]]*)\]\(([^)]+)\)(?:\{([^}]*)\})?\s*$/.exec(trimmed);
    if (figMatch) {
      usesFigures = true;
      const captionRaw = figMatch[1];
      const imgPath = figMatch[2].trim().replace(/\\/g, '/');
      const attrStr = figMatch[3] || '';
      const labelMatch = /#([a-zA-Z0-9:_-]+)/.exec(attrStr);
      const widthMatch = /width=([0-9.]+)/.exec(attrStr);
      const wide = /wide=true/i.test(attrStr);
      const width = widthMatch ? widthMatch[1] : '0.85';
      const env = wide ? 'figure*' : 'figure';
      const captionLatex = transpileInline(captionRaw, opts, citedKeysSet, () => {
        usesMath = true;
      });
      const labelLine = labelMatch ? `\n  \\label{${labelMatch[1]}}` : '';
      out.push(
        `\\begin{${env}}[htbp]\n  \\centering\n  \\includegraphics[width=${width}\\textwidth]{${imgPath}}\n  \\caption{${captionLatex}}${labelLine}\n\\end{${env}}`
      );
      i++;
      continue;
    }

    // 6. Optional table caption line (`Table: Caption {#tbl:id}`) followed by pipe table
    let tableCaption: string | null = null;
    let tableLabel: string | null = null;
    const capMatch = /^Table:\s*(.+?)(?:\s*\{#([^}\s]+)\})?\s*$/i.exec(trimmed);
    if (capMatch && i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) {
      tableCaption = capMatch[1].trim();
      tableLabel = capMatch[2] || null;
      i++;
    }

    // Pipe table
    if (
      lines[i].trim().startsWith('|') &&
      i + 1 < lines.length &&
      /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1].trim())
    ) {
      usesTables = true;
      const headerRow = splitTableRow(lines[i]);
      const alignRow = splitTableRow(lines[i + 1]);
      i += 2;
      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        bodyRows.push(splitTableRow(lines[i]));
        i++;
      }

      // Check if a trailing caption line sits right below the table
      if (!tableCaption && i < lines.length) {
        const belowCap = /^Table:\s*(.+?)(?:\s*\{#([^}\s]+)\})?\s*$/i.exec(lines[i].trim());
        if (belowCap) {
          tableCaption = belowCap[1].trim();
          tableLabel = belowCap[2] || null;
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
      tblLines.push(`  \\begin{tabular}{${colSpec || 'l'.repeat(headerRow.length)}}`);
      tblLines.push(`    ${topRule}`);
      tblLines.push(`    ${fmtRow(headerRow)}`);
      tblLines.push(`    ${midRule}`);
      for (const row of bodyRows) {
        tblLines.push(`    ${fmtRow(row)}`);
      }
      tblLines.push(`    ${botRule}`);
      tblLines.push('  \\end{tabular}');
      tblLines.push('\\end{table}');
      out.push(tblLines.join('\n'));
      continue;
    }

    // 7. Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[-*+]\s+/, '');
        items.push(
          `  \\item ${transpileInline(itemText, opts, citedKeysSet, () => {
            usesMath = true;
          })}`
        );
        i++;
      }
      out.push(`\\begin{itemize}\n${items.join('\n')}\n\\end{itemize}`);
      continue;
    }

    // 8. Ordered list
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^\d+[.)]\s+/, '');
        items.push(
          `  \\item ${transpileInline(itemText, opts, citedKeysSet, () => {
            usesMath = true;
          })}`
        );
        i++;
      }
      out.push(`\\begin{enumerate}\n${items.join('\n')}\n\\end{enumerate}`);
      continue;
    }

    // 9. Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      const qLatex = transpileInline(quoteLines.join(' '), opts, citedKeysSet, () => {
        usesMath = true;
      });
      out.push(`\\begin{quote}\n${qLatex}\n\\end{quote}`);
      continue;
    }

    // 10. Regular paragraph (merge consecutive plain lines)
    const paraLines: string[] = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (
        t === '' ||
        t.startsWith('#') ||
        t.startsWith('$$') ||
        t.startsWith('```') ||
        t.startsWith('>') ||
        t.startsWith('|') ||
        /^!\[/.test(t) ||
        /^[-*+]\s+/.test(t) ||
        /^\d+[.)]\s+/.test(t) ||
        /^Table:/i.test(t)
      ) {
        break;
      }
      paraLines.push(t);
      i++;
    }
    const paraLatex = transpileInline(paraLines.join(' '), opts, citedKeysSet, () => {
      usesMath = true;
    });
    out.push(paraLatex);
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
  onMath: () => void
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
    return stash(`$${expr}$`);
  });

  // 2. Inline code `` `...` ``
  working = working.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    return stash(`\\texttt{${escapeLatexText(code)}}`);
  });

  // 3. Bracketed citations: `[@key1; @key2]` or `[see @key, p. 12]`
  working = working.replace(/\[([^\]]*@[a-zA-Z0-9_.:-]+[^\]]*)\]/g, (_m, inner: string) => {
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
  working = working.replace(/(?<![a-zA-Z0-9_])@((?:fig|tbl|eq|sec):[a-zA-Z0-9_.-]+)/g, (_m, label: string) => {
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

  // 7. Escape all remaining plain LaTeX special characters
  working = escapeLatexText(working);

  // 8. Bold + Italic, Bold, Italic, Underline, Superscript, Subscript
  working = working.replace(/\*\*\*(.+?)\*\*\*/g, '\\textbf{\\textit{$1}}');
  working = working.replace(/\*\*(.+?)\*\*/g, '\\textbf{$1}');
  working = working.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '\\textit{$1}');
  working = working.replace(/<u>(.+?)<\/u>/gi, '\\underline{$1}');
  working = working.replace(/\\textasciicircum\{\}([^\s\\]+?)\\textasciicircum\{\}/g, '\\textsuperscript{$1}');
  working = working.replace(/\\textasciitilde\{\}([^\s\\]+?)\\textasciitilde\{\}/g, '\\textsubscript{$1}');

  // 9. Restore protected tokens
  working = working.replace(/\uE000MTX(\d+)\uE001/g, (_m, idxStr: string) => placeholders[Number(idxStr)] ?? '');

  return working;
}
