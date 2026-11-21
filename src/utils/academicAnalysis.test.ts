import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { Markdown } from '@tiptap/markdown';
import { AcademicImageMarkdown } from '../extensions/triggerPopup';
import { analyzeAcronyms, runPreFlightCheck } from './academicAnalysis';
import {
  countAcademicWords,
  extractSubsections,
  figureLabelFromFileName,
  indexPaperElements,
  mergePaperAndFolderFigures,
} from './paperOutline';
import { normalizeAcademicMarkdown } from './normalizeAcademicMarkdown';
import { createDefaultFrontMatter, type PaperSection, type ProjectFigureFile } from '../types/paper';
import { parseBibTeX } from '../citations/bibtex';

describe('Paper Outline & Element Indexing', () => {
  it('extracts subsections, figures, tables, and equations accurately', () => {
    const md = `# Results

## Behavioral Accuracy
Accuracy reached 94% in @fig:acc.

### Control Trials
![Accuracy curves](figures/acc.png){#fig:acc width=0.8}

Table: Summary stats {#tbl:stats}
| Group | Mean |
| --- | --- |
| A | 0.94 |

$$
y = mx + b
$$ {#eq:line}
`;
    const subs = extractSubsections(md);
    expect(subs.map((s) => `${s.level}:${s.title}`)).toEqual(['2:Behavioral Accuracy', '3:Control Trials']);

    const els = indexPaperElements([{ id: 's1', title: 'Results', markdown: md }]);
    expect(els.find((e) => e.kind === 'figure')?.label).toBe('fig:acc');
    expect(els.find((e) => e.kind === 'table')?.label).toBe('tbl:stats');
    expect(els.find((e) => e.kind === 'equation')?.label).toBe('eq:line');
    expect(countAcademicWords(md)).toBeGreaterThan(10);
  });

  it('indexes figure files from figures/ and figure/ folders and deduplicates embedded figures', () => {
    expect(figureLabelFromFileName('fig1.png')).toBe('fig:fig1');
    expect(figureLabelFromFileName('fig-overview.png')).toBe('fig:overview');
    expect(figureLabelFromFileName('fig_my_plot.pdf')).toBe('fig:my-plot');
    expect(figureLabelFromFileName('figures/sub/Accuracy Curve.svg')).toBe('fig:accuracy-curve');
    expect(figureLabelFromFileName('fig.png')).toBe('fig:fig');
    expect(figureLabelFromFileName('---.png')).toBe('fig:figure');

    const md = `![Accuracy curves](figures/acc.png){#fig:acc width=0.8}`;
    const folderFigures: ProjectFigureFile[] = [
      { name: 'acc.png', relPath: 'figures/acc.png', label: 'fig:acc', title: 'acc.png' },
      { name: 'model.pdf', relPath: 'figures/model.pdf', label: 'fig:model', title: 'model.pdf' },
      {
        name: 'pipeline.svg',
        relPath: 'figures/pipeline.svg',
        label: 'fig:pipeline',
        title: 'pipeline.svg',
      },
      { name: 'raw.eps', relPath: 'figure/raw.eps', label: 'fig:raw', title: 'raw.eps' },
      {
        name: 'sample.jpg',
        relPath: 'figures/sub/sample.jpg',
        label: 'fig:sample',
        title: 'sample.jpg',
      },
    ];

    const base = indexPaperElements([{ id: 's1', title: 'Results', markdown: md }]);
    const merged = mergePaperAndFolderFigures(base, folderFigures);
    const figs = merged.filter((e) => e.kind === 'figure');

    expect(figs.map((f) => f.label)).toEqual([
      'fig:acc',
      'fig:model',
      'fig:pipeline',
      'fig:raw',
      'fig:sample',
    ]);
    expect(figs.filter((f) => f.label === 'fig:acc')).toHaveLength(1);
    expect(figs[0].title).toBe('Accuracy curves');
    expect(figs[1].sectionId).toBe('figures-folder');
    expect(figs[1].imagePath).toBe('figures/model.pdf');
    expect(figs[3].imagePath).toBe('figure/raw.eps');
    expect(figs[4].imagePath).toBe('figures/sub/sample.jpg');
  });

  it('preserves academic image embeds and pipe tables when round-tripping through TipTap Markdown', () => {
    const md = [
      'See figure and Table 1 below.',
      '',
      '![Caption [amber] ($p < 0.05$)](figures/Figure1_StudyDesign.png)',
      '',
      '**Table 1. Clinical Data**',
      '',
      '| Subject | Montage & Info | Score |',
      '| :--- | :--- | :--- |',
      '| S1 | GPi & ECoG (<1 yr) | 4 |',
    ].join('\n');
    const editor = new Editor({
      extensions: [StarterKit, TableKit, Markdown, AcademicImageMarkdown],
      content: md,
      contentType: 'markdown',
    });
    try {
      const roundTripped = normalizeAcademicMarkdown(editor.getMarkdown());
      expect(roundTripped).toContain('![Caption [amber] ($p < 0.05$)](figures/Figure1_StudyDesign.png)');
      expect(roundTripped).toMatch(/\|\s*Subject\s*\|\s*Montage & Info\s*\|\s*Score\s*\|/);
      expect(roundTripped).toMatch(/\|\s*S1\s*\|\s*GPi & ECoG \(<1 yr\)\s*\|\s*4\s*\|/);
      expect(roundTripped).not.toContain('&amp;');
      expect(roundTripped).not.toContain('&lt;');
    } finally {
      editor.destroy();
    }
  });

  it('skips redundant top-of-section ## heading matching section title in extractSubsections', () => {
    const subs = extractSubsections('## 3. Results\n\n### 3.1 Clinical Relief\n\nBody\n\n### 3.2 Gating\n', 'Results');
    expect(subs.map((s) => s.title)).toEqual(['3.1 Clinical Relief', '3.2 Gating']);
  });
});

describe('Academic Pre-Flight & Acronym Tracker', () => {
  it('detects undefined acronyms, broken citations, broken refs, and word-limit overruns', () => {
    const acrs = analyzeAcronyms([
      {
        title: 'Intro',
        markdown: 'We record local field potential (LFP) signals. LFP power and MEG spikes changed. MEG was high.',
      },
    ]);
    const lfp = acrs.find((a) => a.acronym === 'LFP');
    const meg = acrs.find((a) => a.acronym === 'MEG');
    expect(lfp?.defined).toBe(true);
    expect(meg?.defined).toBe(false);

    const fm = createDefaultFrontMatter('Real Study Title');
    const sections: PaperSection[] = [
      {
        id: 'abs',
        title: 'Abstract',
        role: 'abstract',
        fileName: '01-abstract.md',
        path: '',
        status: 'draft',
        wordLimit: 5,
      },
    ];
    const report = runPreFlightCheck({
      frontMatter: fm,
      sections,
      sectionContents: {
        abs: 'This abstract definitely exceeds five words [@missing2025] and mentions @fig:ghost TODO.',
      },
      bibEntries: parseBibTeX(''),
    });

    expect(report.issues.some((i) => i.category === 'limits')).toBe(true);
    expect(report.issues.some((i) => i.category === 'citations')).toBe(true);
    expect(report.issues.some((i) => i.category === 'crossref')).toBe(true);
    expect(report.issues.some((i) => i.category === 'todos')).toBe(true);
    expect(report.readyScore).toBeLessThan(60);
  });
});
