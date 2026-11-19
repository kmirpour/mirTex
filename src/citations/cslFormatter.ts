import type { BibEntry, CitationStyle } from '../types/citation';
import { cleanBibValue, formatAuthorShort, parseAuthorList } from './bibtex';

export interface FormattedBibliography {
  /** key -> 1-based citation order number */
  numberMap: Map<string, number>;
  /** Ordered bibliography lines ready for HTML or DOCX rendering */
  references: { number: number; key: string; formatted: string }[];
}

export function buildBibliographyOrder(
  citedKeysInOrder: string[],
  entries: BibEntry[],
  style: CitationStyle
): FormattedBibliography {
  const entryMap = new Map(entries.map((e) => [e.key, e]));
  const uniqueOrder: string[] = [];
  const seen = new Set<string>();

  for (const k of citedKeysInOrder) {
    if (!seen.has(k) && entryMap.has(k)) {
      seen.add(k);
      uniqueOrder.push(k);
    }
  }

  // APA sorts alphabetically by first author last name then year
  const orderedKeys =
    style === 'apa'
      ? [...uniqueOrder].sort((a, b) => {
          const ea = entryMap.get(a)!;
          const eb = entryMap.get(b)!;
          const la = formatAuthorShort(ea.fields.author || '').toLowerCase();
          const lb = formatAuthorShort(eb.fields.author || '').toLowerCase();
          if (la !== lb) return la.localeCompare(lb);
          return (ea.fields.year || '').localeCompare(eb.fields.year || '');
        })
      : uniqueOrder;

  const numberMap = new Map<string, number>();
  const references = orderedKeys.map((key, idx) => {
    const number = idx + 1;
    numberMap.set(key, number);
    return {
      number,
      key,
      formatted: formatReferenceEntry(entryMap.get(key)!, style, number),
    };
  });

  return { numberMap, references };
}

export function formatInlineCitation(
  keys: string[],
  entries: BibEntry[],
  style: CitationStyle,
  numberMap: Map<string, number>,
  narrative = false
): string {
  const entryMap = new Map(entries.map((e) => [e.key, e]));

  if (style === 'apa') {
    const parts = keys.map((k) => {
      const e = entryMap.get(k);
      if (!e) return `?${k}`;
      const auth = formatAuthorShort(e.fields.author || '');
      const yr = cleanBibValue(e.fields.year || 'n.d.');
      return narrative ? `${auth} (${yr})` : `${auth}, ${yr}`;
    });
    return narrative ? parts.join(', ') : `(${parts.join('; ')})`;
  }

  // Numbered styles: Nature, IEEE, Vancouver
  const nums = keys.map((k) => {
    const n = numberMap.get(k);
    return n !== undefined ? String(n) : `?${k}`;
  });
  if (narrative && keys.length === 1) {
    const e = entryMap.get(keys[0]);
    const auth = e ? formatAuthorShort(e.fields.author || '') : keys[0];
    return `${auth} [${nums[0]}]`;
  }
  if (style === 'vancouver') return `(${nums.join(', ')})`;
  return `[${nums.join(', ')}]`;
}

export function formatReferenceEntry(
  entry: BibEntry,
  style: CitationStyle,
  number?: number
): string {
  const authors = parseAuthorList(entry.fields.author || '');
  const title = cleanBibValue(entry.fields.title || 'Untitled');
  const venue = cleanBibValue(entry.fields.journal || entry.fields.booktitle || entry.fields.publisher || '');
  const year = cleanBibValue(entry.fields.year || '');
  const vol = cleanBibValue(entry.fields.volume || '');
  const num = cleanBibValue(entry.fields.number || '');
  const pages = cleanBibValue(entry.fields.pages || '');
  const doi = cleanBibValue(entry.fields.doi || '');

  const initials = (first: string) =>
    first
      .split(/[\s-]+/)
      .filter(Boolean)
      .map((p) => `${p[0].toUpperCase()}.`)
      .join(' ');

  if (style === 'apa') {
    const authStr =
      authors.length === 0
        ? 'Unknown.'
        : authors.length > 6
          ? `${authors
              .slice(0, 6)
              .map((a) => `${a.last}, ${initials(a.first)}`)
              .join(', ')}, ... ${authors[authors.length - 1].last}, ${initials(authors[authors.length - 1].first)}`
          : authors.map((a) => `${a.last}, ${initials(a.first)}`).join(', ');
    const volPart = vol ? `, ${vol}${num ? `(${num})` : ''}` : '';
    const pagesPart = pages ? `, ${pages}` : '';
    const doiPart = doi ? ` https://doi.org/${doi}` : '';
    return `${authStr} (${year || 'n.d.'}). ${title}. ${venue}${volPart}${pagesPart}.${doiPart}`.replace(/\s+/g, ' ').trim();
  }

  if (style === 'ieee') {
    const authStr =
      authors.length === 0
        ? 'Unknown'
        : authors.length > 6
          ? `${initials(authors[0].first)} ${authors[0].last} et al.`
          : authors.map((a) => `${initials(a.first)} ${a.last}`).join(', ');
    const volPart = vol ? `, vol. ${vol}` : '';
    const numPart = num ? `, no. ${num}` : '';
    const pagesPart = pages ? `, pp. ${pages}` : '';
    const yearPart = year ? `, ${year}` : '';
    const prefix = number !== undefined ? `[${number}] ` : '';
    return `${prefix}${authStr}, "${title}," ${venue}${volPart}${numPart}${pagesPart}${yearPart}.${doi ? ` doi: ${doi}.` : ''}`
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Nature & Vancouver numbered format
  const authStr =
    authors.length === 0
      ? 'Unknown'
      : authors.length > 5
        ? `${authors[0].last}, ${initials(authors[0].first)} et al.`
        : authors.map((a) => `${a.last}, ${initials(a.first)}`).join(', ');
  const volPages = vol ? ` ${vol}${pages ? `, ${pages}` : ''}` : pages ? ` ${pages}` : '';
  const yearPart = year ? ` (${year})` : '';
  const prefix = number !== undefined ? `${number}. ` : '';
  return `${prefix}${authStr} ${title}. ${venue}${volPages}${yearPart}.${doi ? ` https://doi.org/${doi}` : ''}`
    .replace(/\s+/g, ' ')
    .trim();
}
