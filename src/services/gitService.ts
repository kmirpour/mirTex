import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './fileService';

export interface GitRepoStatus {
  git_installed: boolean;
  is_repo: boolean;
  remote_url: string | null;
  current_branch: string | null;
}

export async function getGitStatus(path: string): Promise<GitRepoStatus> {
  if (!isTauri()) {
    return { git_installed: false, is_repo: false, remote_url: null, current_branch: null };
  }
  return await invoke<GitRepoStatus>('git_get_status', { path });
}

export async function getGitChangedFiles(path: string): Promise<string[]> {
  if (!isTauri()) return [];
  return await invoke<string[]>('git_changed_files', { path });
}

export async function syncGit(params: {
  path: string;
  remoteUrl?: string;
  commitMsg?: string;
  push?: boolean;
}): Promise<string> {
  if (!isTauri()) throw new Error('Git sync requires desktop mode');
  return await invoke<string>('git_sync', {
    path: params.path,
    remoteUrl: params.remoteUrl ?? null,
    commitMsg: params.commitMsg ?? null,
    push: params.push ?? true,
  });
}
