import DOMPurify from 'dompurify';
import katex from 'katex';
import { marked } from 'marked';
import type { BibEntry, CitationStyle } from '../types/citation';
import type { PaperFrontMatter } from '../types/paper';
import { extractCitedKeysFromMarkdown } from '../citations/bibtex';
import { buildBibliographyOrder, formatInlineCitation } from '../citations/cslFormatter';
import { indexPaperElements } from './paperOutline';

function renderKatexSafe(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex.trim(), {
      displayMode,
      throwOnError: false,
      strict: false,
    });
  } catch {
    return `<code class="math-error">${escapeHtml(tex)}</code>`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface AcademicPreviewInput {
  frontMatter?: PaperFrontMatter;
  sections: { id: string; title: string; markdown: string }[];
  bibEntries: BibEntry[];
  citationStyle: CitationStyle;
  /** Optional map of relative figure paths -> data URLs for desktop image preview */
  imageDataUrls?: Record<string, string>;
  includeFrontMatter?: boolean;
  includeReferences?: boolean;
}

/**
 * Renders one or more paper sections into sanitized, publication-styled Academic HTML
 * with live KaTeX equations, auto-numbered figures/tables/cross-refs, CSL citations,
 * and an automatically compiled References list.
 */
export function renderAcademicPreviewHtml(input: AcademicPreviewInput): string {
  const {
    frontMatter,
    sections,
    bibEntries,
    citationStyle,
    imageDataUrls = {},
    includeFrontMatter = false,
    includeReferences = true,
  } = input;

  // Build global citation numbering & figure/table/equation cross-ref map
  const allCitedKeys: string[] = [];
  for (const s of sections) {
    allCitedKeys.push(...extractCitedKeysFromMarkdown(s.markdown));
  }
  const bib = buildBibliographyOrder(allCitedKeys, bibEntries, citationStyle);
  const elements = indexPaperElements(sections);
  const labelMap = new Map(elements.map((e) => [e.label, e]));

  const htmlParts: string[] = [];

  if (includeFrontMatter && frontMatter) {
    const affilNums = new Map<string, number>();
    frontMatter.affiliations.forEach((a, idx) => affilNums.set(a.id, idx + 1));
    const authorsHtml = frontMatter.authors
      .map((a) => {
        const nums = a.affiliationIds
          .map((id) => affilNums.get(id))
          .filter((n): n is number => n !== undefined)
          .join(',');
        const star = a.corresponding ? '*' : '';
        return `<span class="preview-author">${escapeHtml(`${a.firstName} ${a.lastName}`)}<sup>${nums}${star}</sup></span>`;
      })
      .join(', ');

    const affilsHtml = frontMatter.affiliations
      .map((a, idx) => {
        const line = [a.department, a.institution, a.city, a.country].filter(Boolean).join(', ');
        return `<div class="preview-affil"><sup>${idx + 1}</sup> ${escapeHtml(line)}</div>`;
      })
      .join('');

    const kwHtml =
      frontMatter.keywords.length > 0
        ? `<div class="preview-keywords"><strong>Keywords:</strong> ${escapeHtml(frontMatter.keywords.join(' · '))}</div>`
        : '';

    htmlParts.push(`
      <header class="academic-frontmatter">
        <h1 class="academic-paper-title">${escapeHtml(frontMatter.title || 'Untitled Manuscript')}</h1>
        <div class="academic-authors">${authorsHtml}</div>
        <div class="academic-affiliations">${affilsHtml}</div>
        ${kwHtml}
      </header>
    `);
  }

  let figCounter = 0;
  let tblCounter = 0;
  let eqCounter = 0;

  for (const sec of sections) {
    const tokens: string[] = [];
    const stash = (html: string) => {
      const idx = tokens.length;
      tokens.push(html);
      return `MIRTEXHTMLTOKEN${idx}END`;
    };

    let md = sec.markdown.replace(/\r\n/g, '\n');

    // 1. Raw LaTeX fenced blocks -> styled preview block
    md = md.replace(/```(?:latex-raw|tex-raw|raw-latex)\n([\s\S]*?)```/gi, (_m, raw: string) =>
      stash(`<pre class="raw-latex-preview"><code>${escapeHtml(raw.trim())}</code></pre>`)
    );

    // 2. Display Math $$ ... $$ {#eq:label}
    md = md.replace(/\$\$([\s\S]*?)\$\$(?:\s*\{#(eq:[^}\s]+)\})?/g, (_m, tex: string, label?: string) => {
      eqCounter++;
      const rendered = renderKatexSafe(tex, true);
      const numTag = `<span class="eq-number">(${eqCounter})</span>`;
      return stash(
        `<div class="academic-equation" data-label="${escapeHtml(label || '')}">${rendered}${numTag}</div>`
      );
    });

    // 3. Inline Math $...$
    md = md.replace(/(?<!\\)\$(?!\$)([^$\n]+?)(?<!\\)\$/g, (_m, tex: string) =>
      stash(`<span class="academic-inline-math">${renderKatexSafe(tex, false)}</span>`)
    );

    // 4. Figures ![Caption](path){#fig:id width=0.8}
    md = md.replace(
      /^!\[([^\]]*)\]\(([^)]+)\)(?:\{([^}]*)\})?\s*$/gm,
      (_m, caption: string, srcPath: string, attrs = '') => {
        figCounter++;
        const widthMatch = /width=([0-9.]+)/.exec(attrs);
        const pct = widthMatch ? `${Math.round(Number(widthMatch[1]) * 100)}%` : '85%';
        const cleanSrc = srcPath.trim().replace(/\\/g, '/');
        const resolved = imageDataUrls[cleanSrc] || imageDataUrls[cleanSrc.split('/').pop() || ''];
        const imgTag = resolved
          ? `<img src="${resolved}" alt="${escapeHtml(caption)}" style="max-width:${pct}" />`
          : `<div class="figure-placeholder">Figure image: <code>${escapeHtml(cleanSrc)}</code></div>`;
        return stash(
          `<figure class="academic-figure">${imgTag}<figcaption><strong>Figure ${figCounter}.</strong> ${escapeHtml(caption)}</figcaption></figure>`
        );
      }
    );

    // 5. Table caption line
    md = md.replace(/^Table:\s*(.+?)(?:\s*\{#([^}\s]+)\})?\s*$/gim, (_m, caption: string) => {
      tblCounter++;
      return stash(
        `<div class="academic-table-caption"><strong>Table ${tblCounter}.</strong> ${escapeHtml(caption.trim())}</div>`
      );
    });

    // 6. Bracketed citations [@a; @b]
    md = md.replace(/\[([^\]]*@[a-zA-Z0-9_.:-]+[^\]]*)\]/g, (_m, inner: string) => {
      const keys: string[] = [];
      const keyRe = /@([a-zA-Z0-9_.:-]+)/g;
      let km: RegExpExecArray | null;
      while ((km = keyRe.exec(inner)) !== null) {
        if (!/^(?:fig|tbl|eq|sec):/.test(km[1])) keys.push(km[1]);
      }
      if (keys.length === 0) return _m;
      const formatted = formatInlineCitation(keys, bibEntries, citationStyle, bib.numberMap, false);
      const isMissing = keys.some((k) => !bibEntries.some((e) => e.key === k));
      return stash(
        `<span class="cite-pill ${isMissing ? 'cite-missing' : ''}" title="${escapeHtml(keys.join(', '))}">${escapeHtml(formatted)}</span>`
      );
    });

    // 7. Cross-references @fig:foo, @tbl:bar, @eq:baz, @sec:intro
    md = md.replace(/(?<![a-zA-Z0-9_])@((?:fig|tbl|eq|sec):[a-zA-Z0-9_.-]+)/g, (_m, label: string) => {
      const el = labelMap.get(label);
      if (!el) {
        return stash(`<span class="ref-pill ref-missing" title="Unresolved reference">@${escapeHtml(label)}</span>`);
      }
      const text =
        el.kind === 'figure'
          ? `Figure ${el.number}`
          : el.kind === 'table'
            ? `Table ${el.number}`
            : el.kind === 'equation'
              ? `Eq. (${el.number})`
              : `Section ${el.number}`;
      return stash(`<span class="ref-pill" title="${escapeHtml(el.title)}">${escapeHtml(text)}</span>`);
    });

    // 8. Narrative citations @smith2024
    md = md.replace(/(?<![a-zA-Z0-9_.+-])@([a-zA-Z][a-zA-Z0-9_:-]{2,})/g, (_m, key: string) => {
      const formatted = formatInlineCitation([key], bibEntries, citationStyle, bib.numberMap, true);
      const isMissing = !bibEntries.some((e) => e.key === key);
      return stash(
        `<span class="cite-pill ${isMissing ? 'cite-missing' : ''}" title="${escapeHtml(key)}">${escapeHtml(formatted)}</span>`
      );
    });

    // 9. Strip trailing `{#sec:...}` on headings
    md = md.replace(/^(#{1,4}\s+.+?)\s*\{#[^}\s]+\}\s*$/gm, '$1');

    // 10. Convert Markdown to HTML via marked
    let html = marked.parse(md, { async: false }) as string;

    // Restore stashed HTML tokens
    html = html.replace(/MIRTEXHTMLTOKEN(\d+)END/g, (_m, idxStr: string) => tokens[Number(idxStr)] ?? '');

    htmlParts.push(`<section class="academic-section">${html}</section>`);
  }

  if (includeReferences && bib.references.length > 0) {
    const items = bib.references
      .map((r) => `<li class="ref-entry">${escapeHtml(r.formatted)}</li>`)
      .join('');
    htmlParts.push(`
      <section class="academic-references">
        <h2>References</h2>
        <ul class="ref-list">${items}</ul>
      </section>
    `);
  }

  return DOMPurify.sanitize(htmlParts.join('\n'), {
    ADD_TAGS: ['math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac', 'msqrt', 'mtext', 'annotation'],
    ADD_ATTR: ['style', 'class', 'title', 'data-label', 'aria-hidden'],
  });
}
