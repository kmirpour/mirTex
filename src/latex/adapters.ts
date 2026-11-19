import type { PaperFrontMatter } from '../types/paper';
import type { ExtractedSlot, TemplateManifest } from '../types/latex';
import { escapeLatexText } from './markdownToLatex';

/**
 * Generates LaTeX snippets for front-matter slots (Title, Authors/Affiliations,
 * Abstract, Keywords, Highlights, Declarations) tailored to each journal class.
 * Springer Nature (`sn-jnl`) is supported as a first-class dialect alongside
 * IEEEtran, elsarticle, acmart, revtex, and standard article/authblk.
 */

export function renderTitleSlot(fm: PaperFrontMatter, manifest: TemplateManifest): string {
  const full = escapeLatexText(fm.title || 'Untitled Manuscript');
  const short = escapeLatexText(fm.shortTitle || fm.title || 'Untitled');
  if (manifest.detectedAdapter === 'sn-jnl') {
    return `\\title[${short}]{${full}}`;
  }
  return `\\title{${full}}`;
}

export function renderAuthorsSlot(fm: PaperFrontMatter, manifest: TemplateManifest): string {
  const affilIndex = new Map<string, number>();
  fm.affiliations.forEach((a, idx) => affilIndex.set(a.id, idx + 1));

  switch (manifest.detectedAdapter) {
    case 'sn-jnl':
      return renderSpringerNatureAuthors(fm, affilIndex);
    case 'IEEEtran':
      return renderIeeeAuthors(fm, affilIndex);
    case 'elsarticle':
      return renderElsevierAuthors(fm, affilIndex);
    case 'acmart':
      return renderAcmAuthors(fm);
    case 'revtex':
      return renderRevtexAuthors(fm);
    default:
      return renderStandardAuthors(fm, manifest, affilIndex);
  }
}

function renderSpringerNatureAuthors(
  fm: PaperFrontMatter,
  affilIndex: Map<string, number>
): string {
  const lines: string[] = [];
  const hasEqual = fm.authors.some((a) => a.equalContribution);

  for (const author of fm.authors) {
    const nums = author.affiliationIds
      .map((id) => affilIndex.get(id))
      .filter((n): n is number => n !== undefined);
    const numSpec = nums.length > 0 ? `[${nums.join(',')}]` : '[1]';
    const star = author.corresponding ? '*' : '';
    const fnm = escapeLatexText(author.firstName);
    const sur = escapeLatexText(author.lastName);
    let line = `\\author${star}${numSpec}{\\fnm{${fnm}} \\sur{${sur}}}`;
    if (author.email?.trim()) {
      line += `\\email{${escapeLatexText(author.email.trim())}}`;
    }
    if (author.equalContribution && hasEqual) {
      line += `\n\\equalcont{These authors contributed equally to this work.}`;
    }
    lines.push(line);
  }

  lines.push('');

  fm.affiliations.forEach((aff, idx) => {
    const n = idx + 1;
    const isCorrAffil = fm.authors.some(
      (a) => a.corresponding && a.affiliationIds.includes(aff.id)
    );
    const star = isCorrAffil ? '*' : '';
    const parts: string[] = [];
    if (aff.department?.trim()) parts.push(`\\orgdiv{${escapeLatexText(aff.department)}}`);
    if (aff.institution?.trim()) parts.push(`\\orgname{${escapeLatexText(aff.institution)}}`);

    const addrParts: string[] = [];
    if (aff.city?.trim()) addrParts.push(`\\city{${escapeLatexText(aff.city)}}`);
    if (aff.postcode?.trim()) addrParts.push(`\\postcode{${escapeLatexText(aff.postcode)}}`);
    if (aff.state?.trim()) addrParts.push(`\\state{${escapeLatexText(aff.state)}}`);
    if (aff.country?.trim()) addrParts.push(`\\country{${escapeLatexText(aff.country)}}`);
    if (addrParts.length > 0) {
      parts.push(`\\orgaddress{${addrParts.join(', ')}}`);
    }

    lines.push(`\\affil${star}[${n}]{${parts.join(', ')}}`);
  });

  return lines.join('\n');
}

