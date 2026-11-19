import { describe, expect, it } from 'vitest';
import {
  auditCitations,
  extractCitedKeysFromMarkdown,
  mergeBibEntries,
  parseBibTeX,
  pruneBibEntries,
  serializeBibLibrary,
} from './bibtex';
import { buildBibliographyOrder, formatInlineCitation } from './cslFormatter';

const SAMPLE_BIB = `
@article{vaswani2017attention,
  author = {Vaswani, Ashish and Shazeer, Noam and Parmar, Niki},
  title = {Attention Is All You Need},
  journal = {Advances in Neural Information Processing Systems},
  year = {2017},
  volume = {30},
  pages = {5998--6008},
  doi = {10.5555/3295222.3295349}
}

@article{lecun2015deep,
  author = {LeCun, Yann and Bengio, Yoshua and Hinton, Geoffrey},
  title = {Deep learning},
  journal = {Nature},
  year = {2015},
  volume = {521},
  pages = {436--444}
}
`;

describe('BibTeX Parser, Serializer, Merger & Auditor', () => {
  it('parses and round-trips entries cleanly', () => {
    const parsed = parseBibTeX(SAMPLE_BIB);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].key).toBe('vaswani2017attention');
    expect(parsed[1].fields.journal).toBe('Nature');

    const serialized = serializeBibLibrary(parsed);
    const reparsed = parseBibTeX(serialized);
    expect(reparsed).toHaveLength(2);
    expect(reparsed[0].fields.title).toBe('Attention Is All You Need');
  });

  it('merges without duplicating existing keys or DOIs', () => {
    const base = parseBibTeX(SAMPLE_BIB);
    const dupByDoi = parseBibTeX(`
      @article{differentKey2017,
        author = {Vaswani, Ashish},
        title = {Attention Is All You Need},
        year = {2017},
        doi = {10.5555/3295222.3295349}
      }
      @article{newpaper2024,
        author = {Doe, Jane},
        title = {Fresh Discovery},
        journal = {Science},
        year = {2024}
      }
    `);
    const { merged, addedCount } = mergeBibEntries(base, dupByDoi);
    expect(addedCount).toBe(1);
    expect(merged).toHaveLength(3);
  });

  it('extracts citations, prunes unused entries, and audits missing keys', () => {
    const entries = parseBibTeX(SAMPLE_BIB);
    const md = 'Prior work [@vaswani2017attention; @ghost2099] builds on @fig:ignored.';
    const keys = extractCitedKeysFromMarkdown(md);
    expect(keys).toEqual(['vaswani2017attention', 'ghost2099']);

    const audit = auditCitations([md], entries);
    expect(audit.missingKeys).toEqual(['ghost2099']);
    expect(audit.unusedKeys).toEqual(['lecun2015deep']);
    expect(audit.usageCounts['vaswani2017attention']).toBe(1);

    const pruned = pruneBibEntries(entries, keys);
    expect(pruned.map((e) => e.key)).toEqual(['vaswani2017attention']);
  });
});

describe('CSL Citation Formatting', () => {
  it('formats inline citations and reference lists in Nature and APA styles', () => {
    const entries = parseBibTeX(SAMPLE_BIB);
    const natureBib = buildBibliographyOrder(['lecun2015deep', 'vaswani2017attention'], entries, 'nature');
    expect(formatInlineCitation(['lecun2015deep', 'vaswani2017attention'], entries, 'nature', natureBib.numberMap)).toBe(
      '[1, 2]'
    );
    expect(natureBib.references[0].formatted).toContain('1. LeCun');

    const apaBib = buildBibliographyOrder(['vaswani2017attention', 'lecun2015deep'], entries, 'apa');
    expect(formatInlineCitation(['vaswani2017attention'], entries, 'apa', apaBib.numberMap)).toBe(
      '(Vaswani et al., 2017)'
    );
    // APA sorts alphabetically: LeCun before Vaswani
    expect(apaBib.references[0].key).toBe('lecun2015deep');
  });
});
