/**
 * Normalizes Markdown serialized by TipTap 3 (`@tiptap/markdown`), whose
 * `escapeMarkdownSyntax()` escapes `[\\`*_[\]~]` with leading backslashes
 * inside plain text nodes (e.g. `[@Chilukuri_2026]` -> `\[@Chilukuri\_2026\]`,
 * `@Mirpour_2024` -> `@Mirpour\_2024`, `$E = \alpha_1$` -> `$E = \\alpha\_1$`).
 *
 * Restores clean, standard academic Markdown for citations, cross-references,
 * math expressions, figure/table/equation attribute blocks, and figure embeds.
 */
export function normalizeAcademicMarkdown(markdown: string): string {
  if (!markdown) return '';

  // Protect fenced code blocks and inline code spans from normalization
  const fences: string[] = [];
  let text = markdown.replace(/\r\n/g, '\n').replace(/```[\s\S]*?```/g, (block) => {
    const idx = fences.length;
    fences.push(block);
    return `\uE010FENCE${idx}\uE011`;
  });

  const inlineCodes: string[] = [];
  text = text.replace(/`[^`\n]+`/g, (span) => {
    const idx = inlineCodes.length;
    inlineCodes.push(span);
    return `\uE010CODE${idx}\uE011`;
  });

  // Decode TipTap HTML entities (&lt;, &gt;, &amp;, &quot;) across prose, captions, tables, and math
  text = decodeBasicHtmlEntities(text);

  // 1. Display math $$ ... $$ (multi-line or single-line)
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_m, inner: string) => {
    return `$$${unescapeMathInner(inner)}$$`;
  });

  // 2. Inline math $ ... $ (not $$)
  text = text.replace(/(?<!\\)\$(?!\$)([^$\n]+?)(?<!\\)\$/g, (_m, inner: string) => {
    return `$${unescapeMathInner(inner)}$`;
  });

  // 3. Figure embeds (supporting nested [...] tags inside captions and TipTap escapes)
  text = text.replace(
    /\\?!\\?\[((?:\\[^\n]|[^\\[\]\n]|\[(?:\\[^\n]|[^\\[\]\n])*\])*?)\\?\]\(([^)\n]+)\)(?:\\?\{([^}\n]*?)\\?\})?/g,
    (_m, caption: string, imgPath: string, attrs?: string) => {
      const capMath: string[] = [];
      const capProtected = caption.replace(/(?<!\\)\$(?!\$)([^$\n]+?)(?<!\\)\$/g, (m) => {
        const idx = capMath.length;
        capMath.push(m);
        return `\uE010CMATH${idx}\uE011`;
      });
      const cleanCap = capProtected
        .replace(/\\([\\`*_[\]~])/g, '$1')
        .replace(/\\$/, '')
        .replace(/\uE010CMATH(\d+)\uE011/g, (_mm, idxStr: string) => capMath[Number(idxStr)] ?? '');
      const cleanPath = imgPath.replace(/\\([_~-])/g, '$1').replace(/\\$/, '');
      if (attrs !== undefined) {
        const cleanAttrs = attrs.replace(/\\([_~#-])/g, '$1').replace(/\\$/, '');
        return `![${cleanCap}](${cleanPath}){${cleanAttrs}}`;
      }
      return `![${cleanCap}](${cleanPath})`;
    }
  );

  // 4. Bracketed citations: \[@Chilukuri\_2026; @Mirpour\_2024\] (linear-time, no backtracking)
  text = text.replace(/\\?\[([^[\]\n]+?)\\?\]/g, (full, inner: string) => {
    if (!/@[a-zA-Z0-9_.:+-]/.test(inner)) return full;
    const cleaned = inner
      .replace(/\\([_~*[\]-])/g, '$1')
      .replace(/\\$/, '');
    return `[${cleaned}]`;
  });

  // 5. Cross-references & narrative citations: @fig:my\_plot, @Mirpour\_2024
  text = text.replace(
    /(?<![a-zA-Z0-9_.+-])@((?:(?:fig|tbl|eq|sec):)?[a-zA-Z0-9](?:\\[_-]|[a-zA-Z0-9_.:-])*)/g,
    (_m, key: string) => {
      return `@${key.replace(/\\([_-])/g, '$1')}`;
    }
  );

  // 6. Attribute blocks: {#eq:my\_eq}, {#tbl:my\_tbl}, {#sec:my\_sec}
  text = text.replace(/\\?\{#([^}\s\n][^}\n]*?)\\?\}/g, (_m, inner: string) => {
    return `{#${inner.replace(/\\([_-])/g, '$1').replace(/\\$/, '')}}`;
  });

  // Restore inline code spans and fenced code blocks
  text = text.replace(
    /\uE010CODE(\d+)\uE011/g,
    (_m, idx: string) => inlineCodes[Number(idx)] ?? ''
  );
  text = text.replace(/\uE010FENCE(\d+)\uE011/g, (_m, idx: string) => fences[Number(idx)] ?? '');

  return text;
}

/** Decodes the HTML entities emitted by TipTap's `encodeHtmlEntities()` (`&amp;`, `&lt;`, `&gt;`, `&quot;`). */
export function decodeBasicHtmlEntities(text: string): string {
  let out = text;
  // Two passes also recover values that were previously double-encoded (e.g., `&amp;lt;`).
  for (let pass = 0; pass < 2; pass++) {
    const next = out
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&amp;/gi, '&');
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * Reverses TipTap's `encodeHtmlEntities()` + `escapeMarkdownSyntax()` inside math spans:
 * - `$p &lt; 0.01$` -> `$p < 0.01$`
 * - `$a &amp;= b$` -> `$a &= b$`
 * - `\\alpha\_1` -> `\alpha_1`
 * - `\\\\` (doubled from `\\`) -> `\\`
 */
function unescapeMathInner(inner: string): string {
  return decodeBasicHtmlEntities(inner)
    // 4 backslashes (TipTap escaping LaTeX `\\` line break) -> 2 backslashes
    .replace(/\\\\\\\\/g, '\\\\')
    // TipTap doubled backslash before a LaTeX command name (`\\alpha`, `\\sum`, `\\mathcal`)
    .replace(/\\\\([a-zA-Z])/g, '\\$1')
    // TipTap escaped subscript/star/brackets/tilde/backtick
    .replace(/\\([_*[\]~`])/g, '$1');
}