function renderIeeeAuthors(
  fm: PaperFrontMatter,
  affilIndex: Map<string, number>
): string {
  const blocks = fm.authors.map((a) => {
    const fullName = escapeLatexText(`${a.firstName} ${a.lastName}`.trim());
    const firstAffId = a.affiliationIds[0];
    const aff = fm.affiliations.find((x) => x.id === firstAffId);
    const affLine = aff
      ? escapeLatexText([aff.department, aff.institution, aff.city, aff.country].filter(Boolean).join(', '))
      : '';
    const emailLine = a.email ? `\\\\${escapeLatexText(a.email)}` : '';
    const sup = affilIndex.size > 1 && firstAffId ? `\\textsuperscript{${affilIndex.get(firstAffId) ?? 1}}` : '';
    return `\\IEEEauthorblockN{${fullName}${sup}}\n\\IEEEauthorblockA{${affLine}${emailLine}}`;
  });
  return `\\author{\n${blocks.join('\n\\and\n')}\n}`;
}

function renderElsevierAuthors(
  fm: PaperFrontMatter,
  affilIndex: Map<string, number>
): string {
  const lines: string[] = [];
  for (const a of fm.authors) {
    const labels = a.affiliationIds
      .map((id) => affilIndex.get(id))
      .filter((n): n is number => n !== undefined)
      .map((n) => `inst${n}`);
    const opt = labels.length > 0 ? `[${labels.join(',')}]` : '';
    const name = escapeLatexText(`${a.firstName} ${a.lastName}`.trim());
    const cor = a.corresponding ? '\\corref{cor1}' : '';
    lines.push(`\\author${opt}{${name}${cor}}`);
    if (a.email?.trim()) {
      lines.push(`\\ead{${escapeLatexText(a.email.trim())}}`);
    }
  }
  if (fm.authors.some((a) => a.corresponding)) {
    lines.push(`\\cortext[cor1]{Corresponding author}`);
  }
  fm.affiliations.forEach((aff, idx) => {
    const fields: string[] = [];
    if (aff.institution?.trim()) fields.push(`organization={${escapeLatexText(aff.institution)}}`);
    if (aff.department?.trim()) fields.push(`addressline={${escapeLatexText(aff.department)}}`);
    if (aff.city?.trim()) fields.push(`city={${escapeLatexText(aff.city)}}`);
    if (aff.postcode?.trim()) fields.push(`postcode={${escapeLatexText(aff.postcode)}}`);
    if (aff.country?.trim()) fields.push(`country={${escapeLatexText(aff.country)}}`);
    lines.push(`\\affiliation[inst${idx + 1}]{${fields.join(', ')}}`);
  });
  return lines.join('\n');
}

function renderAcmAuthors(fm: PaperFrontMatter): string {
  return fm.authors
    .map((a) => {
      const lines = [`\\author{${escapeLatexText(`${a.firstName} ${a.lastName}`.trim())}}`];
      if (a.orcid?.trim()) lines.push(`\\orcid{${escapeLatexText(a.orcid.trim())}}`);
      if (a.email?.trim()) lines.push(`\\email{${escapeLatexText(a.email.trim())}}`);
      const aff = fm.affiliations.find((x) => x.id === a.affiliationIds[0]);
      if (aff) {
        lines.push('\\affiliation{%');
        if (aff.department?.trim()) lines.push(`  \\department{${escapeLatexText(aff.department)}}`);
        if (aff.institution?.trim()) lines.push(`  \\institution{${escapeLatexText(aff.institution)}}`);
        if (aff.city?.trim()) lines.push(`  \\city{${escapeLatexText(aff.city)}}`);
        if (aff.country?.trim()) lines.push(`  \\country{${escapeLatexText(aff.country)}}`);
        lines.push('}');
      }
      return lines.join('\n');
    })
    .join('\n');
}

function renderRevtexAuthors(fm: PaperFrontMatter): string {
  return fm.authors
    .map((a) => {
      const lines = [`\\author{${escapeLatexText(`${a.firstName} ${a.lastName}`.trim())}}`];
      if (a.email?.trim()) lines.push(`\\email{${escapeLatexText(a.email.trim())}}`);
      const aff = fm.affiliations.find((x) => x.id === a.affiliationIds[0]);
      if (aff) {
        const text = [aff.department, aff.institution, aff.city, aff.country].filter(Boolean).join(', ');
        lines.push(`\\affiliation{${escapeLatexText(text)}}`);
      }
      return lines.join('\n');
    })
    .join('\n');
}

