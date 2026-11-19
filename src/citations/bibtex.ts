import type { BibEntry, CitationAuditReport } from '../types/citation';

/** Strips outer braces and decodes common LaTeX accents for clean UI display. */
export function cleanBibValue(raw: string): string {
  return raw
    .replace(/\\&/g, '&')
    .replace(/\\%/g, '%')
    .replace(/\\_/g, '_')
    .replace(/--/g, '–')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Balanced-brace BibTeX parser handling nested `{...}`, `"..."`, bare numbers,
 * and string concatenation (`#`).
 */
export function parseBibTeX(source: string): BibEntry[] {
  const entries: BibEntry[] = [];
  const len = source.length;
  let i = 0;

  while (i < len) {
    const atIdx = source.indexOf('@', i);
    if (atIdx === -1) break;

    let j = atIdx + 1;
    while (j < len && /[a-zA-Z]/.test(source[j])) j++;
    const type = source.slice(atIdx + 1, j).toLowerCase();

    while (j < len && /\s/.test(source[j])) j++;
    const openChar = source[j];
    if (openChar !== '{' && openChar !== '(') {
      i = j + 1;
      continue;
    }
    const closeChar = openChar === '{' ? '}' : ')';

    // Find matching entry closing delimiter
    let depth = 0;
    let k = j;
    let inQuotes = false;
    while (k < len) {
      const ch = source[k];
      if (ch === '"' && source[k - 1] !== '\\' && depth === 1) {
        inQuotes = !inQuotes;
      } else if (!inQuotes) {
        if (ch === openChar) depth++;
        else if (ch === closeChar) {
          depth--;
          if (depth === 0) break;
        }
      }
      k++;
    }
    if (k >= len) break;

    const rawEntry = source.slice(atIdx, k + 1).trim();
    const inner = source.slice(j + 1, k);
    i = k + 1;

    if (type === 'comment' || type === 'preamble' || type === 'string' || !type) {
      continue;
    }

    const commaIdx = inner.indexOf(',');
    if (commaIdx === -1) continue;
    const key = inner.slice(0, commaIdx).trim();
    if (!key) continue;

    const fields = parseBibFields(inner.slice(commaIdx + 1));
    entries.push({ key, type, fields, raw: rawEntry });
  }

  return entries;
}

function parseBibFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const len = body.length;
  let i = 0;

  while (i < len) {
    while (i < len && /[\s,]/.test(body[i])) i++;
    if (i >= len) break;

    const nameStart = i;
    while (i < len && /[a-zA-Z0-9_-]/.test(body[i])) i++;
    const name = body.slice(nameStart, i).toLowerCase().trim();
    while (i < len && /\s/.test(body[i])) i++;
    if (!name || body[i] !== '=') {
      while (i < len && body[i] !== ',') i++;
      continue;
    }
    i++; // skip '='
    while (i < len && /\s/.test(body[i])) i++;

    let value = '';
    if (body[i] === '{') {
      let depth = 0;
      const start = i + 1;
      while (i < len) {
        if (body[i] === '{' && body[i - 1] !== '\\') depth++;
        else if (body[i] === '}' && body[i - 1] !== '\\') {
          depth--;
          if (depth === 0) {
            value = body.slice(start, i);
            i++;
            break;
          }
        }
        i++;
      }
    } else if (body[i] === '"') {
      i++;
      const start = i;
      let braceDepth = 0;
      while (i < len) {
        if (body[i] === '{' && body[i - 1] !== '\\') braceDepth++;
        else if (body[i] === '}' && body[i - 1] !== '\\' && braceDepth > 0) braceDepth--;
        else if (body[i] === '"' && body[i - 1] !== '\\' && braceDepth === 0) {
          value = body.slice(start, i);
          i++;
          break;
        }
        i++;
      }
    } else {
      const start = i;
      while (i < len && body[i] !== ',' && body[i] !== '\n') i++;
      value = body.slice(start, i).trim();
    }

    fields[name] = value.replace(/\s+/g, ' ').trim();
  }

  return fields;
}

export function serializeBibEntry(entry: BibEntry): string {
  const orderedKeys = [
    'author',
    'title',
    'journal',
    'booktitle',
    'year',
    'volume',
    'number',
    'pages',
    'publisher',
    'doi',
    'url',
  ];
  const rest = Object.keys(entry.fields).filter((k) => !orderedKeys.includes(k));
  const keys = [...orderedKeys.filter((k) => entry.fields[k]?.trim()), ...rest.filter((k) => entry.fields[k]?.trim())];

  const fieldLines = keys.map((k, idx) => {
    const comma = idx < keys.length - 1 ? ',' : '';
    return `  ${k} = {${entry.fields[k]}}${comma}`;
  });
  return `@${entry.type}{${entry.key},\n${fieldLines.join('\n')}\n}`;
}

export function serializeBibLibrary(entries: BibEntry[]): string {
  return entries.map(serializeBibEntry).join('\n\n') + (entries.length > 0 ? '\n' : '');
}

