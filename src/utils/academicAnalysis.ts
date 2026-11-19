import type { BibEntry } from '../types/citation';
import type { PaperFrontMatter, PaperSection } from '../types/paper';
import { auditCitations } from '../citations/bibtex';
import { countAcademicWords, indexPaperElements } from './paperOutline';

export interface AcronymCheckItem {
  acronym: string;
  count: number;
  defined: boolean;
  definedMultipleTimes: boolean;
  firstSection: string;
}

export interface PreFlightIssue {
  severity: 'error' | 'warning' | 'info';
  category: 'citations' | 'crossref' | 'limits' | 'acronyms' | 'frontmatter' | 'todos';
  message: string;
  sectionTitle?: string;
}

export interface PreFlightReport {
  readyScore: number; // 0..100
  issues: PreFlightIssue[];
  acronyms: AcronymCheckItem[];
  totalWords: number;
  figureCount: number;
  tableCount: number;
  equationCount: number;
  citationCount: number;
}

const COMMON_IGNORE_ACRONYMS = new Set([
  'DNA', 'RNA', 'ATP', 'PCR', 'MRI', 'USA', 'PDF', 'CSV', 'URL', 'DOI', 'ORCID',
  'TODO', 'NOTE', 'IEEE', 'ACM', 'HTML', 'JSON', 'HTTP', 'HTTPS', 'FIG', 'EQ',
  'SD', 'SE', 'CI', 'IQR', 'ANOVA', 'STD', 'MIN', 'MAX', 'AVG', 'NS',
]);

/**
 * Tracks all uppercase scientific acronyms across the paper in reading order
 * and flags acronyms that are used without being introduced in parentheses `(ACR)`.
 */
export function analyzeAcronyms(
  sections: { title: string; markdown: string }[]
): AcronymCheckItem[] {
  const map = new Map<
    string,
    { count: number; defCount: number; firstSection: string }
  >();

  for (const sec of sections) {
    // Strip code & math
    const prose = sec.markdown
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\$\$[\s\S]*?\$\$/g, ' ')
      .replace(/\$[^$\n]+\$/g, ' ');

    // Find definitions like "Convolutional Neural Network (CNN)"
    const defRe = /[A-Za-z][a-z]+(?:\s+[A-Za-z][a-z-]+){1,6}\s*\(([A-Z][A-Z0-9]{1,7})\)/g;
    let dm: RegExpExecArray | null;
    while ((dm = defRe.exec(prose)) !== null) {
      const acr = dm[1];
      const entry = map.get(acr) || { count: 0, defCount: 0, firstSection: sec.title };
      entry.defCount++;
      map.set(acr, entry);
    }

    // Count all occurrences of 2–7 letter uppercase acronyms
    const acrRe = /\b([A-Z][A-Z0-9]{1,6})\b/g;
    let am: RegExpExecArray | null;
    while ((am = acrRe.exec(prose)) !== null) {
      const acr = am[1];
      if (/^[IVXLCDM]+$/.test(acr) && acr.length <= 4) continue; // Roman numerals
      const entry = map.get(acr) || { count: 0, defCount: 0, firstSection: sec.title };
      entry.count++;
      map.set(acr, entry);
    }
  }

  return Array.from(map.entries())
    .filter(([acr, info]) => !COMMON_IGNORE_ACRONYMS.has(acr) && info.count >= 2)
    .map(([acronym, info]) => ({
      acronym,
      count: info.count,
      defined: info.defCount > 0,
      definedMultipleTimes: info.defCount > 1,
      firstSection: info.firstSection,
    }))
    .sort((a, b) => Number(a.defined) - Number(b.defined) || b.count - a.count);
}

/**
 * Runs a full pre-submission compliance audit on the manuscript.
 */
