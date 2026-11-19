import { useEffect } from 'react';
import { usePaperStore } from '../stores/paperStore';

export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const store = usePaperStore.getState();

      if (e.key === 'F11') {
        e.preventDefault();
        store.toggleFocusMode();
        return;
      }

      if (e.key === 'Escape') {
        if (store.commandPaletteOpen) store.setCommandPaletteOpen(false);
        else if (store.findReplaceOpen) store.setFindReplaceOpen(false);
        else if (store.templateInspectorOpen) store.setTemplateInspectorOpen(false);
        else if (store.exportModalOpen) store.setExportModalOpen(false);
        else if (store.citationModalOpen) store.setCitationModalOpen(false);
        else if (store.preFlightOpen) store.setPreFlightOpen(false);
        else if (store.structureBoardOpen) store.setStructureBoardOpen(false);
        else if (store.settingsOpen) store.setSettingsOpen(false);
        else if (store.backupsOpen) store.setBackupsOpen(false);
        else if (store.focusMode) store.setFocusMode(false);
        return;
      }

      if (!mod) return;
      const key = e.key.toLowerCase();

      if (key === 's' && !e.shiftKey) {
        e.preventDefault();
        void store.saveActiveAction();
      } else if (key === 's' && e.shiftKey) {
        e.preventDefault();
        void store.saveAllAction();
      } else if (key === 'o' && !e.shiftKey) {
        e.preventDefault();
        void store.openPaperFolderAction();
      } else if (key === 'n' && !e.shiftKey) {
        e.preventDefault();
        void store.addSectionAction();
      } else if (key === 'e' && !e.shiftKey) {
        e.preventDefault();
        store.setExportModalOpen(true);
      } else if (key === 'f' && !e.shiftKey) {
        e.preventDefault();
        store.setFindReplaceOpen(true);
      } else if (key === 'f' && e.shiftKey) {
        e.preventDefault();
        store.toggleFocusMode();
      } else if (key === 'k' && !e.shiftKey) {
        e.preventDefault();
        store.setCommandPaletteOpen(!store.commandPaletteOpen);
      } else if (key === '\\') {
        e.preventDefault();
        store.toggleSidebar();
      } else if (key === 'd' && e.shiftKey) {
        e.preventDefault();
        store.cycleTheme();
      } else if (key === 'c' && e.shiftKey) {
        e.preventDefault();
        store.setCitationModalOpen(true);
      } else if (key === 'b' && e.shiftKey) {
        e.preventDefault();
        void store.compilePdfAction(true);
      } else if (key === 'l' && e.shiftKey) {
        e.preventDefault();
        store.setTemplateInspectorOpen(true);
      } else if (key === 'p' && e.shiftKey) {
        e.preventDefault();
        store.toggleDimUnfocused();
      } else if (key === 't' && e.shiftKey) {
        e.preventDefault();
        store.toggleTypewriterMode();
      } else if (key === ',') {
        e.preventDefault();
        store.setSettingsOpen(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
