import type { SectionRole } from '../types/paper';
import type {
  BibSystem,
  CitationDialect,
  ExtractedSlot,
  KnownLatexClass,
  TemplateManifest,
} from '../types/latex';
import {
  cleanLatexDisplay,
  findCommands,
  findEnvironments,
  offsetToLine,
  parseCommandAt,
  skipWhitespaceAndComments,
} from './lexer';

const AUTHOR_BLOCK_COMMANDS = new Set([
  'author',
  'affil',
  'affiliation',
  'institute',
  'email',
  'ead',
  'orcid',
  'corref',
  'cortext',
  'equalcont',
  'address',
  'thanks',
  'IEEEauthorblockN',
  'IEEEauthorblockA',
]);

function detectAdapter(documentClass: string): KnownLatexClass {
  const cls = documentClass.toLowerCase();
  if (cls === 'sn-jnl') return 'sn-jnl';
  if (cls === 'ieeetran') return 'IEEEtran';
  if (cls === 'elsarticle') return 'elsarticle';
  if (cls === 'acmart') return 'acmart';
  if (cls.startsWith('revtex')) return 'revtex';
  if (cls === 'article' || cls === 'report' || cls === 'book') return 'article';
  return 'generic';
}

export function inferSectionRole(headingTitle: string): SectionRole {
  const lower = headingTitle.toLowerCase().trim();
  if (lower.includes('abstract')) return 'abstract';
  if (lower.includes('intro')) return 'introduction';
  if (lower.includes('related work') || lower.includes('background') || lower.includes('literature')) {
    return 'related_work';
  }
  if (
    lower.includes('method') ||
    lower.includes('material') ||
    lower.includes('experimental') ||
    lower.includes('approach') ||
    lower.includes('methodology')
  ) {
    return 'methods';
  }
  if (lower.includes('result') || lower.includes('experiment') || lower.includes('evaluation') || lower.includes('finding')) {
    return 'results';
  }
  if (lower.includes('discussion')) return 'discussion';
  if (lower.includes('conclu') || lower.includes('summary') || lower.includes('future work')) {
    return 'conclusion';
  }
  if (lower.includes('acknowledg')) return 'acknowledgments';
  if (lower.includes('declaration') || lower.includes('ethics') || lower.includes('funding')) {
    return 'declarations';
  }
  if (lower.includes('supplement')) return 'supplementary';
  if (lower.includes('appendix') || lower.includes('appendices')) return 'appendix';
  return 'custom';
}

function makeSnippet(raw: string, maxLen = 110): string {
  const singleLine = raw.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLen) return singleLine;
  return `${singleLine.slice(0, maxLen - 1)}…`;
}

/**
 * Inspects a LaTeX template `.tex` source and extracts its document class,
 * loaded packages, bibliography system, and every replaceable front-matter
 * and section slot with exact character offsets.
 */
