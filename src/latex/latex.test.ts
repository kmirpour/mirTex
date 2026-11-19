import { describe, expect, it } from 'vitest';
import { scanLatexTemplate } from './templateScanner';
import { markdownToLatex } from './markdownToLatex';
import { patchLatexTemplate, resolveSlotMapping } from './templatePatcher';
import { SPRINGER_NATURE_COMPAT_TEX, SPRINGER_NATURE_SNJNL_TEX, IEEE_TRAN_TEX } from './builtinTemplates';
import { createDefaultFrontMatter, type PaperSection } from '../types/paper';

describe('LaTeX Template Scanner', () => {
  it('inspects Springer Nature sn-jnl template and extracts all front-matter and body slots', () => {
    const manifest = scanLatexTemplate(SPRINGER_NATURE_SNJNL_TEX, {
      id: 'sn-test',
      name: 'Springer Nature',
      entryFile: 'sn-article.tex',
    });

    expect(manifest.documentClass).toBe('sn-jnl');
    expect(manifest.detectedAdapter).toBe('sn-jnl');
    expect(manifest.bibSystem).toBe('bibtex');
    expect(manifest.citationDialect).toBe('natbib');

    const kinds = manifest.slots.map((s) => s.kind);
    expect(kinds).toContain('title');
    expect(kinds).toContain('authors');
    expect(kinds).toContain('abstract');
    expect(kinds).toContain('keywords');
    expect(kinds).toContain('section');
    expect(kinds).toContain('backmatter_heading');
    expect(kinds).toContain('declarations');
    expect(kinds).toContain('appendix');
    expect(kinds).toContain('bibliography');

    const abstractSlot = manifest.slots.find((s) => s.kind === 'abstract');
    expect(abstractSlot?.syntaxForm).toBe('command');

    const sectionTitles = manifest.slots
      .filter((s) => s.kind === 'section')
      .map((s) => s.sectionTitle);
    expect(sectionTitles).toEqual(['Introduction', 'Results', 'Discussion', 'Methods', 'Conclusion']);
  });

  it('inspects IEEEtran template including IEEEkeywords and bibliography style', () => {
    const manifest = scanLatexTemplate(IEEE_TRAN_TEX, { id: 'ieee' });
    expect(manifest.documentClass).toBe('IEEEtran');
    expect(manifest.detectedAdapter).toBe('IEEEtran');
    expect(manifest.bibStyle).toBe('IEEEtran');
    const kw = manifest.slots.find((s) => s.kind === 'keywords');
    expect(kw?.syntaxForm).toBe('environment');
    expect(kw?.commandName).toBe('IEEEkeywords');
  });
});

describe('Academic Markdown to LaTeX Transpiler', () => {
  it('escapes prose characters while preserving inline/display math, citations, and cross-refs', () => {
    const md = `# Introduction

Accuracy improved by 12.5% on dataset A_1 & B_2 [@vaswani2017; @lecun2015]. As shown by @he2016, the energy $E = m c^2 + \\alpha_1$ governs dynamics in @fig:curve and @eq:loss.

$$
\\mathcal{L} = \\sum_{i=1}^{N} (y_i - \\hat{y}_i)^2
$$ {#eq:loss}

![Training curve showing convergence.](figures/curve.png){#fig:curve width=0.75}

Table: Performance summary {#tbl:perf}
| Model | Score |
| :--- | ---: |
| Baseline | 81.2% |
| **MirTexNet** | 94.6% |
`;

    const res = markdownToLatex(md, {
      citationDialect: 'natbib',
      useBooktabs: true,
      stripTopH1: true,
    });

    expect(res.usesFigures).toBe(true);
    expect(res.usesTables).toBe(true);
    expect(res.usesMath).toBe(true);
    expect(res.citedKeys).toEqual(['vaswani2017', 'lecun2015', 'he2016']);
    expect(res.latex).toContain('12.5\\% on dataset A\\_1 \\& B\\_2 \\citep{vaswani2017,lecun2015}');
    expect(res.latex).toContain('\\citet{he2016}');
    expect(res.latex).toContain('$E = m c^2 + \\alpha_1$');
    expect(res.latex).toContain('Fig.~\\ref{fig:curve}');
    expect(res.latex).toContain('\\label{eq:loss}');
    expect(res.latex).toContain('\\includegraphics[width=0.75\\textwidth]{figures/curve.png}');
    expect(res.latex).toContain('\\toprule');
    expect(res.latex).toContain('\\textbf{MirTexNet}');
  });
});

