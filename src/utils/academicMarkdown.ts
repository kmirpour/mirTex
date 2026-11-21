import DOMPurify from 'dompurify';
import katex from 'katex';
import { marked } from 'marked';
import type { BibEntry, CitationStyle } from '../types/citation';
import type { PaperFrontMatter, ProjectFigureFile } from '../types/paper';
import { extractCitedKeysFromMarkdown } from '../citations/bibtex';
import { buildBibliographyOrder, formatInlineCitation } from '../citations/cslFormatter';
import {
  cleanFigureCaption,
  findFolderFigure,
  splitInlineFiguresOntoOwnLines,
} from '../latex/markdownToLatex';
import { figureLabelFromFileName, indexPaperElements } from './paperOutline';
import { normalizeAcademicMarkdown } from './normalizeAcademicMarkdown';
import { sanitizeLatexMath } from '../latex/unicodeToLatex';

function buildPreviewFigureHtml(
  caption: string,
  cleanSrc: string,
  pct: string,
  figNum: number,
  imageDataUrls: Record<string, string>,
  renderCaptionHtml: (rawCaption: string) => string,
  resolvePlainText: (rawCaption: string) => string
): string {
  const resolved = imageDataUrls[cleanSrc] || imageDataUrls[cleanSrc.split('/').pop() || ''];
  const plainCaption = cleanFigureCaption(resolvePlainText(caption), cleanSrc);
  const cleanedCaption = plainCaption ? caption.trim() : '';
  const imgTag = resolved
    ? `<img src="${resolved}" alt="${escapeHtml(plainCaption || `Figure ${figNum}`)}" style="max-width:${pct}" />`
    : `<div class="figure-placeholder">Figure image: <code>${escapeHtml(cleanSrc)}</code></div>`;
  const capHtml = cleanedCaption
    ? `<strong>Figure ${figNum}:</strong> ${renderCaptionHtml(cleanedCaption)}`
    : `<strong>Figure ${figNum}</strong>`;
  return `<figure class="academic-figure">${imgTag}<figcaption>${capHtml}</figcaption></figure>`;
}

