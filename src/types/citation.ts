export type CitationStyle = 'nature' | 'apa' | 'ieee' | 'vancouver';

export interface BibEntry {
  key: string;
  type: string; // article, inproceedings, book, misc, etc.
  fields: Record<string, string>;
  raw: string;
}

export interface ZoteroStatus {
  connected: boolean;
  mode: 'local-api' | 'better-bibtex' | 'offline';
  port: number;
  message: string;
}

export interface ZoteroSearchItem {
  key: string;
  citekey: string;
  item_type: string;
  title: string;
  authors: string;
  year: string;
  journal: string;
  doi: string;
  bibtex: string;
}

export interface ZoteroCollection {
  key: string;
  name: string;
  parent_key: string | null;
}

export interface CitationAuditReport {
  totalCitedKeys: number;
  totalLibraryEntries: number;
  missingKeys: string[];
  unusedKeys: string[];
  incompleteEntries: { key: string; missingFields: string[] }[];
  usageCounts: Record<string, number>;
}
