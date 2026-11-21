import { describe, expect, it } from 'vitest';
import { scanLatexTemplate } from './templateScanner';
import { markdownToLatex } from './markdownToLatex';
import { patchLatexTemplate, resolveSlotMapping } from './templatePatcher';
import { SPRINGER_NATURE_COMPAT_TEX, SPRINGER_NATURE_SNJNL_TEX, IEEE_TRAN_TEX } from './builtinTemplates';
import { createDefaultFrontMatter, type PaperSection, type ProjectFigureFile } from '../types/paper';
import { renderAcademicPreviewHtml } from '../utils/academicMarkdown';
import { normalizeAcademicMarkdown } from '../utils/normalizeAcademicMarkdown';
import { indexPaperElements } from '../utils/paperOutline';
import { runPreFlightCheck } from '../utils/academicAnalysis';
import { parseBibTeX, serializeBibLibrary } from '../citations/bibtex';
import { unicodeToLatexText } from './unicodeToLatex';

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

  it('handles TipTap-escaped underscores and brackets in citations, cross-refs, and math', () => {
    // Exact string shape serialized by @tiptap/markdown when user types [@Chilukuri_2026] and @Mirpour_2024
    const tiptapEscapedMd =
      'Introduce the background, open scientific \\[@Chilukuri\\_2026\\] problem, and key hypotheses @Mirpour\\_2024 or contributions of this work. See @fig:my\\_plot and $E = \\\\alpha\\_1 + \\\\beta\\_2$.';

    const res = markdownToLatex(tiptapEscapedMd, {
      citationDialect: 'natbib',
      stripTopH1: true,
    });

    expect(res.citedKeys).toEqual(['Chilukuri_2026', 'Mirpour_2024']);
    expect(res.latex).toContain('\\citep{Chilukuri_2026}');
    expect(res.latex).toContain('\\citet{Mirpour_2024}');
    expect(res.latex).toContain('Fig.~\\ref{fig:my_plot}');
    expect(res.latex).toContain('$E = \\alpha_1 + \\beta_2$');
    expect(res.latex).not.toContain('\\textbackslash{}');
  });

  it('decodes TipTap HTML entities (&lt;, &gt;, &amp;) inside inline/display math and prose', () => {
    const tiptapMathMd =
      'Significant effect ($p &lt; 0.01$, $F &gt; 4.2$) in Group A &amp; B with raw p &lt; 0.05.\n\n$$\n\\begin{aligned}\na &amp;= b \\\\\nc &amp;&lt; d\n\\end{aligned}\n$$';

    const res = markdownToLatex(tiptapMathMd, { citationDialect: 'natbib' });
    expect(res.latex).toContain('$p < 0.01$');
    expect(res.latex).toContain('$F > 4.2$');
    expect(res.latex).toContain('Group A \\& B');
    expect(res.latex).toContain('p \\textless{} 0.05');
    expect(res.latex).toContain('a &= b');
    expect(res.latex).toContain('c &< d');
    expect(res.latex).not.toContain('&lt;');
    expect(res.latex).not.toContain('&gt;');
    expect(res.latex).not.toContain('&amp;');

    const previewHtml = renderAcademicPreviewHtml({
      sections: [{ id: 's1', title: 'Results', markdown: 'Significant ($p &lt; 0.01$ and $p &gt; 0.001$).' }],
      bibEntries: [],
      citationStyle: 'apa',
    });
    expect(previewHtml).toContain('katex');
    expect(previewHtml).not.toContain('katex-error');
    expect(previewHtml).not.toContain('&amp;lt;');
  });

  it('escapes bare % inside inline/display math ($-67.8%$) and converts Unicode Greek/math symbols for pdfLaTeX & LuaLaTeX', () => {
    const md =
      'Median change was $-67.8%$ (also $−67.8\\%$) in β-band (13–30 Hz) and α/γ power at 10 μV with $α ≤ β ± 0.5$ and p ≥ 0.05.';

    const res = markdownToLatex(md, { citationDialect: 'natbib' });
    expect(res.latex).toContain('$-67.8\\%$');
    expect(res.latex).toContain('$\\beta$-band (13--30 Hz)');
    expect(res.latex).toContain('$\\alpha$/$\\gamma$ power at 10 $\\mu$V');
    expect(res.latex).toContain('$\\alpha \\leq \\beta \\pm 0.5$');
    expect(res.latex).toContain('p $\\geq$ 0.05');
    // Must not double-escape already-escaped \%
    expect(res.latex).not.toContain('\\\\%');

    const previewHtml = renderAcademicPreviewHtml({
      sections: [{ id: 's1', title: 'Results', markdown: 'Median $-67.8%$ and $α ≤ β$.' }],
      bibEntries: [],
      citationStyle: 'apa',
    });
    expect(previewHtml).not.toContain('katex-error');
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
    // \bibliographystyle must NOT be swallowed by the preceding \section*{Declarations} slot!
    expect(body).toContain('\\bibliographystyle{unsrtnat}');
    expect(body).toContain('\\bibliography{references}');
    expect(body.indexOf('\\bibliographystyle{unsrtnat}')).toBeLessThan(
      body.indexOf('\\bibliography{references}')
    );
  });

  it('switches LaTeX natbib & bibliographystyle (and sn-jnl option) to APA author-year when selected', () => {
    const compatManifest = scanLatexTemplate(SPRINGER_NATURE_COMPAT_TEX, {
      id: 'springer-nature-compat',
    });
    const fm = createDefaultFrontMatter('PD Study');
    const sections: PaperSection[] = [
      { id: 's-intro', title: 'Introduction', role: 'introduction', fileName: '02-intro.md', path: '', status: 'draft' },
    ];

    const apaPatched = patchLatexTemplate({
      manifest: compatManifest,
      frontMatter: fm,
      sections,
      sectionContents: { 's-intro': '# Introduction\n\nText [@Chilukuri_2026].' },
      citationStyle: 'apa',
    });
    expect(apaPatched.texSource).toContain('\\usepackage[authoryear,round]{natbib}');
    expect(apaPatched.texSource).toContain('\\bibliographystyle{apalike}');

    const snManifest = scanLatexTemplate(SPRINGER_NATURE_SNJNL_TEX, { id: 'sn-jnl' });
    const snApa = patchLatexTemplate({
      manifest: snManifest,
      frontMatter: fm,
      sections,
      sectionContents: { 's-intro': '# Introduction\n\nText [@Chilukuri_2026].' },
      citationStyle: 'apa',
    });
    expect(snApa.texSource).toContain('\\documentclass[pdflatex,sn-apa]{sn-jnl}');
  });

  it('auto-emits folder figures referenced via @fig:, splits inline figure embeds, and relocates abstract figures', () => {
    const manifest = scanLatexTemplate(SPRINGER_NATURE_COMPAT_TEX, {
      id: 'springer-nature-compat',
    });
    const fm = createDefaultFrontMatter('Figure Rendering Study');
    const sections: PaperSection[] = [
      { id: 's-abs', title: 'Abstract', role: 'abstract', fileName: '01-abstract.md', path: '', status: 'draft' },
      { id: 's-intro', title: 'Introduction', role: 'introduction', fileName: '02-intro.md', path: '', status: 'draft' },
      { id: 's-res', title: 'Results', role: 'results', fileName: '03-results.md', path: '', status: 'draft' },
    ];
    const projectFigures: ProjectFigureFile[] = [
      { name: 'my_plot.png', relPath: 'figures/my_plot.png', label: 'fig:my-plot', title: 'my_plot.png' },
      { name: 'overview.pdf', relPath: 'figure/overview.pdf', label: 'fig:overview', title: 'overview.pdf' },
    ];

    const patched = patchLatexTemplate({
      manifest,
      frontMatter: fm,
      sections,
      sectionContents: {
        's-abs': '# Abstract\n\nSummary referencing ![Abstract chart](figures/abs.png){#fig:abs width=0.6}.',
        's-intro': '# Introduction\n\nAs shown in @fig:my-plot, convergence holds.\n\n@fig:overview',
        's-res': '# Results\n\nConsider the trend ![Training curve](figures/curve.png){#fig:curve width=0.75} in detail.',
      },
      projectFigures,
    });

    // Injects \graphicspath for figures/ and figure/
    expect(patched.texSource).toContain('\\graphicspath{{figures/}{figure/}{./}}');

    // Auto-emits folder figures referenced inline (@fig:my-plot) and standalone (@fig:overview)
    expect(patched.texSource).toContain('\\includegraphics[width=0.85\\textwidth]{figures/my_plot.png}');
    expect(patched.texSource).toContain('\\label{fig:my-plot}');
    expect(patched.texSource).toContain('Fig.~\\ref{fig:my-plot}');
    expect(patched.texSource).toContain('\\includegraphics[width=0.85\\textwidth]{figure/overview.pdf}');
    expect(patched.texSource).toContain('\\label{fig:overview}');

    // Splits inline ![...](...){...} onto its own figure block
    expect(patched.texSource).toContain('\\includegraphics[width=0.75\\textwidth]{figures/curve.png}');
    expect(patched.texSource).toContain('\\label{fig:curve}');

    // Relocates figures out of \begin{abstract}...\end{abstract} into the first body section
    const absMatch = /\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/.exec(patched.texSource);
    expect(absMatch).not.toBeNull();
    expect(absMatch![1]).not.toContain('\\begin{figure}');
    expect(patched.texSource).toContain('\\includegraphics[width=0.6\\textwidth]{figures/abs.png}');

    // Live academic preview renders both auto-figures and split inline embeds
    const previewHtml = renderAcademicPreviewHtml({
      sections: [
        { id: 's-intro', title: 'Introduction', markdown: 'As shown in @fig:my-plot, convergence holds.' },
        { id: 's-res', title: 'Results', markdown: 'Trend ![Training curve](figures/curve.png){#fig:curve width=0.75} here.' },
      ],
      bibEntries: [],
      citationStyle: 'nature',
      projectFigures,
      imageDataUrls: {
        'figures/my_plot.png': 'data:image/png;base64,AAA',
        'figures/curve.png': 'data:image/png;base64,BBB',
      },
    });
    expect(previewHtml).toContain('data:image/png;base64,AAA');
    expect(previewHtml).toContain('data:image/png;base64,BBB');
    expect(previewHtml).toContain('Figure 1');
    expect(previewHtml).toContain('<strong>Figure 2:</strong> Training curve');
    expect(previewHtml).not.toContain('my_plot.png');
    expect(previewHtml).not.toContain('my plot');
    expect(previewHtml).not.toContain('ref-missing');
  });

  it('strips filenames from figure captions and supports explicit captions via ![], @fig:label:, and Caption:', () => {
    const manifest = scanLatexTemplate(SPRINGER_NATURE_COMPAT_TEX, {
      id: 'springer-nature-compat',
    });
    const fm = createDefaultFrontMatter('Figure Caption Study');
    const sections: PaperSection[] = [
      { id: 's-intro', title: 'Introduction', role: 'introduction', fileName: '02-intro.md', path: '', status: 'draft' },
      { id: 's-res', title: 'Results', role: 'results', fileName: '03-results.md', path: '', status: 'draft' },
    ];
    const projectFigures: ProjectFigureFile[] = [
      { name: 'my_plot.png', relPath: 'figures/my_plot.png', label: 'fig:my-plot', title: 'my_plot.png' },
      { name: 'overview.pdf', relPath: 'figure/overview.pdf', label: 'fig:overview', title: 'overview.pdf' },
    ];

    const patched = patchLatexTemplate({
      manifest,
      frontMatter: fm,
      sections,
      sectionContents: {
        's-intro':
          '# Introduction\n\n@fig:overview: System architecture diagram\n\nAs shown in @fig:overview and @fig:trial-rate.',
        's-res':
          '# Results\n\n![my_plot.png](figures/my_plot.png){#fig:my-plot width=0.85}\n\n![Cortical firing rate across trials.](figures/rate.png){#fig:trial-rate width=0.85}\n\n![](figures/extra.png){#fig:extra}\n\nCaption: Neural decoding accuracy across sessions.',
      },
      projectFigures,
    });

    // Explicit caption syntax @fig:overview: ... and ![...](...)
    expect(patched.texSource).toContain('\\caption{System architecture diagram}');
    expect(patched.texSource).toContain('\\caption{Cortical firing rate across trials.}');
    expect(patched.texSource).toContain('\\caption{Neural decoding accuracy across sessions.}');

    // Filename in ![my_plot.png](...) is stripped so caption stays empty (never renders filename)
    expect(patched.texSource).toContain('\\caption{}\n  \\label{fig:my-plot}');
    expect(patched.texSource).not.toContain('\\caption{my\\_plot.png}');
    expect(patched.texSource).not.toContain('\\caption{my plot}');
    expect(patched.texSource).not.toContain('\\caption{overview.pdf}');

    // In-text references resolve cleanly
    expect(patched.texSource).toContain('Fig.~\\ref{fig:overview}');
    expect(patched.texSource).toContain('Fig.~\\ref{fig:trial-rate}');

    // Preview matches: renders Figure N: <caption text> or Figure N without filenames
    const previewHtml = renderAcademicPreviewHtml({
      sections: [
        { id: 's-intro', title: 'Introduction', markdown: '@fig:overview: System architecture diagram\n\nSee @fig:overview.' },
        { id: 's-res', title: 'Results', markdown: '![my_plot.png](figures/my_plot.png){#fig:my-plot}' },
      ],
      bibEntries: [],
      citationStyle: 'nature',
      projectFigures,
      imageDataUrls: {
        'figure/overview.pdf': 'data:image/png;base64,AAA',
        'figures/my_plot.png': 'data:image/png;base64,BBB',
      },
    });
    expect(previewHtml).toContain('<strong>Figure 1:</strong> System architecture diagram');
    expect(previewHtml).toContain('<strong>Figure 2</strong>');
    expect(previewHtml).not.toContain('my_plot.png');
    expect(previewHtml).not.toContain('overview.pdf');
    expect(previewHtml).toContain('>Figure 1<');
  });

  it('handles full-manuscript constructs without ReDoS, resolves unlabelled filename-stem @fig refs, wraps wide tables, and normalizes BibTeX Unicode', () => {
    // 1. Long figure caption (~1,200 chars) with many LaTeX backslashes, nested [amber]/[blue], and NO '@'
    //    (previously triggered catastrophic 2^30 backtracking in normalizeAcademicMarkdown)
    const longLatexCaption = Array.from({ length: 24 }, (_, idx) =>
      `Panel ${idx + 1} compares $\\text{cDBS}$ vs. $\\text{bDBS}$ ($\\Delta\\text{DI} = -0.880$, $\\rho = 0.917$, $p = 0.0037$, mean $\\pm$ SEM)`
    ).join('; ');
    const tiptapEscapedHeavySection = [
      '## 3. Results',
      '',
      '### 3.1 Clinical Motor Non-Inferiority',
      '',
      'Both paradigms improved outcomes \\[@karivPilotStudyAcute2024; @spix2021\\] (@fig:Figure1\\_StudyDesign\\_BetaSuppression A).',
      '',
      `!\\[Study Design \\[amber\\] and \\[blue\\] waveforms. ${longLatexCaption}.\\](figures/Figure1\\_StudyDesign\\_BetaSuppression.png)`,
      '',
      '---',
      '',
      '### 3.2 Second Subsection',
      '',
      'Further analysis of beta bursts ($<100\\text{ ms}$) is summarized in **Table 1**.',
    ].join('\n');

    const methodsSection = [
      '## 2. Materials and Methods',
      '',
      '**Table 1. Participant Clinical Characteristics, Recording Montage, and Intraoperative Scores**',
      '',
      '| Subject | Hemisphere &amp; Montage | Years Dx | Pre-op | Scores [Rig, Brad, Trem = Sum] | Blocks | Inclusion |',
      '| :--- | :--- | :--- | :--- | :--- | :--- | :--- |',
      '| S1 | Left GPi &amp; ECoG | 1 | 66 | Rest [2,2,0=4] | Rest (2) | Full |',
    ].join('\n');

    const bibRaw = `@article{brefel2020,
  author = {Brefel‐Courbon, Christine and Dest\u0065\u0301e, Alain and Wolf‐Julian, N.},
  title = {Deep brain stimulation effects on β bursts},
  journal = {Movement Disorders},
  year = {2020}
}`;

    const t0 = performance.now();
    const normRes = normalizeAcademicMarkdown(tiptapEscapedHeavySection);
    const normMeth = normalizeAcademicMarkdown(methodsSection);
    const elapsedMs = performance.now() - t0;

    expect(elapsedMs).toBeLessThan(200);
    expect(normRes).toContain('[@karivPilotStudyAcute2024; @spix2021]');
    expect(normRes).toContain('![Study Design [amber] and [blue] waveforms.');
    expect(normRes).toContain('(figures/Figure1_StudyDesign_BetaSuppression.png)');
    expect(normMeth).toContain('Hemisphere & Montage');
    expect(normMeth).not.toContain('&amp;');

    const folderFigs: ProjectFigureFile[] = [
      {
        name: 'Figure1_StudyDesign_BetaSuppression.png',
        relPath: 'figures/Figure1_StudyDesign_BetaSuppression.png',
        label: 'fig:figure1-studydesign-betasuppression',
        title: 'Figure1_StudyDesign_BetaSuppression.png',
      },
    ];
    const fm = createDefaultFrontMatter('Cortico-Pallidal Asymmetry');
    const sections: PaperSection[] = [
      { id: 's-res', title: 'Results', role: 'results', fileName: '03-results.md', path: '', status: 'draft' },
      { id: 's-meth', title: 'Methods', role: 'methods', fileName: '05-methods.md', path: '', status: 'draft' },
    ];
    const sectionContents = {
      's-res': normRes,
      's-meth': normMeth,
    };

    const elements = indexPaperElements(
      [
        { id: 's-res', title: 'Results', markdown: normRes },
        { id: 's-meth', title: 'Methods', markdown: normMeth },
      ],
      folderFigs
    );
    const indexedFigs = elements.filter((e) => e.kind === 'figure');
    expect(indexedFigs).toHaveLength(1);
    expect(indexedFigs[0].label).toBe('fig:figure1-studydesign-betasuppression');
    expect(elements.some((e) => e.kind === 'table' && e.title.includes('Participant Clinical Characteristics'))).toBe(true);

    const previewHtml = renderAcademicPreviewHtml({
      frontMatter: fm,
      sections: [
        { id: 's-res', title: 'Results', markdown: normRes },
        { id: 's-meth', title: 'Methods', markdown: normMeth },
      ],
      bibEntries: parseBibTeX(bibRaw),
      citationStyle: 'nature',
      projectFigures: folderFigs,
      imageDataUrls: {
        'figures/Figure1_StudyDesign_BetaSuppression.png': 'data:image/png;base64,FIG1DATA',
      },
    });
    expect(previewHtml).toContain('data:image/png;base64,FIG1DATA');
    expect(previewHtml).toContain('>Figure 1<');
    expect(previewHtml).not.toContain('ref-missing');
    expect(previewHtml).not.toContain('MIRTEXHTMLTOKEN');
    expect(previewHtml).not.toContain('MIRTEXREFLINK');
    expect(previewHtml).not.toContain('katex-error');
    const figcapMatch = /<figcaption>([\s\S]*?)<\/figcaption>/.exec(previewHtml);
    expect(figcapMatch).not.toBeNull();
    expect(figcapMatch![1]).toContain('academic-inline-math');
    expect(figcapMatch![1]).toContain('[amber]');
    expect(figcapMatch![1]).toContain('[blue]');
    expect(previewHtml).toContain('<strong>Table 1.</strong> Participant Clinical Characteristics');

    const preflight = runPreFlightCheck({
      frontMatter: fm,
      sections,
      sectionContents,
      bibEntries: parseBibTeX(bibRaw),
      projectFigures: folderFigs,
    });
    expect(preflight.issues.some((iss) => iss.category === 'crossref' && iss.severity === 'error')).toBe(false);

    const manifest = scanLatexTemplate(SPRINGER_NATURE_COMPAT_TEX, { id: 'springer-nature-compat' });
    const patched = patchLatexTemplate({
      manifest,
      frontMatter: fm,
      sections,
      sectionContents,
      projectFigures: folderFigs,
    });

    // Leading `## 3. Results` stripped and `### 3.1 ...` promoted to `\subsection{Clinical Motor Non-Inferiority}`
    expect(patched.texSource).not.toContain('\\subsection{3. Results}');
    expect(patched.texSource).toContain('\\subsection{Clinical Motor Non-Inferiority}');
    expect(patched.texSource).toContain('\\subsection{Second Subsection}');
    // Horizontal rule `---` skipped instead of emitted as an isolated em-dash paragraph
    expect(patched.texSource).not.toMatch(/\n---\n/);
    // Unlabelled figure emits both canonical and raw-stem \label and is not duplicated
    expect(patched.texSource).toContain('\\label{fig:figure1-studydesign-betasuppression}');
    expect(patched.texSource).toContain('\\label{fig:Figure1_StudyDesign_BetaSuppression}');
    expect(patched.texSource.match(/\\includegraphics/g)).toHaveLength(1);
    // Wide 7-column table separated by blank line from **Table 1. ...** uses \resizebox
    expect(patched.texSource).toContain('\\caption{Participant Clinical Characteristics, Recording Montage, and Intraoperative Scores}');
    expect(patched.texSource).toContain('\\resizebox{\\textwidth}{!}{%');

    // BibTeX Unicode hyphen (U+2010) and decomposed combining acute accent (U+0301) normalized cleanly
    const exportedBib = unicodeToLatexText(serializeBibLibrary(parseBibTeX(bibRaw)));
    expect(exportedBib).not.toContain('\u2010');
    expect(exportedBib).not.toContain('\u0301');
    expect(exportedBib).toContain('Brefel-Courbon');
    expect(exportedBib).toContain('Destée');
    expect(exportedBib).toContain('$\\beta$');
  });
});