export function runPreFlightCheck(params: {
  frontMatter: PaperFrontMatter;
  sections: PaperSection[];
  sectionContents: Record<string, string>;
  bibEntries: BibEntry[];
}): PreFlightReport {
  const { frontMatter, sections, sectionContents, bibEntries } = params;
  const issues: PreFlightIssue[] = [];

  // 1. Front matter completeness
  if (!frontMatter.title.trim() || frontMatter.title === 'Untitled Scientific Manuscript') {
    issues.push({
      severity: 'warning',
      category: 'frontmatter',
      message: 'Paper title is still the default placeholder.',
    });
  }
  if (frontMatter.authors.length === 0) {
    issues.push({
      severity: 'error',
      category: 'frontmatter',
      message: 'No authors are listed on the Front Page.',
    });
  }
  if (!frontMatter.authors.some((a) => a.corresponding)) {
    issues.push({
      severity: 'warning',
      category: 'frontmatter',
      message: 'No author is marked as the Corresponding Author.',
    });
  }
  if (frontMatter.keywords.length === 0) {
    issues.push({
      severity: 'info',
      category: 'frontmatter',
      message: 'No keywords specified on the Front Page.',
    });
  }

  // 2. Section word limits & TODO scan
  const sectionPayload = sections.map((s) => ({
    id: s.id,
    title: s.title,
    markdown: sectionContents[s.id] ?? '',
  }));

  let totalWords = 0;
  for (const sec of sections) {
    const md = sectionContents[sec.id] ?? '';
    const words = countAcademicWords(md);
    totalWords += words;

    if (sec.wordLimit && sec.wordLimit > 0 && words > sec.wordLimit) {
      issues.push({
        severity: 'error',
        category: 'limits',
        sectionTitle: sec.title,
        message: `${sec.title} has ${words} words, exceeding the ${sec.wordLimit}-word journal limit by ${words - sec.wordLimit}.`,
      });
    }

    const todoMatches = md.match(/\b(?:TODO|FIXME|TBD)\b|\[(?:CITE|CITATION NEEDED|REF|INSERT[^\]]*)\]/gi);
    if (todoMatches && todoMatches.length > 0) {
      issues.push({
        severity: 'warning',
        category: 'todos',
        sectionTitle: sec.title,
        message: `${todoMatches.length} unresolved placeholder(s) found in ${sec.title} (e.g., "${todoMatches[0]}").`,
      });
    }
  }

  // 3. Citations audit
  const citeAudit = auditCitations(
    sectionPayload.map((s) => s.markdown),
    bibEntries
  );
  for (const missing of citeAudit.missingKeys) {
    issues.push({
      severity: 'error',
      category: 'citations',
      message: `Broken citation [@${missing}] — key not found in references.bib.`,
    });
  }
  if (citeAudit.unusedKeys.length > 0) {
    issues.push({
      severity: 'info',
      category: 'citations',
      message: `${citeAudit.unusedKeys.length} unused entry(ies) in references.bib (will be automatically pruned on journal export).`,
    });
  }

  // 4. Cross-references audit
  const elements = indexPaperElements(sectionPayload);
  const validLabels = new Set(elements.map((e) => e.label));
  const referencedLabels = new Set<string>();

  for (const sec of sectionPayload) {
    const refRe = /(?<![a-zA-Z0-9_])@((?:fig|tbl|eq|sec):[a-zA-Z0-9_.-]+)/g;
    let rm: RegExpExecArray | null;
    while ((rm = refRe.exec(sec.markdown)) !== null) {
      const label = rm[1];
      referencedLabels.add(label);
      if (!validLabels.has(label)) {
        issues.push({
          severity: 'error',
          category: 'crossref',
          sectionTitle: sec.title,
          message: `Broken cross-reference @${label} in ${sec.title} — no matching label found.`,
        });
      }
    }
  }

  // Flag unreferenced figures/tables
  for (const el of elements) {
    if ((el.kind === 'figure' || el.kind === 'table') && !referencedLabels.has(el.label)) {
      issues.push({
        severity: 'warning',
        category: 'crossref',
        sectionTitle: el.sectionTitle,
        message: `${el.kind === 'figure' ? 'Figure' : 'Table'} "${el.title}" (@${el.label}) is never referenced in the text.`,
      });
    }
  }

  // 5. Acronyms check
  const acronyms = analyzeAcronyms(sectionPayload);
  for (const a of acronyms) {
    if (!a.defined) {
      issues.push({
        severity: 'warning',
        category: 'acronyms',
        sectionTitle: a.firstSection,
        message: `Acronym "${a.acronym}" is used ${a.count} times (first in ${a.firstSection}) without an explicit first-use definition.`,
      });
    } else if (a.definedMultipleTimes) {
      issues.push({
        severity: 'info',
        category: 'acronyms',
        message: `Acronym "${a.acronym}" appears to be defined more than once.`,
      });
    }
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warnCount = issues.filter((i) => i.severity === 'warning').length;
  const readyScore = Math.max(0, 100 - errorCount * 18 - warnCount * 6);

  return {
    readyScore,
    issues,
    acronyms,
    totalWords,
    figureCount: elements.filter((e) => e.kind === 'figure').length,
    tableCount: elements.filter((e) => e.kind === 'table').length,
    equationCount: elements.filter((e) => e.kind === 'equation').length,
    citationCount: citeAudit.totalCitedKeys,
  };
}
