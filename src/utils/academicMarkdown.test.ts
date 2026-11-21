import { describe, expect, it } from 'vitest';
import { renderAcademicPreviewHtml } from './academicMarkdown';
import type { BibEntry } from '../types/citation';
import type { ProjectFigureFile } from '../types/paper';

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

const sampleBib: BibEntry[] = [
  {
    key: 'smith2024',
    type: 'article',
    fields: {
      author: 'Smith, Jane',
      title: 'Burst deep brain stimulation',
      journal: 'Brain',
      year: '2024',
    },
    raw: '@article{smith2024, author={Smith, Jane}, title={Burst deep brain stimulation}, journal={Brain}, year={2024}}',
  },
];

describe('renderAcademicPreviewHtml caption rendering', () => {
  it('renders inline math, nested brackets, formatting, citations, and cross-refs inside explicit figure captions without leaking tokens', () => {
    const caption =
      'Study Design, Clinical Motor Non-Inferiority, and Band-Specific GPi Beta Power Suppression. ' +
      '(A) Waveforms comparing **continuous** DBS ($\\text{cDBS}$, $130\\text{ Hz}$, $100\\%$ duty cycle) and *intermittent* burst DBS ' +
      '($\\text{bDBS}$, repeating $200\\text{ ms}$ ON pulse trains [amber] alternating with $500\\text{ ms}$ OFF intervals [blue]; ' +
      '$28.6\\%$ duty cycle, $-71.4\\%$ energy). (B) Composite scores ($n = 7$, mean $\\pm$ SEM) across $13\\text{--}20\\text{ Hz}$ ' +
      '($p < 0.001$) summarized in @tbl:perf [@smith2024].';

    const markdown = [
      `![${caption}](figures/fig1.png){#fig:f1 width=0.9}`,
      '',
      'Table: Summary of clinical motor outcomes {#tbl:perf}',
      '| Condition | Beta ($\\mu$V$^2$) |',
      '| :--- | ---: |',
      '| cDBS | 1.2 |',
    ].join('\n');

    const html = renderAcademicPreviewHtml({
      sections: [{ id: 's-res', title: 'Results', markdown }],
      bibEntries: sampleBib,
      citationStyle: 'apa',
      imageDataUrls: {
        'figures/fig1.png': 'data:image/png;base64,FIG1',
      },
    });

    expect(html).not.toContain('MIRTEXHTMLTOKEN');
    expect(html).not.toContain('MIRTEXREFLINK');
    expect(html).not.toContain('katex-error');

    const doc = parseHtml(html);
    const fig = doc.querySelector('figure.academic-figure');
    expect(fig).not.toBeNull();

    const figcaption = fig!.querySelector('figcaption');
    expect(figcaption).not.toBeNull();
    expect(figcaption!.innerHTML.startsWith('<strong>Figure 1:</strong>')).toBe(true);
    expect(figcaption!.querySelectorAll('.academic-inline-math').length).toBeGreaterThanOrEqual(10);
    expect(figcaption!.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(10);
    expect(figcaption!.textContent).toContain('[amber]');
    expect(figcaption!.textContent).toContain('[blue]');
    expect(figcaption!.querySelector('strong')?.textContent).toBe('Figure 1:');
    expect(
      Array.from(figcaption!.querySelectorAll('strong')).some((el) => el.textContent === 'continuous')
    ).toBe(true);
    expect(figcaption!.querySelector('em')?.textContent).toBe('intermittent');

    const citePill = figcaption!.querySelector('.cite-pill');
    expect(citePill).not.toBeNull();
    expect(citePill!.classList.contains('cite-missing')).toBe(false);
    expect(citePill!.textContent).toContain('Smith');

    const refPill = figcaption!.querySelector('.ref-pill');
    expect(refPill).not.toBeNull();
    expect(refPill!.textContent).toBe('Table 1');

    const img = fig!.querySelector('img');
    expect(img).not.toBeNull();
    const alt = img!.getAttribute('alt') || '';
    expect(alt).not.toContain('MIRTEXHTMLTOKEN');
    expect(alt).not.toContain('MIRTEXREFLINK');
    expect(alt).not.toMatch(/<\/?[a-z]/i);
    expect(alt).toContain('[amber]');
    expect(alt).toContain('[blue]');
    expect(alt).toContain('p < 0.001');
  });

  it('renders inline math inside a following Caption: line after ![](path)', () => {
    const markdown = [
      '![](figures/fig2.png){#fig:f2}',
      '',
      'Caption: Normalized beta power ($13\\text{--}30\\text{ Hz}$) with mean $\\pm$ SEM ($p < 0.05$).',
    ].join('\n');

    const html = renderAcademicPreviewHtml({
      sections: [{ id: 's-res', title: 'Results', markdown }],
      bibEntries: [],
      citationStyle: 'nature',
      imageDataUrls: {
        'figures/fig2.png': 'data:image/png;base64,FIG2',
      },
    });

    expect(html).not.toContain('MIRTEXHTMLTOKEN');
    expect(html).not.toContain('katex-error');

    const doc = parseHtml(html);
    const figcaption = doc.querySelector('figure.academic-figure figcaption');
    expect(figcaption).not.toBeNull();
    expect(figcaption!.innerHTML.startsWith('<strong>Figure 1:</strong>')).toBe(true);
    expect(figcaption!.querySelectorAll('.academic-inline-math')).toHaveLength(3);
  });

  it('renders inline math in auto-rendered folder figure captions (@fig:id: and @fig:id [...])', () => {
    const projectFigures: ProjectFigureFile[] = [
      {
        name: 'overview.png',
        relPath: 'figures/overview.png',
        label: 'fig:overview',
        title: 'overview.png',
      },
      {
        name: 'spectrum.png',
        relPath: 'figures/spectrum.png',
        label: 'fig:spectrum',
        title: 'spectrum.png',
      },
    ];

    const markdown = [
      '@fig:overview: Intraoperative protocol ($130\\text{ Hz}$, $100\\%$ duty cycle).',
      '',
      '@fig:spectrum [Group-median LFP spectrum ($n = 7$, $\\alpha = 0.05$).]',
    ].join('\n');

    const html = renderAcademicPreviewHtml({
      sections: [{ id: 's-res', title: 'Results', markdown }],
      bibEntries: [],
      citationStyle: 'nature',
      projectFigures,
      imageDataUrls: {
        'figures/overview.png': 'data:image/png;base64,OV',
        'figures/spectrum.png': 'data:image/png;base64,SP',
      },
    });

    expect(html).not.toContain('MIRTEXHTMLTOKEN');
    expect(html).not.toContain('katex-error');

    const doc = parseHtml(html);
    const captions = doc.querySelectorAll('figure.academic-figure figcaption');
    expect(captions).toHaveLength(2);
    expect(captions[0].innerHTML.startsWith('<strong>Figure 1:</strong>')).toBe(true);
    expect(captions[0].querySelectorAll('.academic-inline-math')).toHaveLength(2);
    expect(captions[1].innerHTML.startsWith('<strong>Figure 2:</strong>')).toBe(true);
    expect(captions[1].querySelectorAll('.academic-inline-math')).toHaveLength(2);
  });

  it('renders inline math, emphasis, and citations inside Table:, Table N:, and **Table N.** captions', () => {
    const markdown = [
      'Table: *Post-hoc* Wilcoxon comparisons ($p < 0.01$) [@smith2024] {#tbl:wilcoxon}',
      '| Band | Statistic |',
      '| :--- | ---: |',
      '| Low beta | $W = 0$ |',
      '',
      'Table 2: Energy savings ($-71.4\\%$) across $n = 7$ subjects',
      '| Metric | Value |',
      '| :--- | ---: |',
      '| Duty cycle | $28.6\\%$ |',
      '',
      '**Table 3. Spectral power ($\\mu\\text{V}^2$) in **cDBS** vs. *bDBS***',
      '| Band | cDBS |',
      '| :--- | ---: |',
      '| High beta | 0.42 |',
    ].join('\n');

    const html = renderAcademicPreviewHtml({
      sections: [{ id: 's-res', title: 'Results', markdown }],
      bibEntries: sampleBib,
      citationStyle: 'apa',
    });

    expect(html).not.toContain('MIRTEXHTMLTOKEN');
    expect(html).not.toContain('katex-error');

    const doc = parseHtml(html);
    const tableCaptions = doc.querySelectorAll('.academic-table-caption');
    expect(tableCaptions).toHaveLength(3);

    expect(tableCaptions[0].querySelector('strong')?.textContent).toBe('Table 1.');
    expect(tableCaptions[0].querySelector('em')?.textContent).toBe('Post-hoc');
    expect(tableCaptions[0].querySelectorAll('.academic-inline-math')).toHaveLength(1);
    expect(tableCaptions[0].querySelector('.cite-pill')?.textContent).toContain('Smith');

    expect(tableCaptions[1].querySelector('strong')?.textContent).toBe('Table 2.');
    expect(tableCaptions[1].querySelectorAll('.academic-inline-math')).toHaveLength(2);

    expect(tableCaptions[2].querySelector('strong')?.textContent).toBe('Table 3.');
    expect(tableCaptions[2].querySelectorAll('.academic-inline-math')).toHaveLength(1);
    expect(tableCaptions[2].querySelector('em')?.textContent).toBe('bDBS');
  });

  it('collapses filename-only figure captions to Figure N and alt="Figure N"', () => {
    const html = renderAcademicPreviewHtml({
      sections: [
        {
          id: 's-res',
          title: 'Results',
          markdown: '![my_plot.png](figures/my_plot.png){#fig:my-plot}',
        },
      ],
      bibEntries: [],
      citationStyle: 'nature',
      imageDataUrls: {
        'figures/my_plot.png': 'data:image/png;base64,PLOT',
      },
    });

    const doc = parseHtml(html);
    const figcaption = doc.querySelector('figure.academic-figure figcaption');
    expect(figcaption?.innerHTML).toBe('<strong>Figure 1</strong>');

    const img = doc.querySelector('figure.academic-figure img');
    expect(img?.getAttribute('alt')).toBe('Figure 1');
  });
});