describe('Non-Destructive Template Patcher (Springer Nature sn-jnl)', () => {
  it('injects frontmatter and sections into sn-jnl preserving preamble verbatim', () => {
    const manifest = scanLatexTemplate(SPRINGER_NATURE_SNJNL_TEX, { id: 'sn-jnl' });
    const fm = createDefaultFrontMatter('Cortical Dynamics of Visual Attention');
    fm.shortTitle = 'Cortical Dynamics';
    fm.authors = [
      {
        id: 'a1',
        firstName: 'Koorosh',
        lastName: 'Mirpour',
        email: 'km@lab.edu',
        affiliationIds: ['affil-1'],
        corresponding: true,
      },
    ];
    fm.keywords = ['neuroscience', 'attention', 'saccades'];

    const sections: PaperSection[] = [
      { id: 's-abs', title: 'Abstract', role: 'abstract', fileName: '01-abstract.md', path: '', status: 'draft' },
      { id: 's-intro', title: 'Introduction', role: 'introduction', fileName: '02-intro.md', path: '', status: 'draft' },
      { id: 's-meth', title: 'Methods', role: 'methods', fileName: '03-methods.md', path: '', status: 'draft' },
      { id: 's-res', title: 'Results', role: 'results', fileName: '04-results.md', path: '', status: 'draft' },
    ];

    const mapping = resolveSlotMapping(manifest, sections);
    expect(Object.values(mapping)).toContain('s-abs');
    expect(Object.values(mapping)).toContain('s-meth');

    const patched = patchLatexTemplate({
      manifest,
      frontMatter: fm,
      sections,
      sectionContents: {
        's-abs': '# Abstract\n\nWe investigate visual attention.',
        's-intro': '# Introduction\n\nAttention selects behaviorally relevant targets [@smith2024].',
        's-meth': '# Methods\n\nRecordings were obtained at 1 kHz.',
        's-res': '# Results\n\nFiring rate increased by 40%.',
      },
      bibFileName: 'references',
    });

    expect(patched.texSource).toContain('\\documentclass[pdflatex,sn-mathphys-num]{sn-jnl}');
    expect(patched.texSource).toContain('\\title[Cortical Dynamics]{Cortical Dynamics of Visual Attention}');
    expect(patched.texSource).toContain('\\author*[1]{\\fnm{Koorosh} \\sur{Mirpour}}\\email{km@lab.edu}');
    expect(patched.texSource).toContain('\\abstract{We investigate visual attention.}');
    expect(patched.texSource).toContain('\\keywords{neuroscience, attention, saccades}');
    expect(patched.texSource).toContain('\\citep{smith2024}');
    expect(patched.texSource).toContain('40\\%');
    // Respects Springer Nature's template order: Results appears before Methods!
    expect(patched.texSource.indexOf('\\section{Results}')).toBeLessThan(
      patched.texSource.indexOf('\\section{Methods}')
    );
    expect(patched.citedKeys).toEqual(['smith2024']);
  });

  it('does not corrupt \\newcommand{\\keywords} or \\newcommand{\\bmhead} in preamble of Springer Nature Ready-to-Compile template', () => {
    const manifest = scanLatexTemplate(SPRINGER_NATURE_COMPAT_TEX, {
      id: 'springer-nature-compat',
      name: 'Springer Nature (Ready-to-Compile)',
    });

    const kwSlot = manifest.slots.find((s) => s.kind === 'keywords');
    expect(kwSlot).toBeDefined();
    // Must match \keywords{...} AFTER \begin{document}, NOT inside \newcommand{\keywords} in the preamble!
    expect(kwSlot!.start).toBeGreaterThan(manifest.documentBeginOffset);

    const bmSlot = manifest.slots.find((s) => s.kind === 'backmatter_heading');
    expect(bmSlot).toBeDefined();
    expect(bmSlot!.start).toBeGreaterThan(manifest.documentBeginOffset);

    const fm = createDefaultFrontMatter('Visual Attention Paper');
    fm.keywords = ['attention', 'cortex', 'mirtex'];
    const sections: PaperSection[] = [
      { id: 's-abs', title: 'Abstract', role: 'abstract', fileName: '01-abstract.md', path: '', status: 'draft' },
      { id: 's-intro', title: 'Introduction', role: 'introduction', fileName: '02-intro.md', path: '', status: 'draft' },
      { id: 's-ack', title: 'Acknowledgements', role: 'acknowledgments', fileName: '07-ack.md', path: '', status: 'draft' },
    ];

    const patched = patchLatexTemplate({
      manifest,
      frontMatter: fm,
      sections,
      sectionContents: {
        's-abs': '# Abstract\n\nConcise summary.',
        's-intro': '# Introduction\n\nBody text.',
        's-ack': '# Acknowledgements\n\nThanks to everyone.',
      },
    });

    // Preamble macro definitions must remain completely untouched
    expect(patched.texSource).toContain(
      '\\newcommand{\\keywords}[1]{\\par\\noindent\\textbf{Keywords:} #1\\par\\vspace{1em}}'
    );
    expect(patched.texSource).toContain('\\newcommand{\\bmhead}[1]{\\subsection*{#1}}');
    // Body slots must be cleanly filled after \begin{document}
    const body = patched.texSource.slice(patched.texSource.indexOf('\\begin{document}'));
    expect(body).toContain('\\keywords{attention, cortex, mirtex}');
    expect(body).toContain('\\bmhead{Acknowledgements}');
    expect(body).toContain('Thanks to everyone.');
  });
});