function renderKatexSafe(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(sanitizeLatexMath(tex.trim(), displayMode), {
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
  /** Discovered figure files in figures/ or figure/ folders */
  projectFigures?: ProjectFigureFile[];
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
    projectFigures = [],
    includeFrontMatter = false,
    includeReferences = true,
  } = input;

  // Build global citation numbering & figure/table/equation cross-ref map
  const allCitedKeys: string[] = [];
  const embeddedFigureLabels = new Set<string>();
  for (const s of sections) {
    allCitedKeys.push(...extractCitedKeysFromMarkdown(s.markdown));
    const normMd = normalizeAcademicMarkdown(s.markdown);
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
  const elements = indexPaperElements(sections, projectFigures);
  const labelMap = new Map<string, (typeof elements)[number]>();
  for (const e of elements) {
    labelMap.set(e.label, e);
    const lower = e.label.toLowerCase();
    if (!labelMap.has(lower)) labelMap.set(lower, e);
  }
  const emittedAutoFigures = new Set<string>();
  const renderedFigNums = new Map<string, number>();
  const pendingRefPills: string[] = [];

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
    const tokenPlainText: string[] = [];
    const stash = (html: string, plainText = '') => {
      const idx = tokens.length;
      tokens.push(html);
      tokenPlainText.push(plainText);
      return `MIRTEXHTMLTOKEN${idx}END`;
    };
    const restoreTokens = (inputHtml: string): string => {
      let out = inputHtml;
      for (let pass = 0; pass < 10 && out.includes('MIRTEXHTMLTOKEN'); pass++) {
        const next = out.replace(
          /MIRTEXHTMLTOKEN(\d+)END/g,
          (_m, idxStr: string) => tokens[Number(idxStr)] ?? ''
        );
        if (next === out) break;
        out = next;
      }
      return out;
    };
    const resolveTokensToPlainText = (text: string): string => {
      let out = text;
      for (let pass = 0; pass < 10 && out.includes('MIRTEXHTMLTOKEN'); pass++) {
        const next = out.replace(
          /MIRTEXHTMLTOKEN(\d+)END/g,
          (_m, idxStr: string) => tokenPlainText[Number(idxStr)] ?? ''
        );
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
        return stash(
          `<span class="cite-pill ${isMissing ? 'cite-missing' : ''}" title="${escapeHtml(keys.join(', '))}">${escapeHtml(formatted)}</span>`,
          formatted
        );
      });
      // Cross-references @fig:foo, @tbl:bar, @eq:baz, @sec:intro
      out = out.replace(
        /(?<![a-zA-Z0-9_])@((?:fig|tbl|eq|sec):[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)/g,
        (_m, label: string) => {
          const idx = pendingRefPills.length;
          pendingRefPills.push(label);
          return stash(`MIRTEXREFLINK${idx}END`, `@${label}`);
        }
      );
      // Narrative citations @smith2024
      out = out.replace(/(?<![a-zA-Z0-9_.+-])@([a-zA-Z][a-zA-Z0-9_:-]{2,})/g, (_m, key: string) => {
        const formatted = formatInlineCitation([key], bibEntries, citationStyle, bib.numberMap, true);
        const isMissing = !bibEntries.some((e) => e.key === key);
        return stash(
          `<span class="cite-pill ${isMissing ? 'cite-missing' : ''}" title="${escapeHtml(key)}">${escapeHtml(formatted)}</span>`,
          formatted
        );
      });
      return out;
    };
    const renderCaptionInlineHtml = (captionText: string): string => {
      const withRefs = replaceInlineCitationsAndRefs(captionText);
      const inlineHtml = marked.parseInline(withRefs, { async: false }) as string;
      return restoreTokens(inlineHtml);
    };

    let md = splitInlineFiguresOntoOwnLines(normalizeAcademicMarkdown(sec.markdown));

    // 1. Raw LaTeX fenced blocks -> styled preview block
    md = md.replace(/```(?:latex-raw|tex-raw|raw-latex)\n([\s\S]*?)```/gi, (_m, raw: string) =>
      stash(`<pre class="raw-latex-preview"><code>${escapeHtml(raw.trim())}</code></pre>`, raw.trim())
    );

    // 2. Display Math $$ ... $$ {#eq:label}
    md = md.replace(/\$\$([\s\S]*?)\$\$(?:\s*\{#(eq:[^}\s]+)\})?/g, (_m, tex: string, label?: string) => {
      eqCounter++;
      const rendered = renderKatexSafe(tex, true);
      const numTag = `<span class="eq-number">(${eqCounter})</span>`;
      return stash(
        `<div class="academic-equation" data-label="${escapeHtml(label || '')}">${rendered}${numTag}</div>`,
        tex.trim()
      );
    });

    // 3. Inline Math $...$
    md = md.replace(/(?<!\\)\$(?!\$)([^$\n]+?)(?<!\\)\$/g, (_m, tex: string) =>
      stash(`<span class="academic-inline-math">${renderKatexSafe(tex, false)}</span>`, tex.trim() || _m)
    );

    // 4. Figures ![Caption](path){#fig:id width=0.8} (with optional following Caption:/Figure: line)
    md = md.replace(
      /^!\[((?:[^[\]\n]|\[[^[\]\n]*\])*)\]\(([^)\n]+)\)(?:[ \t]*\{([^}\n]*)\})?(?:\n(?:[ \t]*\n)?(?:Caption|Figure):[ \t]*(.+?))?[ \t]*$/gim,
      (_m, caption: string, srcPath: string, attrs = '', nextCap?: string) => {
        figCounter++;
        const cleanSrc = srcPath.trim().replace(/\\/g, '/').replace(/^\.\//, '');
        const lblMatch = /#(fig:[a-zA-Z0-9_.-]+)/.exec(attrs);
        if (lblMatch) {
          renderedFigNums.set(lblMatch[1], figCounter);
          renderedFigNums.set(lblMatch[1].toLowerCase(), figCounter);
        }
        const derivedLbl = figureLabelFromFileName(cleanSrc);
        renderedFigNums.set(derivedLbl, figCounter);
        renderedFigNums.set(derivedLbl.toLowerCase(), figCounter);
        const rawStem = (cleanSrc.split('/').pop() || '').replace(/\.[^.]+$/, '');
        if (rawStem) {
          renderedFigNums.set(`fig:${rawStem}`, figCounter);
          renderedFigNums.set(`fig:${rawStem.toLowerCase()}`, figCounter);
        }
        renderedFigNums.set(cleanSrc.toLowerCase(), figCounter);
        const widthMatch = /width=([0-9.]+)/.exec(attrs);
        const pct = widthMatch ? `${Math.round(Number(widthMatch[1]) * 100)}%` : '85%';
        const effectiveCaption = nextCap !== undefined ? nextCap : caption;
        return stash(
          buildPreviewFigureHtml(
            effectiveCaption,
            cleanSrc,
            pct,
            figCounter,
            imageDataUrls,
            renderCaptionInlineHtml,
            resolveTokensToPlainText
          )
        );
      }
    );

    // 4b. Auto-render referenced folder figures from figures/ or figure/ when not explicitly embedded
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
        figCounter++;
        renderedFigNums.set(label, figCounter);
        renderedFigNums.set(lblKey, figCounter);
        renderedFigNums.set(normLblKey, figCounter);
        renderedFigNums.set(fig.label, figCounter);
        renderedFigNums.set(figLblKey, figCounter);
        const widthMatch = /width=([0-9.]+)/.exec(attrs);
        const pct = widthMatch ? `${Math.round(Number(widthMatch[1]) * 100)}%` : '85%';
        return stash(
          buildPreviewFigureHtml(
            explicitCaption,
            fig.relPath,
            pct,
            figCounter,
            imageDataUrls,
            renderCaptionInlineHtml,
            resolveTokensToPlainText
          )
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
          return tryAutoFigure(label, attrs, cap) ?? full;
        }
      );

      md = md
        .split(/\n{2,}/)
        .map((block) => {
          const refRe = /(?<![a-zA-Z0-9_])@(fig:[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)/g;
          const extraFigs: string[] = [];
          let rm: RegExpExecArray | null;
          while ((rm = refRe.exec(block)) !== null) {
            const figHtml = tryAutoFigure(rm[1]);
            if (figHtml) extraFigs.push(figHtml);
          }
          return extraFigs.length > 0 ? `${block}\n\n${extraFigs.join('\n\n')}` : block;
        })
        .join('\n\n');
    }

    // 5. Table caption line (`Table: Caption`, `Table N: Caption`, or `**Table N. Caption**`)
    md = md.replace(
      /^(?:Table(?:\s+(\d+))?:\s*(.+?)(?:\s*\{#([^}\s]+)\})?|\*\*Table(?:\s+(\d+))?[.:]\s*(.+?)\*\*(?:\s*\{#([^}\s]+)\})?)[ \t]*$/gim,
      (_m, n1?: string, cap1?: string, _l1?: string, n2?: string, cap2?: string) => {
        tblCounter++;
        const displayNum = n1 || n2 || String(tblCounter);
        const caption = (cap1 ?? cap2 ?? '').trim();
        return stash(
          `<div class="academic-table-caption"><strong>Table ${escapeHtml(displayNum)}.</strong> ${renderCaptionInlineHtml(caption)}</div>`,
          `Table ${displayNum}. ${resolveTokensToPlainText(caption)}`
        );
      }
    );

    // 6-8. Bracketed citations, cross-references, and narrative citations
    md = replaceInlineCitationsAndRefs(md);

    // 9. Strip trailing `{#sec:...}` on headings
    md = md.replace(/^(#{1,4}\s+.+?)\s*\{#[^}\s]+\}\s*$/gm, '$1');

    // 10. Convert Markdown to HTML via marked
    let html = marked.parse(md, { async: false }) as string;

    // Restore stashed HTML tokens (unwrapping <p> wrappers around block-level HTML)
    html = restoreTokens(html);
    html = html.replace(
      /<p>\s*(<(figure|div|pre)\b[\s\S]*?<\/\2>)\s*<\/p>/g,
      '$1'
    );

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

  const resolvedHtml = htmlParts
    .join('\n')
    .replace(/MIRTEXREFLINK(\d+)END/g, (_m, idxStr: string) => {
      const label = pendingRefPills[Number(idxStr)] || '';
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
        return `<span class="ref-pill ref-missing" title="Unresolved reference">@${escapeHtml(label)}</span>`;
      }
      const num =
        el.kind === 'figure'
          ? (renderedFigNums.get(label) ??
            renderedFigNums.get(label.toLowerCase()) ??
            (normFigLbl ? renderedFigNums.get(normFigLbl) : undefined) ??
            renderedFigNums.get(el.label) ??
            renderedFigNums.get(el.label.toLowerCase()) ??
            el.number)
          : el.number;
      const text =
        el.kind === 'figure'
          ? `Figure ${num}`
          : el.kind === 'table'
            ? `Table ${num}`
            : el.kind === 'equation'
              ? `Eq. (${num})`
              : `Section ${num}`;
      const pillTitle = el.sectionId === 'figures-folder' ? text : el.title;
      return `<span class="ref-pill" title="${escapeHtml(pillTitle)}">${escapeHtml(text)}</span>`;
    });

  return DOMPurify.sanitize(resolvedHtml, {
    ADD_TAGS: ['math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac', 'msqrt', 'mtext', 'annotation'],
    ADD_ATTR: ['style', 'class', 'title', 'data-label', 'aria-hidden'],
  });
}