export function scanLatexTemplate(
  rawSource: string,
  options: { id?: string; name?: string; entryFile?: string; supportingFiles?: string[] } = {}
): TemplateManifest {
  const docEnvs = findEnvironments(rawSource, new Set(['document']));
  const docEnv = docEnvs[0];
  const preambleEndOffset = docEnv ? docEnv.start : rawSource.length;
  const documentBeginOffset = docEnv ? docEnv.bodyStart : 0;
  const documentEndOffset = docEnv ? docEnv.bodyEnd : rawSource.length;

  // 1. \documentclass[opts]{class}
  const classCmds = findCommands(rawSource, new Set(['documentclass']), 0, preambleEndOffset);
  const classCmd = classCmds[0];
  const documentClass = classCmd?.args[0]?.content.trim() || 'article';
  const classOptions = (classCmd?.optArgs[0]?.content || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const detectedAdapter = detectAdapter(documentClass);

  // 2. \usepackage{...}
  const pkgCmds = findCommands(rawSource, new Set(['usepackage', 'RequirePackage']), 0, preambleEndOffset);
  const packagesSet = new Set<string>();
  for (const cmd of pkgCmds) {
    const list = cmd.args[0]?.content || '';
    for (const pkg of list.split(',')) {
      const clean = pkg.trim();
      if (clean) packagesSet.add(clean);
    }
  }
  const packages = Array.from(packagesSet);

  // 3. Bibliography system & citation dialect
  const bibCmds = findCommands(
    rawSource,
    new Set(['bibliography', 'bibliographystyle', 'addbibresource', 'printbibliography']),
    0,
    rawSource.length,
    (name) => (name === 'printbibliography' ? 0 : 1)
  );
  const hasBiblatexPkg = packages.includes('biblatex');
  const addBibResCmd = bibCmds.find((c) => c.name === 'addbibresource');
  const printBibCmd = bibCmds.find((c) => c.name === 'printbibliography');
  const bibFileCmd = bibCmds.find((c) => c.name === 'bibliography');
  const bibStyleCmd = bibCmds.find((c) => c.name === 'bibliographystyle');

  let bibSystem: BibSystem = 'none';
  if (hasBiblatexPkg || addBibResCmd || printBibCmd) {
    bibSystem = 'biblatex';
  } else if (bibFileCmd) {
    bibSystem = 'bibtex';
  }

  let citationDialect: CitationDialect = 'cite';
  if (bibSystem === 'biblatex') {
    citationDialect = 'biblatex';
  } else if (
    packages.includes('natbib') ||
    detectedAdapter === 'sn-jnl' ||
    detectedAdapter === 'elsarticle' ||
    detectedAdapter === 'acmart'
  ) {
    citationDialect = 'natbib';
  }

  const slots: ExtractedSlot[] = [];
  let slotCounter = 0;
  const nextId = (prefix: string) => `${prefix}-${++slotCounter}`;

  // 4. Title (\title[short]{...}) — can live in preamble or right after \begin{document}
  const titleCmds = findCommands(rawSource, new Set(['title']), 0, documentEndOffset);
  if (titleCmds[0]) {
    const t = titleCmds[0];
    slots.push({
      id: 'slot-title',
      kind: 'title',
      label: 'Paper Title',
      start: t.start,
      end: t.end,
      startLine: offsetToLine(rawSource, t.start),
      endLine: offsetToLine(rawSource, t.end),
      sampleSnippet: cleanLatexDisplay(t.args[0]?.content || ''),
      syntaxForm: 'command',
      commandName: 'title',
    });
  }

  // 5. Authors & Affiliations contiguous region
  // Look across preamble + early document (before first \section / \abstract / \begin{abstract})
  const firstSectionCmd = findCommands(rawSource, new Set(['section']), documentBeginOffset, documentEndOffset)[0];
  const authorSearchEnd = firstSectionCmd ? firstSectionCmd.start : documentEndOffset;
  const authorCmds = findCommands(rawSource, AUTHOR_BLOCK_COMMANDS, 0, authorSearchEnd, (name) => {
    if (name === 'author' || name === 'affil' || name === 'affiliation' || name === 'institute') return 1;
    return 1;
  }).filter((cmd) => {
    // Ignore \author inside another parsed command (e.g., nested helper)
    return cmd.start >= 0;
  });

  if (authorCmds.length > 0) {
    // Group contiguous author/affiliation declarations (stopping if something major like \maketitle or \abstract sits between)
    const firstAuth = authorCmds[0];
    let blockEnd = firstAuth.end;
    for (let k = 1; k < authorCmds.length; k++) {
      const prevEnd = blockEnd;
      const candidate = authorCmds[k];
      const between = rawSource.slice(prevEnd, candidate.start);
      // Stop grouping if \maketitle, \begin{abstract}, \abstract{, or \section appears in between
      if (/\\(maketitle|abstract\b|begin\{abstract\}|section\b|keywords\b)/.test(between)) {
        break;
      }
      // Also stop if \begin{document} separates preamble from body unless both are in the same zone
      if (/\\begin\{document\}/.test(between)) {
        break;
      }
      blockEnd = Math.max(blockEnd, candidate.end);
    }

    slots.push({
      id: 'slot-authors',
      kind: 'authors',
      label: 'Authors & Affiliations',
      start: firstAuth.start,
      end: blockEnd,
      startLine: offsetToLine(rawSource, firstAuth.start),
      endLine: offsetToLine(rawSource, blockEnd),
      sampleSnippet: makeSnippet(rawSource.slice(firstAuth.start, blockEnd)),
      syntaxForm: 'block',
    });
  }

  // 6. Date (\date{...})
  const dateCmd = findCommands(rawSource, new Set(['date']), 0, authorSearchEnd)[0];
  if (dateCmd) {
    slots.push({
      id: 'slot-date',
      kind: 'date',
      label: 'Date',
      start: dateCmd.start,
      end: dateCmd.end,
      startLine: offsetToLine(rawSource, dateCmd.start),
      endLine: offsetToLine(rawSource, dateCmd.end),
      sampleSnippet: cleanLatexDisplay(dateCmd.args[0]?.content || ''),
      syntaxForm: 'command',
      commandName: 'date',
    });
  }

  // 7. Abstract: supports BOTH \begin{abstract}...\end{abstract} AND Springer Nature's \abstract{...}
  const abstractEnvs = findEnvironments(rawSource, new Set(['abstract']), documentBeginOffset, documentEndOffset);
  if (abstractEnvs[0]) {
    const env = abstractEnvs[0];
    slots.push({
      id: 'slot-abstract',
      kind: 'abstract',
      label: 'Abstract',
      suggestedRole: 'abstract',
      start: env.start,
      end: env.end,
      startLine: offsetToLine(rawSource, env.start),
      endLine: offsetToLine(rawSource, env.end),
      sampleSnippet: makeSnippet(rawSource.slice(env.bodyStart, env.bodyEnd)),
      syntaxForm: 'environment',
      commandName: 'abstract',
    });
  } else {
    const abstractCmds = findCommands(rawSource, new Set(['abstract']), documentBeginOffset, documentEndOffset);
    if (abstractCmds[0]) {
      const cmd = abstractCmds[0];
      slots.push({
        id: 'slot-abstract',
        kind: 'abstract',
        label: 'Abstract (Command)',
        suggestedRole: 'abstract',
        start: cmd.start,
        end: cmd.end,
        startLine: offsetToLine(rawSource, cmd.start),
        endLine: offsetToLine(rawSource, cmd.end),
        sampleSnippet: makeSnippet(cmd.args[0]?.content || ''),
        syntaxForm: 'command',
        commandName: 'abstract',
      });
    }
  }

  // 8. Keywords: \keywords{...} OR \begin{IEEEkeywords} OR \begin{keyword}
  const keywordEnvs = findEnvironments(
    rawSource,
    new Set(['IEEEkeywords', 'keyword', 'keywords']),
    documentBeginOffset,
    documentEndOffset
  );
  if (keywordEnvs[0]) {
    const env = keywordEnvs[0];
    slots.push({
      id: 'slot-keywords',
      kind: 'keywords',
      label: `Keywords (${env.name})`,
      start: env.start,
      end: env.end,
      startLine: offsetToLine(rawSource, env.start),
      endLine: offsetToLine(rawSource, env.end),
      sampleSnippet: makeSnippet(rawSource.slice(env.bodyStart, env.bodyEnd)),
      syntaxForm: 'environment',
      commandName: env.name,
    });
  } else {
    const kwCmd = findCommands(rawSource, new Set(['keywords', 'keyword']), 0, documentEndOffset)[0];
    if (kwCmd) {
      slots.push({
        id: 'slot-keywords',
        kind: 'keywords',
        label: 'Keywords',
        start: kwCmd.start,
        end: kwCmd.end,
        startLine: offsetToLine(rawSource, kwCmd.start),
        endLine: offsetToLine(rawSource, kwCmd.end),
        sampleSnippet: makeSnippet(kwCmd.args[0]?.content || ''),
        syntaxForm: 'command',
        commandName: kwCmd.name,
      });
    }
  }

  // 9. Elsevier Highlights environment (if present)
  const highlightEnv = findEnvironments(rawSource, new Set(['highlights']), documentBeginOffset, documentEndOffset)[0];
  if (highlightEnv) {
    slots.push({
      id: 'slot-highlights',
      kind: 'highlights',
      label: 'Research Highlights',
      start: highlightEnv.start,
      end: highlightEnv.end,
      startLine: offsetToLine(rawSource, highlightEnv.start),
      endLine: offsetToLine(rawSource, highlightEnv.end),
      sampleSnippet: makeSnippet(rawSource.slice(highlightEnv.bodyStart, highlightEnv.bodyEnd)),
      syntaxForm: 'environment',
      commandName: 'highlights',
    });
  }

  // 10. Body Sections, Springer \bmhead, Appendices, and Bibliography boundaries
  const appendixEnvs = findEnvironments(
    rawSource,
    new Set(['appendices', 'appendix']),
    documentBeginOffset,
    documentEndOffset
  );
  const appendixRanges = appendixEnvs.map((e) => ({ start: e.start, end: e.end }));

  const structuralCmds = findCommands(
    rawSource,
    new Set([
      'section',
      'bmhead',
      'backmatter',
      'appendix',
      'bibliographystyle',
      'bibliography',
      'printbibliography',
      'nocite',
    ]),
    documentBeginOffset,
    documentEndOffset,
    (name) => (name === 'backmatter' || name === 'appendix' || name === 'printbibliography' ? 0 : 1)
  );

  // Filter out \section inside an already-captured \begin{appendices}...\end{appendices}
  const topStructural = structuralCmds.filter(
    (cmd) => !appendixRanges.some((r) => cmd.start > r.start && cmd.end < r.end)
  );

  // Build ordered structural landmarks so each section ends precisely at the next landmark
  type Landmark = { start: number; end: number; kind: string };
  const landmarks: Landmark[] = [
    ...topStructural.map((c) => ({ start: c.start, end: c.end, kind: c.name })),
    ...appendixEnvs.map((e) => ({ start: e.start, end: e.end, kind: 'appendices_env' })),
    { start: documentEndOffset, end: documentEndOffset, kind: 'end_document' },
  ].sort((a, b) => a.start - b.start);

  const nextLandmarkAfter = (pos: number): number => {
    const next = landmarks.find((lm) => lm.start > pos);
    return next ? next.start : documentEndOffset;
  };

  for (const cmd of topStructural) {
    if (cmd.name === 'section' || cmd.name === 'bmhead') {
      const headingRaw = cmd.args[0]?.content || 'Section';
      const headingClean = cleanLatexDisplay(headingRaw);
      const endOffset = nextLandmarkAfter(cmd.start);

      // Check for an immediately following \label{...}
      let latexLabel: string | undefined;
      const afterCmd = skipWhitespaceAndComments(rawSource, cmd.end);
      if (rawSource.startsWith('\\label', afterCmd)) {
        const lbl = parseCommandAt(rawSource, afterCmd, 1, 0);
        if (lbl && lbl.args[0]) {
          latexLabel = lbl.args[0].content.trim();
        }
      }

      const role = inferSectionRole(headingClean);
      const isDeclarations = role === 'declarations';
      slots.push({
        id: nextId(isDeclarations ? 'slot-decl' : cmd.name === 'bmhead' ? 'slot-bmhead' : 'slot-sec'),
        kind: isDeclarations ? 'declarations' : cmd.name === 'bmhead' ? 'backmatter_heading' : 'section',
        label: headingClean,
        suggestedRole: role,
        start: cmd.start,
        end: endOffset,
        startLine: offsetToLine(rawSource, cmd.start),
        endLine: offsetToLine(rawSource, Math.max(cmd.start, endOffset - 1)),
        sampleSnippet: makeSnippet(rawSource.slice(cmd.end, endOffset)),
        sectionTitle: headingClean,
        starred: cmd.starred,
        syntaxForm: 'command',
        commandName: cmd.name,
        latexLabel,
      });
    } else if (cmd.name === 'bibliography' || cmd.name === 'printbibliography') {
      slots.push({
        id: 'slot-bibliography',
        kind: 'bibliography',
        label: cmd.name === 'printbibliography' ? 'Bibliography (BibLaTeX)' : 'Bibliography (BibTeX)',
        start: cmd.start,
        end: cmd.end,
        startLine: offsetToLine(rawSource, cmd.start),
        endLine: offsetToLine(rawSource, cmd.end),
        sampleSnippet: rawSource.slice(cmd.start, cmd.end),
        syntaxForm: 'command',
        commandName: cmd.name,
      });
    }
  }

  for (const appEnv of appendixEnvs) {
    slots.push({
      id: nextId('slot-appendix'),
      kind: 'appendix',
      label: 'Appendices',
      suggestedRole: 'appendix',
      start: appEnv.start,
      end: appEnv.end,
      startLine: offsetToLine(rawSource, appEnv.start),
      endLine: offsetToLine(rawSource, appEnv.end),
      sampleSnippet: makeSnippet(rawSource.slice(appEnv.bodyStart, appEnv.bodyEnd)),
      syntaxForm: 'environment',
      commandName: appEnv.name,
    });
  }

  // Sort slots by appearance order in template
  slots.sort((a, b) => a.start - b.start);

  return {
    id: options.id || `tpl-${documentClass.toLowerCase()}`,
    name: options.name || `${documentClass} Template`,
    entryFile: options.entryFile || 'main.tex',
    documentClass,
    classOptions,
    detectedAdapter,
    packages,
    bibSystem,
    citationDialect,
    bibStyle: bibStyleCmd?.args[0]?.content.trim(),
    bibResourceName:
      bibFileCmd?.args[0]?.content.trim() || addBibResCmd?.args[0]?.content.trim(),
    hasCleveref: packages.includes('cleveref'),
    hasBooktabs: packages.includes('booktabs'),
    hasGraphicx: packages.includes('graphicx') || detectedAdapter === 'sn-jnl',
    hasAmsmath: packages.includes('amsmath') || detectedAdapter === 'sn-jnl',
    hasHyperref: packages.includes('hyperref'),
    preambleEndOffset,
    documentBeginOffset,
    documentEndOffset,
    slots,
    supportingFiles: options.supportingFiles || [],
    rawSource,
  };
}
