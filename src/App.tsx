import { useEffect, useState } from 'react';
import { Minimize2 } from 'lucide-react';
import { Toolbar } from './components/Toolbar/Toolbar';
import { Sidebar } from './components/Sidebar/Sidebar';
import { Editor } from './components/Editor/Editor';
import { Preview } from './components/Preview/Preview';
import { Inspector } from './components/Inspector/Inspector';
import { StatusBar } from './components/StatusBar/StatusBar';
import { Scratchpad } from './components/Scratchpad/Scratchpad';
import { ReferencePane } from './components/ReferencePane/ReferencePane';
import { Welcome } from './components/Welcome/Welcome';
import { TemplateInspectorModal } from './components/TemplateInspector/TemplateInspectorModal';
import { CitationModal } from './components/CitationModal/CitationModal';
import { ExportModal } from './components/ExportModal/ExportModal';
import { PreFlightModal } from './components/PreFlightModal/PreFlightModal';
import { StructureBoardModal } from './components/StructureBoard/StructureBoardModal';
import { FindReplace } from './components/FindReplace/FindReplace';
import { CommandPalette } from './components/CommandPalette/CommandPalette';
import { SettingsModal } from './components/SettingsModal/SettingsModal';
import { BackupsModal } from './components/SettingsModal/BackupsModal';
import { DialogHost } from './components/Dialog/DialogHost';
import { usePaperStore } from './stores/paperStore';
import { applyTheme } from './services/themes';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAppLifecycle } from './hooks/useAppLifecycle';

export function App() {
  useKeyboardShortcuts();
  useAppLifecycle();

  const theme = usePaperStore((s) => s.theme);
  const viewMode = usePaperStore((s) => s.viewMode);
  const focusMode = usePaperStore((s) => s.focusMode);
  const setFocusMode = usePaperStore((s) => s.setFocusMode);
  const [pointerActive, setPointerActive] = useState(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!focusMode) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onMove = () => {
      setPointerActive(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setPointerActive(false), 2000);
    };
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (timer) clearTimeout(timer);
      setPointerActive(false);
    };
  }, [focusMode]);

  const isSplit =
    viewMode === 'split' ||
    viewMode === 'pdf' ||
    viewMode === 'scratchpad' ||
    viewMode === 'reference';

  return (
    <div
      className={`app ${focusMode ? 'focus-mode' : ''} ${focusMode && pointerActive ? 'pointer-active' : ''}`}
    >
      {!focusMode && <Toolbar />}

      <div className="app-body">
        {!focusMode && <Sidebar />}

        <main className="app-main">
          {viewMode !== 'preview' && (
            <div className={`pane editor-pane ${isSplit ? 'split' : 'full'}`}>
              <Editor />
            </div>
          )}

          {viewMode === 'split' && (
            <div className="pane preview-pane split">
              <Preview mode="academic" />
            </div>
          )}

          {viewMode === 'preview' && (
            <div className="pane preview-pane full">
              <Preview mode="academic" fullPaper />
            </div>
          )}

          {viewMode === 'pdf' && (
            <div className="pane preview-pane split">
              <Preview mode="pdf" />
            </div>
          )}

          {viewMode === 'scratchpad' && (
            <div className="pane preview-pane split">
              <Scratchpad />
            </div>
          )}

          {viewMode === 'reference' && (
            <div className="pane preview-pane split">
              <ReferencePane />
            </div>
          )}
        </main>

        {!focusMode && <Inspector />}
        <Welcome />
      </div>

      {!focusMode && <StatusBar />}

      {focusMode && (
        <button
          type="button"
          className="exit-focus-btn"
          onClick={() => setFocusMode(false)}
          title="Exit Focus Mode (Esc / F11)"
        >
          <Minimize2 size={14} />
          <span>Exit Focus</span>
        </button>
      )}

      {/* Overlays & Modals */}
      <FindReplace />
      <CommandPalette />
      <TemplateInspectorModal />
      <CitationModal />
      <ExportModal />
      <PreFlightModal />
      <StructureBoardModal />
      <SettingsModal />
      <BackupsModal />
      <DialogHost />
    </div>
  );
}

export default App;