function renderStandardAuthors(
  fm: PaperFrontMatter,
  manifest: TemplateManifest,
  affilIndex: Map<string, number>
): string {
  if (manifest.packages.includes('authblk')) {
    const lines: string[] = [];
    for (const a of fm.authors) {
      const nums = a.affiliationIds
        .map((id) => affilIndex.get(id))
        .filter((n): n is number => n !== undefined);
      const opt = nums.length > 0 ? `[${nums.join(',')}]` : '';
      const name = escapeLatexText(`${a.firstName} ${a.lastName}`.trim());
      const star = a.corresponding && a.email ? `\\thanks{Corresponding author: \\texttt{${escapeLatexText(a.email)}}}` : '';
      lines.push(`\\author${opt}{${name}${star}}`);
    }
    fm.affiliations.forEach((aff, idx) => {
      const text = [aff.department, aff.institution, aff.city, aff.country].filter(Boolean).join(', ');
      lines.push(`\\affil[${idx + 1}]{${escapeLatexText(text)}}`);
    });
    return lines.join('\n');
  }

  // Pure base `article` without authblk
  const authorChunks = fm.authors.map((a) => {
    const name = escapeLatexText(`${a.firstName} ${a.lastName}`.trim());
    const aff = fm.affiliations.find((x) => x.id === a.affiliationIds[0]);
    const affText = aff
      ? escapeLatexText([aff.department, aff.institution, aff.country].filter(Boolean).join(', '))
      : '';
    const emailPart = a.email ? `\\\\\\texttt{${escapeLatexText(a.email)}}` : '';
    return affText ? `${name}\\\\${affText}${emailPart}` : `${name}${emailPart}`;
  });
  return `\\author{${authorChunks.join(' \\and ')}}`;
}

export function renderAbstractSlot(abstractLatexBody: string, slot: ExtractedSlot): string {
  const body = abstractLatexBody.trim();
  if (slot.syntaxForm === 'command') {
    return `\\abstract{${body}}`;
  }
  return `\\begin{abstract}\n${body}\n\\end{abstract}`;
}

export function renderKeywordsSlot(keywords: string[], slot: ExtractedSlot, manifest: TemplateManifest): string {
  const clean = keywords.map((k) => escapeLatexText(k.trim())).filter(Boolean);
  if (slot.syntaxForm === 'environment') {
    const sep = manifest.detectedAdapter === 'elsarticle' ? ' \\sep ' : ', ';
    const env = slot.commandName || 'IEEEkeywords';
    return `\\begin{${env}}\n${clean.join(sep)}\n\\end{${env}}`;
  }
  const cmd = slot.commandName || 'keywords';
  return `\\${cmd}{${clean.join(', ')}}`;
}

export function renderHighlightsSlot(highlights: string[]): string {
  const items = highlights
    .map((h) => h.trim())
    .filter(Boolean)
    .map((h) => `  \\item ${escapeLatexText(h)}`);
  if (items.length === 0) return '';
  return `\\begin{highlights}\n${items.join('\n')}\n\\end{highlights}`;
}

export function renderDeclarationsSlot(
  fm: PaperFrontMatter,
  overrideLatexBody?: string
): string {
  if (overrideLatexBody && overrideLatexBody.trim()) {
    return `\\section*{Declarations}\n\n${overrideLatexBody.trim()}\n`;
  }
  const d = fm.declarations;
  const items: string[] = [];
  if (d.funding.trim()) items.push(`  \\item \\textbf{Funding:} ${escapeLatexText(d.funding.trim())}`);
  if (d.conflictOfInterest.trim()) {
    items.push(`  \\item \\textbf{Conflict of interest/Competing interests:} ${escapeLatexText(d.conflictOfInterest.trim())}`);
  }
  if (d.ethicsApproval.trim()) {
    items.push(`  \\item \\textbf{Ethics approval:} ${escapeLatexText(d.ethicsApproval.trim())}`);
  }
  if (d.dataAvailability.trim()) {
    items.push(`  \\item \\textbf{Data availability:} ${escapeLatexText(d.dataAvailability.trim())}`);
  }
  if (d.codeAvailability.trim()) {
    items.push(`  \\item \\textbf{Code availability:} ${escapeLatexText(d.codeAvailability.trim())}`);
  }
  if (d.authorContributions.trim()) {
    items.push(`  \\item \\textbf{Author contribution:} ${escapeLatexText(d.authorContributions.trim())}`);
  }
  if (items.length === 0) {
    return `\\section*{Declarations}\n\nNot applicable.\n`;
  }
  return `\\section*{Declarations}\n\n\\begin{itemize}\n${items.join('\n')}\n\\end{itemize}\n`;
}
