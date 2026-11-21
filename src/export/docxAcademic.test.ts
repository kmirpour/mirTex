import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildAcademicDocx } from './docxAcademic';
import {
  computeFigureDisplaySize,
  detectImageFormat,
  parseDataUrl,
  probeImageDimensions,
} from './docxImageUtils';
import { createDefaultFrontMatter, type PaperSection, type ProjectFigureFile } from '../types/paper';
import type { BibEntry } from '../types/citation';

/** Builds a minimal valid PNG binary with custom width & height in the IHDR chunk. */
function makeSyntheticPng(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  // PNG signature
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  // IHDR chunk length = 13
  view.setUint32(8, 13, false);
  // "IHDR"
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  bytes[24] = 8; // bit depth
  bytes[25] = 2; // RGB
  // Minimal IEND trailer at bytes 29..32 (sufficient for header/embedding checks)
  return bytes;
}

function makeSyntheticPngDataUrl(width: number, height: number): string {
  const bytes = makeSyntheticPng(width, height);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `data:image/png;base64,${btoa(bin)}`;
}

/** Builds a minimal valid JPEG binary with an APP0 segment followed by SOF0 dimensions. */
function makeSyntheticJpeg(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe0, 0x00, 0x10, // APP0, len=16
    0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, // SOF0, len=17, precision=8
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9, // EOI
  ]);
  return bytes;
}

function makeSyntheticJpegDataUrl(width: number, height: number): string {
  const bytes = makeSyntheticJpeg(width, height);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `data:image/jpeg;base64,${btoa(bin)}`;
}

async function unpackDocx(blob: Blob) {
  const buf = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file('word/document.xml')!.async('string');
  const relsXml = (await zip.file('word/_rels/document.xml.rels')?.async('string')) ?? '';
  const numberingXml = (await zip.file('word/numbering.xml')?.async('string')) ?? '';
  const headerXml = (await zip.file('word/header1.xml')?.async('string')) ?? '';
  const mediaFiles = Object.keys(zip.files).filter((f) => f.startsWith('word/media/'));
  const doc = new DOMParser().parseFromString(docXml, 'application/xml');
  const fullText = Array.from(doc.getElementsByTagName('w:t'))
    .map((el) => el.textContent ?? '')
    .join('');
  return { zip, docXml, relsXml, numberingXml, headerXml, mediaFiles, doc, fullText };
}

const sampleBib: BibEntry[] = [
  {
    key: 'smith2024',
    type: 'article',
    fields: {
      author: 'Smith, Jane and Doe, Alex',
      title: 'Burst deep brain stimulation modulates beta dynamics',
      journal: 'Brain',
      year: '2024',
      volume: '147',
      pages: '101-115',
    },
    raw: '@article{smith2024}',
  },
  {
    key: 'jones2023',
    type: 'article',
    fields: {
      author: 'Jones, Robert',
      title: 'Adaptive neuromodulation in Parkinson disease',
      journal: 'Nature Neuroscience',
      year: '2023',
    },
    raw: '@article{jones2023}',
  },
  {
    key: 'unused2020',
    type: 'article',
    fields: {
      author: 'Unused, Author',
      title: 'Should not appear when uncited',
      journal: 'Journal',
      year: '2020',
    },
    raw: '@article{unused2020}',
  },
];

