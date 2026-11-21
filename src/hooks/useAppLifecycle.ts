import { useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '../services/fileService';
import { usePaperStore } from '../stores/paperStore';

export function useAppLifecycle() {
  const hasProject = usePaperStore((s) => Boolean(s.project));
  const projectName = usePaperStore((s) => s.project?.name ?? '');
  const activeSectionTitle = usePaperStore((s) =>
    s.activeTarget === 'frontmatter'
      ? 'Front Page'
      : (s.project?.sections.find((sec) => sec.id === s.activeTarget)?.title ?? '')
  );
  const isDirty = usePaperStore((s) => s.isDirty);
  const lastTitleRef = useRef<string>('');

  // Detect TeX Live toolchain and Zotero 10 on startup
  useEffect(() => {
    const store = usePaperStore.getState();
    void store.detectToolchainAction();
    void store.pingZoteroAction();
  }, []);

  // Sync window title only when it actually changes
  useEffect(() => {
    const dirtyDot = isDirty ? ' •' : '';
    const title = hasProject
      ? `${activeSectionTitle ? `${activeSectionTitle} — ` : ''}${projectName}${dirtyDot} — MirTex`
      : 'MirTex — Scientific Paper Studio';
    if (lastTitleRef.current === title) return;
    lastTitleRef.current = title;
    document.title = title;
    if (isTauri()) {
      void getCurrentWindow().setTitle(title).catch(() => {});
    }
  }, [hasProject, projectName, activeSectionTitle, isDirty]);
}
