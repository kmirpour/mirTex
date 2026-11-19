import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../services/fileService';
import type { ZoteroCollection, ZoteroSearchItem, ZoteroStatus } from '../types/citation';

export async function pingZotero(port = 23119): Promise<ZoteroStatus> {
  if (!isTauri()) {
    return {
      connected: false,
      mode: 'offline',
      port,
      message: 'Direct Zotero connection requires MirTex desktop app mode.',
    };
  }
  return await invoke<ZoteroStatus>('zotero_ping', { port });
}

export async function searchZoteroLibrary(
  query: string,
  limit = 20,
  port = 23119
): Promise<ZoteroSearchItem[]> {
  if (!isTauri()) return [];
  return await invoke<ZoteroSearchItem[]>('zotero_search', { query, limit, port });
}

export async function listZoteroCollections(port = 23119): Promise<ZoteroCollection[]> {
  if (!isTauri()) return [];
  return await invoke<ZoteroCollection[]>('zotero_get_collections', { port });
}

export async function exportZoteroCollectionBibtex(
  collectionKey: string,
  port = 23119
): Promise<string> {
  if (!isTauri()) throw new Error('Zotero collection import requires desktop mode');
  return await invoke<string>('zotero_collection_bibtex', { collectionKey, port });
}

/**
 * Resolves a DOI, PubMed ID (PMID), or arXiv ID into a clean BibTeX entry.
 * Uses the Rust backend in desktop mode (zero CORS restrictions) with a browser fallback.
 */
export async function fetchBibtexByIdentifier(identifier: string): Promise<string> {
  if (isTauri()) {
    return await invoke<string>('fetch_reference_by_id', { identifier });
  }
  const cleanDoi = identifier
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:/i, '');
  const resp = await fetch(`https://doi.org/${encodeURIComponent(cleanDoi)}`, {
    headers: { Accept: 'application/x-bibtex' },
  });
  if (!resp.ok) throw new Error(`Could not resolve identifier (${resp.status})`);
  return (await resp.text()).trim();
}
