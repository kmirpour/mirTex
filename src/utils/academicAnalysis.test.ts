import { describe, expect, it } from 'vitest';
import { analyzeAcronyms, runPreFlightCheck } from './academicAnalysis';
import { countAcademicWords, extractSubsections, indexPaperElements } from './paperOutline';
import { createDefaultFrontMatter, type PaperSection } from '../types/paper';
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