/** Merges incoming BibTeX entries into existing entries without creating duplicates by key or DOI. */
export function mergeBibEntries(existing: BibEntry[], incoming: BibEntry[]): {
  merged: BibEntry[];
  addedCount: number;
} {
  const byKey = new Map<string, BibEntry>();
  const seenDois = new Set<string>();

  for (const e of existing) {
    byKey.set(e.key, e);
    const doi = e.fields.doi?.trim().toLowerCase();
    if (doi) seenDois.add(doi);
  }

  let addedCount = 0;
  for (const inc of incoming) {
    const doi = inc.fields.doi?.trim().toLowerCase();
    if (byKey.has(inc.key)) continue;
    if (doi && seenDois.has(doi)) continue;
    byKey.set(inc.key, inc);
    if (doi) seenDois.add(doi);
    addedCount++;
  }

  return { merged: Array.from(byKey.values()), addedCount };
}

/** Returns only entries whose keys are actually cited in the manuscript (for clean export). */
export function pruneBibEntries(entries: BibEntry[], citedKeys: string[]): BibEntry[] {
  if (citedKeys.length === 0) return entries;
  const set = new Set(citedKeys);
  const pruned = entries.filter((e) => set.has(e.key));
  return pruned.length > 0 ? pruned : entries;
}

/** Extracts all cited keys in order of appearance from Markdown text. */
export function extractCitedKeysFromMarkdown(markdown: string): string[] {
  const keys: string[] = [];

  // 1. Bracketed citations: [@a; @b]
  const bracketRe = /\[([^\]]*@[a-zA-Z0-9_.:-]+[^\]]*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = bracketRe.exec(markdown)) !== null) {
    const inner = m[1];
    const keyRe = /@([a-zA-Z0-9_.:-]+)/g;
    let km: RegExpExecArray | null;
    while ((km = keyRe.exec(inner)) !== null) {
      const k = km[1];
      if (!/^(?:fig|tbl|eq|sec):/.test(k)) {
        keys.push(k);
      }
    }
  }

  // 2. Narrative citations outside brackets: @smith2024
  const withoutBrackets = markdown.replace(bracketRe, ' ');
  const narrRe = /(?<![a-zA-Z0-9_.+-])@([a-zA-Z][a-zA-Z0-9_:-]{2,})/g;
  while ((m = narrRe.exec(withoutBrackets)) !== null) {
    const k = m[1];
    if (!/^(?:fig|tbl|eq|sec):/.test(k)) {
      keys.push(k);
    }
  }

  return keys;
}

/** Audits every citation across all paper sections against the BibTeX library. */
export function auditCitations(sectionMarkdowns: string[], entries: BibEntry[]): CitationAuditReport {
  const usageCounts: Record<string, number> = {};
  for (const md of sectionMarkdowns) {
    for (const key of extractCitedKeysFromMarkdown(md)) {
      usageCounts[key] = (usageCounts[key] || 0) + 1;
    }
  }

  const entryMap = new Map(entries.map((e) => [e.key, e]));
  const citedKeys = Object.keys(usageCounts);
  const missingKeys = citedKeys.filter((k) => !entryMap.has(k));
  const unusedKeys = entries.map((e) => e.key).filter((k) => !usageCounts[k]);

  const incompleteEntries: { key: string; missingFields: string[] }[] = [];
  for (const entry of entries) {
    const missing: string[] = [];
    if (!entry.fields.title?.trim()) missing.push('title');
    if (!entry.fields.author?.trim() && !entry.fields.editor?.trim()) missing.push('author');
    if (!entry.fields.year?.trim()) missing.push('year');
    if (entry.type === 'article' && !entry.fields.journal?.trim()) missing.push('journal');
    if (missing.length > 0) {
      incompleteEntries.push({ key: entry.key, missingFields: missing });
    }
  }

  return {
    totalCitedKeys: citedKeys.length,
    totalLibraryEntries: entries.length,
    missingKeys,
    unusedKeys,
    incompleteEntries,
    usageCounts,
  };
}

/** Parses a BibTeX author field into structured last names for compact citation display. */
export function parseAuthorList(authorField: string): { first: string; last: string }[] {
  if (!authorField?.trim()) return [];
  return authorField
    .split(/\s+and\s+/i)
    .map((part) => cleanBibValue(part))
    .filter(Boolean)
    .map((person) => {
      if (person.includes(',')) {
        const [last, first] = person.split(',').map((s) => s.trim());
        return { first: first || '', last: last || person };
      }
      const tokens = person.split(/\s+/);
      const last = tokens[tokens.length - 1] || person;
      const first = tokens.slice(0, -1).join(' ');
      return { first, last };
    });
}

export function formatAuthorShort(authorField: string): string {
  const list = parseAuthorList(authorField);
  if (list.length === 0) return 'Unknown';
  if (list.length === 1) return list[0].last;
  if (list.length === 2) return `${list[0].last} & ${list[1].last}`;
  return `${list[0].last} et al.`;
}