describe('docxImageUtils', () => {
  it('parses base64 and URL-encoded data URLs and rejects malformed ones', () => {
    const pngUrl = makeSyntheticPngDataUrl(640, 320);
    const parsedPng = parseDataUrl(pngUrl);
    expect(parsedPng).not.toBeNull();
    expect(parsedPng!.mime).toBe('image/png');
    expect(detectImageFormat(parsedPng!.bytes, parsedPng!.mime)).toBe('png');
    expect(probeImageDimensions(parsedPng!.bytes, 'png')).toEqual({ width: 640, height: 320 });

    const svgUrl = 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20400%20200%22%3E%3C%2Fsvg%3E';
    const parsedSvg = parseDataUrl(svgUrl);
    expect(parsedSvg).not.toBeNull();
    expect(detectImageFormat(parsedSvg!.bytes, parsedSvg!.mime)).toBe('svg');
    expect(probeImageDimensions(parsedSvg!.bytes, 'svg')).toEqual({ width: 400, height: 200 });

    expect(parseDataUrl('not-a-data-url')).toBeNull();
    expect(parseDataUrl('data:image/png;base64,!!!invalid!!!')).toBeNull();
  });

  it('probes JPEG, GIF, BMP, and physical-unit SVG dimensions and preserves aspect ratios', () => {
    const jpg = makeSyntheticJpeg(1200, 600);
    expect(detectImageFormat(jpg)).toBe('jpg');
    expect(probeImageDimensions(jpg, 'jpg')).toEqual({ width: 1200, height: 600 });

    // GIF89a 320x240
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x40, 0x01, 0xf0, 0x00]);
    expect(detectImageFormat(gif)).toBe('gif');
    expect(probeImageDimensions(gif, 'gif')).toEqual({ width: 320, height: 240 });

    // BMP BITMAPINFOHEADER 500x250
    const bmp = new Uint8Array(26);
    bmp[0] = 0x42;
    bmp[1] = 0x4d;
    const bmpView = new DataView(bmp.buffer);
    bmpView.setUint32(14, 40, true);
    bmpView.setInt32(18, 500, true);
    bmpView.setInt32(22, -250, true);
    expect(detectImageFormat(bmp)).toBe('bmp');
    expect(probeImageDimensions(bmp, 'bmp')).toEqual({ width: 500, height: 250 });

    const svgPt = new TextEncoder().encode('<svg width="300pt" height="150pt"></svg>');
    expect(probeImageDimensions(svgPt, 'svg')).toEqual({ width: 400, height: 200 });

    expect(computeFigureDisplaySize(1600, 800, 0.8, false)).toEqual({ width: 499, height: 250 });
    expect(computeFigureDisplaySize(200, 100, 0.85, false)).toEqual({ width: 200, height: 100 });
    expect(computeFigureDisplaySize(200, 100, 0.8, true)).toEqual({ width: 499, height: 250 });
  });
});

