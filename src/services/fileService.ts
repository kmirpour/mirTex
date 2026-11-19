import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';

export interface OpenedFile {
  path: string;
  name: string;
  content: string;
}

export interface SavedFile {
  path: string;
  name: string;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface BinderNode {
  name: string;
  path: string;
  is_dir: boolean;
  children: BinderNode[];
}

export interface BackupEntry {
  name: string;
  timestamp: number;
  size: number;
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function extractFileName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || filePath;
}

export function joinPath(base: string, ...parts: string[]): string {
  const sep = base.includes('/') && !base.includes('\\') ? '/' : '\\';
  const cleanBase = base.replace(/[\\/]+$/, '');
  const cleanParts = parts
    .map((p) => p.replace(/^[\\/]+|[\\/]+$/g, ''))
    .filter(Boolean);
  return [cleanBase, ...cleanParts].join(sep);
}

// Browser virtual filesystem fallback for `npm run dev` testing outside Tauri
const virtualTextFiles = new Map<string, string>();
const virtualBinaryFiles = new Map<string, Uint8Array>();

export async function setProjectRoot(path: string | null): Promise<void> {
  if (isTauri()) {
    await invoke('set_project_root', { path });
  }
}

export async function readFileDirect(path: string): Promise<OpenedFile> {
  if (isTauri()) {
    const content = await invoke<string>('read_file', { path });
    return { path, name: extractFileName(path), content };
  }
  if (virtualTextFiles.has(path)) {
    return { path, name: extractFileName(path), content: virtualTextFiles.get(path)! };
  }
  throw new Error(`File not found: ${path}`);
}

export async function readBinaryBase64(path: string): Promise<string> {
  if (isTauri()) {
    return await invoke<string>('read_binary_file', { path });
  }
  const bytes = virtualBinaryFiles.get(path);
  if (!bytes) throw new Error(`Binary file not found: ${path}`);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

export async function saveFile(path: string, content: string): Promise<void> {
  virtualTextFiles.set(path, content);
  if (isTauri()) {
    await invoke('write_file', { path, content });
  }
}

export async function writeBinaryDirect(path: string, bytes: Uint8Array): Promise<void> {
  virtualBinaryFiles.set(path, bytes);
  if (isTauri()) {
    await invoke('write_binary_file', { path, bytes: Array.from(bytes) });
  }
}

export async function createFile(path: string, initialContent = ''): Promise<void> {
  virtualTextFiles.set(path, initialContent);
  if (isTauri()) {
    await invoke('create_file', { path, initialContent });
  }
}

export async function createDir(path: string): Promise<void> {
  if (isTauri()) {
    await invoke('create_dir', { path });
  }
}

export async function renamePath(oldPath: string, newPath: string): Promise<void> {
  if (virtualTextFiles.has(oldPath)) {
    virtualTextFiles.set(newPath, virtualTextFiles.get(oldPath)!);
    virtualTextFiles.delete(oldPath);
  }
  if (isTauri()) {
    await invoke('rename_path', { oldPath, newPath });
  }
}

export async function copyAssetToProject(sourcePath: string, targetPath: string): Promise<string> {
  if (isTauri()) {
    return await invoke<string>('copy_asset_to_project', { sourcePath, targetPath });
  }
  return targetPath;
}

export async function openPathExternal(path: string, appHint?: string): Promise<void> {
  if (isTauri()) {
    await invoke('open_path_external', { path, appHint: appHint ?? null });
  }
}

export async function openFolderDialog(title = 'Open Paper Folder'): Promise<string | null> {
  if (isTauri()) {
    const selected = await open({ directory: true, multiple: false, title });
    if (!selected) return null;
    return typeof selected === 'string' ? selected : Array.isArray(selected) ? selected[0] : null;
  }
  return '/DemoPaper';
}

export async function pickFileDialog(options: {
  title?: string;
  filters: { name: string; extensions: string[] }[];
}): Promise<string | null> {
  if (isTauri()) {
    const selected = await open({
      directory: false,
      multiple: false,
      title: options.title,
      filters: options.filters,
    });
    if (!selected) return null;
    return typeof selected === 'string' ? selected : Array.isArray(selected) ? selected[0] : null;
  }
  return null;
}

export async function saveTextAs(
  content: string,
  defaultName: string,
  filters: { name: string; extensions: string[] }[]
): Promise<SavedFile | null> {
  if (isTauri()) {
    const targetPath = await save({ defaultPath: defaultName, filters });
    if (!targetPath) return null;
    await invoke('write_file', { path: targetPath, content });
    return { path: targetPath, name: extractFileName(targetPath) };
  }
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  triggerBrowserDownload(blob, defaultName);
  return { path: defaultName, name: defaultName };
}

export async function saveBinaryAs(
  data: Blob,
  defaultName: string,
  filter: { name: string; extensions: string[] }
): Promise<SavedFile | null> {
  if (isTauri()) {
    const targetPath = await save({ defaultPath: defaultName, filters: [filter] });
    if (!targetPath) return null;
    const bytes = new Uint8Array(await data.arrayBuffer());
    await invoke('write_binary_file', { path: targetPath, bytes: Array.from(bytes) });
    return { path: targetPath, name: extractFileName(targetPath) };
  }
  triggerBrowserDownload(data, defaultName);
  return { path: defaultName, name: defaultName };
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function readDirTree(path: string): Promise<BinderNode[]> {
  if (isTauri()) {
    return await invoke<BinderNode[]>('read_dir_tree', { path });
  }
  return [];
}

export async function listBackups(path: string): Promise<BackupEntry[]> {
  if (!isTauri()) return [];
  return await invoke<BackupEntry[]>('list_backups', { path });
}

export async function readBackup(path: string, name: string): Promise<string> {
  if (!isTauri()) throw new Error('Backups require desktop mode');
  return await invoke<string>('read_backup', { path, name });
}
