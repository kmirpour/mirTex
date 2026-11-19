import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '../services/fileService';
import { usePaperStore, getActiveSection } from '../stores/paperStore';

export function useAppLifecycle() {
  const project = usePaperStore((s) => s.project);
  const activeTarget = usePaperStore((s) => s.activeTarget);
  const isDirty = usePaperStore((s) => s.isDirty);

  // Detect TeX Live toolchain and Zotero 10 on startup
  useEffect(() => {
    const store = usePaperStore.getState();
    void store.detectToolchainAction();
    void store.pingZoteroAction();
  }, []);

  // Sync window title
  useEffect(() => {
    const sec = getActiveSection(usePaperStore.getState());
    const sectionPart =
      activeTarget === 'frontmatter' ? 'Front Page' : sec?.title || '';
    const dirtyDot = isDirty ? ' •' : '';
    const title = project
      ? `${sectionPart ? `${sectionPart} — ` : ''}${project.name}${dirtyDot} — MirTex`
      : 'MirTex — Scientific Paper Studio';
    document.title = title;
    if (isTauri()) {
      void getCurrentWindow().setTitle(title).catch(() => {});
    }
  }, [project, activeTarget, isDirty]);
}