describe('buildAcademicDocx', () => {
  it('renders front matter with Georgia typography, superscript affiliations, and divider border', async () => {
    const fm = createDefaultFrontMatter('Cortical Dynamics Under Burst Stimulation');
    fm.shortTitle = 'Cortical Dynamics';
    fm.subtitle = 'A Multi-Center Electrophysiological Study';
    fm.authors = [
      {
        id: 'a1',
        firstName: 'Koorosh',
        lastName: 'Mirpour',
        email: 'km@lab.edu',
        affiliationIds: ['af1', 'af2'],
        corresponding: true,
      },
      {
        id: 'a2',
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'js@lab.edu',
        affiliationIds: ['af2'],
        corresponding: false,
      },
    ];
    fm.affiliations = [
      { id: 'af1', department: 'Neurosurgery', institution: 'UCLA', city: 'Los Angeles', country: 'USA' },
      { id: 'af2', department: 'Neurobiology', institution: 'Stanford', city: 'Palo Alto', country: 'USA' },
    ];
    fm.keywords = ['deep brain stimulation', 'beta bursts', 'GPi'];

    const blob = await buildAcademicDocx({
      frontMatter: fm,
      sections: [{ id: 's1', title: 'Introduction', role: 'introduction', fileName: '01-intro.md', path: '', status: 'draft' }],
      sectionContents: { s1: '# Introduction\n\nBody paragraph.' },
      bibEntries: [],
      citationStyle: 'apa',
    });

    const { docXml, fullText } = await unpackDocx(blob);
    expect(fullText).toContain('Cortical Dynamics Under Burst Stimulation');
    expect(fullText).toContain('A Multi-Center Electrophysiological Study');
    expect(fullText).toContain('Koorosh Mirpour1,2*, Jane Smith2');
    expect(fullText).toContain('1 Neurosurgery, UCLA, Los Angeles, USA');
    expect(fullText).toContain('Keywords: deep brain stimulation · beta bursts · GPi');
    expect(docXml).toContain('Georgia');
    expect(docXml).toContain('w:val="superscript"');
    expect(docXml).toContain('w:pBdr');
  });

  it('converts all Markdown constructs without leaking raw syntax tokens', async () => {
    const md = [
      '# Methods {#sec:methods}',
      '',
      '## Recording Protocol',
      '',
      '### Signal Processing',
      '',
      '#### Statistical Thresholds',
      '',
      'We measured **bold**, *italic*, ***both***, ~~deprecated~~, <u>underlined</u>, H~2~O, m^2^, <sup>sup</sup>, <sub>sub</sub>, and \\*literal stars\\*.',
      '',
      'TipTap escaped `[@unused2020]` inline code must stay literal, while \\[@smith2024\\] and Group A &amp; B ($p &lt; 0.01$) resolve via [MirTex Docs](https://example.com/docs).',
      '',
      '- Tight **bullet** one',
      '  - Nested *child* item',
      '- [x] Completed step',
      '- [ ] Pending step',
      '',
      '1. First ordered step',
      '2. Second ordered step',
      '',
      'Another paragraph between lists.',
      '',
      '1. Restarted second ordered list',
      '',
      '> Quoted **observation** from protocol.',
      '',
      '```python',
      'x = beta_power(lfp)',
      '```',
      '',
      '```latex-raw',
      '\\vspace{2pt}',
      '```',
      '',
      '---',
    ].join('\n');

    const blob = await buildAcademicDocx({
      frontMatter: createDefaultFrontMatter('Markdown Parity Test'),
      sections: [{ id: 's1', title: 'Methods', role: 'methods', fileName: '01-methods.md', path: '', status: 'draft' }],
      sectionContents: { s1: md },
      bibEntries: sampleBib,
      citationStyle: 'apa',
    });

    const { docXml, relsXml, numberingXml, fullText } = await unpackDocx(blob);

    // No raw markdown syntax leaks
    expect(fullText).not.toContain('**');
    expect(fullText).not.toContain('~~');
    expect(fullText).not.toContain('<u>');
    expect(fullText).not.toContain('<sup>');
    expect(fullText).not.toContain('<sub>');
    expect(fullText).not.toContain('{#sec:');
    expect(fullText).not.toContain('###');
    expect(fullText).not.toContain('```');
    expect(fullText).not.toContain('---');
    expect(fullText).not.toContain('&amp;');
    expect(fullText).not.toContain('&lt;');
    expect(fullText).not.toContain('\\*');
    expect(fullText).not.toContain('[@smith2024]');

    // Inline code preserved verbatim and NOT treated as a citation
    expect(fullText).toContain('[@unused2020]');
    expect(fullText).not.toContain('Should not appear when uncited');

    // Resolved content
    expect(fullText).toContain('Methods');
    expect(fullText).toContain('Recording Protocol');
    expect(fullText).toContain('Signal Processing');
    expect(fullText).toContain('Statistical Thresholds');
    expect(fullText).toContain('*literal stars*');
    expect(fullText).toContain('(Smith & Doe, 2024)');
    expect(fullText).toContain('Group A & B');
    expect(fullText).toContain('MirTex Docs');
    expect(fullText).toContain('☑ Completed step');
    expect(fullText).toContain('☐ Pending step');
    expect(fullText).toContain('x = beta_power(lfp)');

    // Formatting XML elements
    expect(docXml).toContain('w:val="Heading1"');
    expect(docXml).toContain('w:val="Heading2"');
    expect(docXml).toContain('w:val="Heading3"');
    expect(docXml).toContain('w:val="Heading4"');
    expect(docXml).toContain('<w:strike/>');
    expect(docXml).toContain('w:val="single"');
    expect(docXml).toContain('w:val="superscript"');
    expect(docXml).toContain('w:val="subscript"');
    expect(docXml).toContain('Consolas');
    expect(relsXml).toContain('https://example.com/docs');

    // Numbering definitions & multiple ordered list instances
    expect(numberingXml).toContain('w:numFmt w:val="bullet"');
    expect(numberingXml).toContain('w:numFmt w:val="decimal"');
    const numMatches = numberingXml.match(/<w:num\b/g) ?? [];
    expect(numMatches.length).toBeGreaterThanOrEqual(3);
  });

  it('converts inline and display math to Word OMML equations and falls back safely on unknown macros', async () => {
    const md = [
      '# Results',
      '',
      'Beta power ($13\\text{--}20\\text{ Hz}$, $\\mu\\text{V}^2$) decreased by $-67.8%$ ($p < 0.001$) and custom $\\exoticunknownmacro{\\alpha}$ held.',
      '',
      '$$',
      '\\mathcal{L} = \\sum_{i=1}^{N} (y_i - \\hat{y}_i)^2',
      '$$ {#eq:loss}',
      '',
      'See @eq:loss for details.',
    ].join('\n');

    const blob = await buildAcademicDocx({
      frontMatter: createDefaultFrontMatter('Math Export Test'),
      sections: [{ id: 's1', title: 'Results', role: 'results', fileName: '01-res.md', path: '', status: 'draft' }],
      sectionContents: { s1: md },
      bibEntries: [],
      citationStyle: 'nature',
    });

    const { docXml, doc, fullText } = await unpackDocx(blob);
    const oMathCount = doc.getElementsByTagName('m:oMath').length;
    expect(oMathCount).toBeGreaterThanOrEqual(4);
    expect(docXml).toContain('m:oMath');
    expect(fullText).toContain('(1)');
    expect(fullText).toContain('Eq. (1)');
    expect(fullText).not.toContain('$$');
    expect(fullText).not.toContain('{#eq:loss}');
    // Fallback rendered Greek α cleanly
    expect(fullText).toContain('α');
  });

  it('embeds explicit, Caption-line, filename-collapsed, and auto-emitted folder figures with aspect ratios and placeholders', async () => {
    const fig1Url = makeSyntheticPngDataUrl(800, 400);
    const fig2Url = makeSyntheticJpegDataUrl(600, 300);
    const fig3Url = makeSyntheticPngDataUrl(500, 250);
    const fig4Url = makeSyntheticPngDataUrl(700, 350);
    const fig5Url = makeSyntheticPngDataUrl(400, 400);

    const projectFigures: ProjectFigureFile[] = [
      { name: 'overview.png', relPath: 'figures/overview.png', label: 'fig:overview', title: 'overview.png' },
      { name: 'folder_plot.png', relPath: 'figures/folder_plot.png', label: 'fig:folder-plot', title: 'folder_plot.png' },
    ];

    const sections: PaperSection[] = [
      { id: 's1', title: 'Results', role: 'results', fileName: '01-res.md', path: '', status: 'draft' },
      { id: 's2', title: 'Methods', role: 'methods', fileName: '02-meth.md', path: '', status: 'draft' },
    ];

    const mdResults = [
      '# Results',
      '',
      '![Caption with **bold**, *italic*, $p < 0.001$, [amber], @tbl:perf [@smith2024]](figures/fig1.png){#fig:f1 width=0.8}',
      '',
      '![](figures/fig2.jpg)',
      '',
      'Caption: Second panel with *JPEG* image ($n = 7$).',
      '',
      '![my_plot.png](figures/my_plot.png){#fig:my-plot}',
      '',
      '@fig:overview: System overview diagram',
      '',
      'As shown in @fig:overview, @fig:folder-plot, and @fig:f1, performance improves.',
      '',
      '![Missing PDF diagram](figures/missing.pdf){#fig:missing}',
    ].join('\n');

    const mdMethods = [
      '# Methods',
      '',
      'Table: Summary metrics {#tbl:perf}',
      '| Group | Value |',
      '| :--- | ---: |',
      '| cDBS | 1.2 |',
    ].join('\n');

    const blob = await buildAcademicDocx({
      frontMatter: createDefaultFrontMatter('Figures Test'),
      sections,
      sectionContents: { s1: mdResults, s2: mdMethods },
      bibEntries: sampleBib,
      citationStyle: 'apa',
      projectFigures,
      imageDataUrls: {
        'figures/fig1.png': fig1Url,
        'figures/fig2.jpg': fig2Url,
        'figures/my_plot.png': fig3Url,
        'figures/overview.png': fig4Url,
        'figures/folder_plot.png': fig5Url,
      },
    });

    const { docXml, mediaFiles, doc, fullText } = await unpackDocx(blob);

    // All 5 resolvable figures embedded in word/media/
    expect(mediaFiles).toHaveLength(5);
    expect(docXml).toContain('<a:blip');
    expect(docXml).toContain('<wp:extent');

    // Check first figure width & aspect ratio (624 * 0.8 = 499px -> 2:1 -> 250px)
    const extents = Array.from(doc.getElementsByTagName('wp:extent'));
    expect(extents.length).toBeGreaterThanOrEqual(5);
    const cx0 = Number(extents[0].getAttribute('cx'));
    const cy0 = Number(extents[0].getAttribute('cy'));
    expect(Math.round(cx0 / 9525)).toBe(499);
    expect(Math.round(cy0 / 9525)).toBe(250);

    // Captions & cross-refs
    expect(fullText).toContain('Figure 1: Caption with bold, italic, ');
    expect(fullText).toContain('[amber], Table 1 (Smith & Doe, 2024)');
    expect(fullText).toContain('Figure 2: Second panel with JPEG image');
    expect(fullText).toContain('Figure 3');
    expect(fullText).not.toContain('my_plot.png');
    expect(fullText).toContain('Figure 4: System overview diagram');
    expect(fullText).toContain('Figure 5');
    expect(fullText).toContain('Figure 6: Missing PDF diagram');
    expect(fullText).toContain('Figure image: figures/missing.pdf');

    // Cross-references in prose resolved
    expect(fullText).toContain('As shown in Figure 4, Figure 5, and Figure 1, performance improves.');
    expect(fullText).not.toContain('@fig:');
    expect(fullText).not.toContain('MIRTEX');
    expect(fullText).not.toContain('![');
  });

  it('renders booktabs tables with header row, alignments, inline formatting, and citations/references', async () => {
    const md = [
      '# Discussion',
      '',
      'Table: *Post-hoc* comparisons ($p < 0.01$) [@smith2024] {#tbl:posthoc}',
      '| Metric | Center | Score |',
      '| :--- | :---: | ---: |',
      '| Beta | **cDBS** | $1.23$ |',
      '| Gamma | *bDBS* | 0.98 |',
      '',
      '**Table 2. Secondary summary**',
      '',
      '| Item | Note |',
      '| --- | --- |',
      '| A | Cited by @jones2023 |',
    ].join('\n');

    const blob = await buildAcademicDocx({
      frontMatter: createDefaultFrontMatter('Tables & References'),
      sections: [{ id: 's1', title: 'Discussion', role: 'discussion', fileName: '01-disc.md', path: '', status: 'draft' }],
      sectionContents: { s1: md },
      bibEntries: sampleBib,
      citationStyle: 'nature',
    });

    const { docXml, doc, fullText } = await unpackDocx(blob);
    const tables = Array.from(doc.getElementsByTagName('w:tbl'));
    expect(tables).toHaveLength(2);
    expect(docXml).toContain('<w:tblHeader/>');
    expect(docXml).toContain('w:sz="12"');
    expect(docXml).toContain('w:hanging="420"');

    expect(fullText).toContain('Table 1. Post-hoc comparisons');
    expect(fullText).toContain('Table 2. Secondary summary');
    expect(fullText).toContain('cDBS');
    expect(fullText).toContain('bDBS');
    expect(fullText).toContain('[1]');
    expect(fullText).toContain('Jones [2]');
    expect(fullText).toContain('References');
    expect(fullText).toContain('1. Smith, J., Doe, A.');
    expect(fullText).toContain('2. Jones, R.');
    expect(fullText).not.toContain('Should not appear when uncited');
    expect(fullText).not.toContain('| :---');
  });
});
