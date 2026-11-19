import { create } from 'zustand';
import type { Editor } from '@tiptap/react';
import {
  createDefaultFrontMatter,
  type PaperComment,
  type PaperFrontMatter,
  type PaperProject,
  type PaperSection,
  type PaperSnapshot,
  type SectionRole,
  type SectionStatus,
} from '../types/paper';
import type { LatexCompileResult, TemplateManifest, TexToolchainInfo } from '../types/latex';
import type { BibEntry, CitationStyle, ZoteroStatus } from '../types/citation';
import {
  addRecentProject,
  loadSettings,
  saveSettings,
  type FontFamily,
  type TexEngine,
  type ViewMode,
} from '../services/settings';
import { applyTheme, THEME_IDS, type Theme } from '../services/themes';
import * as fileService from '../services/fileService';
import * as paperService from '../services/paperService';
import * as latexService from '../services/latexService';
import * as gitService from '../services/gitService';
import { BUILTIN_TEMPLATES, getBuiltinTemplateManifest } from '../latex/builtinTemplates';
import { mergeBibEntries, parseBibTeX, serializeBibLibrary } from '../citations/bibtex';
import { fetchBibtexByIdentifier, pingZotero } from '../citations/zoteroService';
import { assembleLatexBuildDir } from '../export/exportPaper';
import { countAcademicWords, extractSubsections } from '../utils/paperOutline';
import { confirmDialog, promptDialog } from '../services/dialogs';

export type ActiveDocumentTarget = 'frontmatter' | string; // 'frontmatter' or section.id

export interface PaperStoreState {
  // Project state
  projectPath: string | null;
  project: PaperProject | null;
  frontMatter: PaperFrontMatter;
  sectionContents: Record<string, string>;
  activeTarget: ActiveDocumentTarget;
  referenceSectionId: string | null;
  scratchpadContent: string;
  isDirty: boolean;
  lastSavedAt: number | null;
  statusMessage: string | null;
  editorInstance: Editor | null;

  // Bibliography & Zotero
  bibEntries: BibEntry[];
  zoteroStatus: ZoteroStatus | null;

  // LaTeX Templates & Compilation
  customTemplates: TemplateManifest[];
  activeManifest: TemplateManifest;
  texToolchain: TexToolchainInfo | null;
  isCompilingPdf: boolean;
  lastCompileResult: LatexCompileResult | null;
  lastBuildTexPath: string | null;
  figureDataUrls: Record<string, string>;

  // Git
  gitChangedFiles: string[] | null;

  // Settings & UX
  theme: Theme;
  viewMode: ViewMode;
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  autoSaveEnabled: boolean;
  fontFamily: FontFamily;
  fontSize: number;
  lineHeight: number;
  lineWidth: number;
  smartQuotes: boolean;
  focusMode: boolean;
  typewriterMode: boolean;
  dimUnfocused: boolean;
  spellCheckEnabled: boolean;
  citationStyle: CitationStyle;
  texEngine: TexEngine;
  zoteroPort: number;
  recentProjects: string[];
  selectedWordCount: number;

  // Modals
  templateInspectorOpen: boolean;
  exportModalOpen: boolean;
  citationModalOpen: boolean;
  preFlightOpen: boolean;
  structureBoardOpen: boolean;
  findReplaceOpen: boolean;
  commandPaletteOpen: boolean;
  settingsOpen: boolean;
  backupsOpen: boolean;
  sidebarTab: 'paper' | 'references' | 'elements';

  // Actions
  setEditorInstance: (editor: Editor | null) => void;
  setStatusMessage: (msg: string | null) => void;
  setSelectedWordCount: (count: number) => void;
  setSidebarTab: (tab: 'paper' | 'references' | 'elements') => void;
  setTheme: (theme: Theme) => void;
  cycleTheme: () => void;
  setViewMode: (mode: ViewMode) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleInspector: () => void;
  setInspectorOpen: (open: boolean) => void;
  setFocusMode: (val: boolean) => void;
  toggleFocusMode: () => void;
  toggleTypewriterMode: () => void;
  toggleDimUnfocused: () => void;
  setFontFamily: (f: FontFamily) => void;
  setFontSize: (s: number) => void;
  setLineHeight: (h: number) => void;
  setLineWidth: (w: number) => void;
  setSmartQuotes: (v: boolean) => void;
  setAutoSaveEnabled: (v: boolean) => void;
  setCitationStyle: (style: CitationStyle) => void;
  setTexEngine: (engine: TexEngine) => void;
  setZoteroPort: (port: number) => void;

  setTemplateInspectorOpen: (open: boolean) => void;
  setExportModalOpen: (open: boolean) => void;
  setCitationModalOpen: (open: boolean) => void;
  setPreFlightOpen: (open: boolean) => void;
  setStructureBoardOpen: (open: boolean) => void;
  setFindReplaceOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setBackupsOpen: (open: boolean) => void;

  // Paper Lifecycle
  openPaperFolderAction: (preset?: PaperProject['preset']) => Promise<boolean>;
  loadPaperByPath: (path: string, preset?: PaperProject['preset']) => Promise<boolean>;
  startDemoPaperAction: (preset?: PaperProject['preset']) => Promise<void>;
  selectTarget: (target: ActiveDocumentTarget) => Promise<void>;
  setReferenceSectionId: (id: string | null) => void;
  updateActiveMarkdown: (markdown: string) => void;
  saveActiveAction: () => Promise<boolean>;
  saveAllAction: () => Promise<boolean>;
  updateFrontMatter: (updater: (prev: PaperFrontMatter) => PaperFrontMatter) => void;
  setScratchpadContent: (content: string) => void;
  flushScratchpadAction: () => Promise<void>;

  // Section Management
  addSectionAction: (title?: string, role?: SectionRole) => Promise<void>;
  renameSectionAction: (sectionId: string, newTitle: string) => Promise<void>;
  updateSectionMeta: (sectionId: string, partial: Partial<Pick<PaperSection, 'role' | 'status' | 'wordLimit' | 'notes' | 'starred' | 'isBackMatter'>>) => void;
  reorderSectionsAction: (fromIdx: number, toIdx: number) => Promise<void>;
  deleteSectionAction: (sectionId: string) => Promise<void>;

  // Comments & Snapshots
  addCommentAction: (quote: string, text: string) => void;
  updateCommentAction: (id: string, partial: Partial<Pick<PaperComment, 'text' | 'resolved'>>) => void;
  deleteCommentAction: (id: string) => void;
  createSnapshotAction: (label: string) => Promise<void>;
  restoreSnapshotAction: (snapshotId: string) => Promise<void>;
  deleteSnapshotAction: (snapshotId: string) => Promise<void>;

  // Templates
  importLatexTemplateAction: () => Promise<TemplateManifest | null>;
  selectTemplateAction: (templateId: string) => Promise<void>;
  setSlotMappingAction: (slotId: string, sectionId: string) => void;
  setCitationCommandModeAction: (mode: PaperProject['citationCommandMode']) => void;
  syncSectionsFromTemplateAction: () => Promise<void>;

  // Citations & Zotero
  pingZoteroAction: () => Promise<ZoteroStatus>;
  addRawBibtexAction: (rawBib: string) => Promise<number>;
  addReferenceByIdAction: (identifier: string) => Promise<BibEntry | null>;
  deleteBibEntryAction: (key: string) => Promise<void>;
  importBibFileAction: () => Promise<number>;

  // Figures
  importFigureAction: () => Promise<{ relPath: string; label: string } | null>;
  refreshFiguresAction: () => Promise<void>;

  // LaTeX Build & Git
  detectToolchainAction: () => Promise<void>;
  compilePdfAction: (openPdfPane?: boolean) => Promise<LatexCompileResult | null>;
  openInTexstudioAction: () => Promise<void>;
  commitGitVersionAction: () => Promise<void>;
  syncGithubAction: () => Promise<void>;
}

const initialSettings = loadSettings();
applyTheme(initialSettings.theme);

function decorateSections(
  sections: PaperSection[],
  contents: Record<string, string>
): PaperSection[] {
  return sections.map((sec) => {
    const md = contents[sec.id] ?? '';
    return {
      ...sec,
      wordCount: countAcademicWords(md),
      subsections: extractSubsections(md),
    };
  });
}

function getAllManifests(custom: TemplateManifest[]): TemplateManifest[] {
  const builtins = BUILTIN_TEMPLATES.map((b) => getBuiltinTemplateManifest(b.id));
  return [...custom, ...builtins];
}

function mimeForExt(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'application/octet-stream';
}

let statusTimer: ReturnType<typeof setTimeout> | null = null;

export const usePaperStore = create<PaperStoreState>((set, get) => ({
  projectPath: null,
  project: null,
  frontMatter: createDefaultFrontMatter(),
  sectionContents: {},
  activeTarget: 'frontmatter',
  referenceSectionId: null,
  scratchpadContent: '',
  isDirty: false,
  lastSavedAt: null,
  statusMessage: null,
  editorInstance: null,

  bibEntries: [],
  zoteroStatus: null,

  customTemplates: [],
  activeManifest: getBuiltinTemplateManifest('springer-nature-compat'),
  texToolchain: null,
  isCompilingPdf: false,
  lastCompileResult: null,
  lastBuildTexPath: null,
  figureDataUrls: {},

  gitChangedFiles: null,

  theme: initialSettings.theme,
  viewMode: initialSettings.viewMode,
  sidebarOpen: initialSettings.sidebarOpen,
  inspectorOpen: initialSettings.inspectorOpen,
  autoSaveEnabled: initialSettings.autoSaveEnabled,
  fontFamily: initialSettings.fontFamily,
  fontSize: initialSettings.fontSize,
  lineHeight: initialSettings.lineHeight,
  lineWidth: initialSettings.lineWidth,
  smartQuotes: initialSettings.smartQuotes,
  focusMode: false,
  typewriterMode: initialSettings.typewriterMode,
  dimUnfocused: initialSettings.dimUnfocused,
  spellCheckEnabled: initialSettings.spellCheckEnabled,
  citationStyle: initialSettings.citationStyle,
  texEngine: initialSettings.texEngine,
  zoteroPort: initialSettings.zoteroPort,
  recentProjects: initialSettings.recentProjects,
  selectedWordCount: 0,

  templateInspectorOpen: false,
  exportModalOpen: false,
  citationModalOpen: false,
  preFlightOpen: false,
  structureBoardOpen: false,
  findReplaceOpen: false,
  commandPaletteOpen: false,
  settingsOpen: false,
  backupsOpen: false,
  sidebarTab: 'paper',

  setEditorInstance: (editorInstance) => set({ editorInstance }),
  setStatusMessage: (msg) => {
    if (statusTimer) clearTimeout(statusTimer);
    set({ statusMessage: msg });
    if (msg) {
      statusTimer = setTimeout(() => set({ statusMessage: null }), 4500);
    }
  },
  setSelectedWordCount: (selectedWordCount) => set({ selectedWordCount }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),

  setTheme: (theme) => {
    applyTheme(theme);
    saveSettings({ theme });
    set({ theme });
  },
  cycleTheme: () => {
    const idx = THEME_IDS.indexOf(get().theme);
    const next = THEME_IDS[(idx + 1) % THEME_IDS.length];
    get().setTheme(next);
    get().setStatusMessage(`Theme: ${next}`);
  },
  setViewMode: (viewMode) => {
    saveSettings({ viewMode });
    set({ viewMode });
  },
  toggleSidebar: () => {
    const next = !get().sidebarOpen;
    saveSettings({ sidebarOpen: next });
    set({ sidebarOpen: next });
  },
  setSidebarOpen: (sidebarOpen) => {
    saveSettings({ sidebarOpen });
    set({ sidebarOpen });
  },
  toggleInspector: () => {
    const next = !get().inspectorOpen;
    saveSettings({ inspectorOpen: next });
    set({ inspectorOpen: next });
  },
  setInspectorOpen: (inspectorOpen) => {
    saveSettings({ inspectorOpen });
    set({ inspectorOpen });
  },
  setFocusMode: (focusMode) => set({ focusMode }),
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  toggleTypewriterMode: () => {
    const next = !get().typewriterMode;
    saveSettings({ typewriterMode: next });
    set({ typewriterMode: next });
  },
  toggleDimUnfocused: () => {
    const next = !get().dimUnfocused;
    saveSettings({ dimUnfocused: next });
    set({ dimUnfocused: next });
  },
  setFontFamily: (fontFamily) => {
    saveSettings({ fontFamily });
    set({ fontFamily });
  },
  setFontSize: (fontSize) => {
    saveSettings({ fontSize });
    set({ fontSize });
  },
  setLineHeight: (lineHeight) => {
    saveSettings({ lineHeight });
    set({ lineHeight });
  },
  setLineWidth: (lineWidth) => {
    saveSettings({ lineWidth });
    set({ lineWidth });
  },
  setSmartQuotes: (smartQuotes) => {
    saveSettings({ smartQuotes });
    set({ smartQuotes });
  },
  setAutoSaveEnabled: (autoSaveEnabled) => {
    saveSettings({ autoSaveEnabled });
    set({ autoSaveEnabled });
  },
  setCitationStyle: (citationStyle) => {
    saveSettings({ citationStyle });
    set({ citationStyle });
  },
  setTexEngine: (texEngine) => {
    saveSettings({ texEngine });
    set({ texEngine });
  },
  setZoteroPort: (zoteroPort) => {
    saveSettings({ zoteroPort });
    set({ zoteroPort });
  },

  setTemplateInspectorOpen: (templateInspectorOpen) => set({ templateInspectorOpen }),
  setExportModalOpen: (exportModalOpen) => set({ exportModalOpen }),
  setCitationModalOpen: (citationModalOpen) => set({ citationModalOpen }),
  setPreFlightOpen: (preFlightOpen) => set({ preFlightOpen }),
  setStructureBoardOpen: (structureBoardOpen) => set({ structureBoardOpen }),
  setFindReplaceOpen: (findReplaceOpen) => set({ findReplaceOpen }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setBackupsOpen: (backupsOpen) => set({ backupsOpen }),

  openPaperFolderAction: async (preset = 'springer-nature') => {
    const folder = await fileService.openFolderDialog('Select or Create Paper Project Folder');
    if (!folder) return false;
    return await get().loadPaperByPath(folder, preset);
  },

  loadPaperByPath: async (projectPath, preset = 'springer-nature') => {
    try {
      const loaded = await paperService.loadOrCreatePaperProject(projectPath, preset);
      const customTemplates = await latexService.loadProjectTemplates(projectPath);
      const allManifests = getAllManifests(customTemplates);
      const activeManifest =
        allManifests.find((m) => m.id === loaded.project.activeTemplateId) ??
        getBuiltinTemplateManifest('springer-nature-compat');

      const decoratedProject: PaperProject = {
        ...loaded.project,
        sections: decorateSections(loaded.project.sections, loaded.sectionContents),
      };

      const bibEntries = parseBibTeX(loaded.bibContent);
      const updatedSettings = addRecentProject(projectPath);

      set({
        projectPath,
        project: decoratedProject,
        frontMatter: loaded.frontMatter,
        sectionContents: loaded.sectionContents,
        activeTarget: decoratedProject.sections[0]?.id ?? 'frontmatter',
        referenceSectionId: decoratedProject.sections[1]?.id ?? null,
        scratchpadContent: loaded.scratchpad,
        bibEntries,
        customTemplates,
        activeManifest,
        isDirty: false,
        lastSavedAt: Date.now(),
        lastCompileResult: null,
        recentProjects: updatedSettings.recentProjects,
      });

      get().setStatusMessage(`Opened paper: ${decoratedProject.name}`);
      void get().refreshFiguresAction();
      void get().detectToolchainAction();
      void get().pingZoteroAction();
      if (fileService.isTauri()) {
        void gitService.getGitChangedFiles(projectPath).then((files) => set({ gitChangedFiles: files }));
      }
      return true;
    } catch (err) {
      get().setStatusMessage(`Failed to open paper: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  },

  startDemoPaperAction: async (preset = 'springer-nature') => {
    await get().loadPaperByPath('/DemoPaper', preset);
  },

  selectTarget: async (target) => {
    if (get().isDirty) {
      await get().saveActiveAction();
    }
    set({ activeTarget: target, isDirty: false });
  },

  setReferenceSectionId: (referenceSectionId) => set({ referenceSectionId }),

  updateActiveMarkdown: (markdown) => {
    const { activeTarget, project, sectionContents } = get();
    if (!project || activeTarget === 'frontmatter') return;
    const nextContents = { ...sectionContents, [activeTarget]: markdown };
    const nextSections = project.sections.map((s) =>
      s.id === activeTarget
        ? { ...s, wordCount: countAcademicWords(markdown), subsections: extractSubsections(markdown) }
        : s
    );
    set({
      sectionContents: nextContents,
      project: { ...project, sections: nextSections },
      isDirty: true,
    });
  },

  saveActiveAction: async () => {
    const { projectPath, project, activeTarget, sectionContents, frontMatter } = get();
    if (!projectPath || !project) return false;
    try {
      if (activeTarget === 'frontmatter') {
        await paperService.saveFrontMatter(projectPath, frontMatter);
      } else {
        const sec = project.sections.find((s) => s.id === activeTarget);
        if (sec) {
          await fileService.saveFile(sec.path, sectionContents[sec.id] ?? '');
        }
      }
      set({ isDirty: false, lastSavedAt: Date.now() });
      return true;
    } catch (err) {
      get().setStatusMessage(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  },

  saveAllAction: async () => {
    const { projectPath, project, sectionContents, frontMatter, scratchpadContent, bibEntries } = get();
    if (!projectPath || !project) return false;
    try {
      await paperService.saveFrontMatter(projectPath, frontMatter);
      await paperService.savePaperProject(projectPath, project);
      await paperService.saveScratchpad(projectPath, scratchpadContent);
      await paperService.saveBibFile(projectPath, serializeBibLibrary(bibEntries));
      for (const sec of project.sections) {
        await fileService.saveFile(sec.path, sectionContents[sec.id] ?? '');
      }
      set({ isDirty: false, lastSavedAt: Date.now() });
      get().setStatusMessage('All paper sections saved');
      return true;
    } catch (err) {
      get().setStatusMessage(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  },

  updateFrontMatter: (updater) => {
    const next = updater(get().frontMatter);
    set({ frontMatter: next, isDirty: true });
    const { projectPath } = get();
    if (projectPath) {
      void paperService.saveFrontMatter(projectPath, next).then(() => {
        set({ isDirty: false, lastSavedAt: Date.now() });
      });
    }
  },

  setScratchpadContent: (scratchpadContent) => {
    set({ scratchpadContent });
    const { projectPath } = get();
    if (projectPath) {
      void paperService.saveScratchpad(projectPath, scratchpadContent);
    }
  },

  flushScratchpadAction: async () => {
    const { projectPath, scratchpadContent } = get();
    if (!projectPath || !scratchpadContent.trim()) return;
    const ok = await confirmDialog({
      title: 'Archive scratchpad to graveyard?',
      message: 'Your current notes will be saved as a timestamped file in graveyard/ and the scratchpad cleared.',
      confirmLabel: 'Archive & Clear',
    });
    if (!ok) return;
    const name = await paperService.flushScratchpadToGraveyard(projectPath, scratchpadContent);
    await paperService.saveScratchpad(projectPath, '');
    set({ scratchpadContent: '' });
    get().setStatusMessage(`Archived scratchpad to graveyard/${name}`);
  },

  addSectionAction: async (customTitle, role = 'custom') => {
    const { projectPath, project, sectionContents } = get();
    if (!projectPath || !project) return;
    const title =
      customTitle ??
      (await promptDialog({
        title: 'New Paper Section',
        message: 'Enter a title for the new section (e.g., Related Work, Appendix, Supplementary Methods):',
        placeholder: 'Section title',
        confirmLabel: 'Create Section',
      }));
    if (!title?.trim()) return;

    const { section, content } = await paperService.createNewSectionFile(
      projectPath,
      project.sections,
      title.trim(),
      role
    );
    const nextContents = { ...sectionContents, [section.id]: content };
    const nextProject: PaperProject = {
      ...project,
      sections: decorateSections([...project.sections, section], nextContents),
    };
    await paperService.savePaperProject(projectPath, nextProject);
    set({
      project: nextProject,
      sectionContents: nextContents,
      activeTarget: section.id,
      isDirty: false,
    });
    get().setStatusMessage(`Added section "${section.title}"`);
  },

  renameSectionAction: async (sectionId, newTitle) => {
    const { projectPath, project } = get();
    if (!projectPath || !project || !newTitle.trim()) return;
    const nextSections = project.sections.map((s) =>
      s.id === sectionId ? { ...s, title: newTitle.trim() } : s
    );
    const nextProject = { ...project, sections: nextSections };
    await paperService.savePaperProject(projectPath, nextProject);
    set({ project: nextProject });
  },

  updateSectionMeta: (sectionId, partial) => {
    const { projectPath, project } = get();
    if (!projectPath || !project) return;
    const nextSections = project.sections.map((s) =>
      s.id === sectionId ? { ...s, ...partial } : s
    );
    const nextProject = { ...project, sections: nextSections };
    set({ project: nextProject });
    void paperService.savePaperProject(projectPath, nextProject);
  },

  reorderSectionsAction: async (fromIdx, toIdx) => {
    const { projectPath, project } = get();
    if (!projectPath || !project || fromIdx === toIdx) return;
    const next = [...project.sections];
    const [moved] = next.splice(fromIdx, 1);
    if (!moved) return;
    next.splice(toIdx, 0, moved);
    const nextProject = { ...project, sections: next };
    set({ project: nextProject });
    await paperService.savePaperProject(projectPath, nextProject);
  },

  deleteSectionAction: async (sectionId) => {
    const { projectPath, project, activeTarget, sectionContents } = get();
    if (!projectPath || !project) return;
    const sec = project.sections.find((s) => s.id === sectionId);
    if (!sec) return;
    const ok = await confirmDialog({
      title: `Move "${sec.title}" to graveyard?`,
      message: 'The section Markdown file is preserved inside graveyard/ so nothing is permanently lost.',
      confirmLabel: 'Move to Graveyard',
      danger: true,
    });
    if (!ok) return;

    await paperService.moveSectionToGraveyard(projectPath, sec.path);
    const nextSections = project.sections.filter((s) => s.id !== sectionId);
    const nextContents = { ...sectionContents };
    delete nextContents[sectionId];
    const nextProject = { ...project, sections: nextSections };
    await paperService.savePaperProject(projectPath, nextProject);
    set({
      project: nextProject,
      sectionContents: nextContents,
      activeTarget:
        activeTarget === sectionId ? (nextSections[0]?.id ?? 'frontmatter') : activeTarget,
    });
    get().setStatusMessage(`Moved "${sec.title}" to graveyard/`);
  },

  addCommentAction: (quote, text) => {
    const { projectPath, project, activeTarget } = get();
    if (!projectPath || !project || activeTarget === 'frontmatter') return;
    const sec = project.sections.find((s) => s.id === activeTarget);
    if (!sec) return;
    const list = project.comments[sec.fileName] || [];
    const entry: PaperComment = {
      id: `cmt-${Date.now().toString(36)}`,
      quote,
      text,
      createdAt: new Date().toISOString(),
      resolved: false,
    };
    const nextProject = {
      ...project,
      comments: { ...project.comments, [sec.fileName]: [entry, ...list] },
    };
    set({ project: nextProject });
    void paperService.savePaperProject(projectPath, nextProject);
  },

  updateCommentAction: (id, partial) => {
    const { projectPath, project, activeTarget } = get();
    if (!projectPath || !project || activeTarget === 'frontmatter') return;
    const sec = project.sections.find((s) => s.id === activeTarget);
    if (!sec) return;
    const list = (project.comments[sec.fileName] || []).map((c) =>
      c.id === id ? { ...c, ...partial } : c
    );
    const nextProject = {
      ...project,
      comments: { ...project.comments, [sec.fileName]: list },
    };
    set({ project: nextProject });
    void paperService.savePaperProject(projectPath, nextProject);
  },

  deleteCommentAction: (id) => {
    const { projectPath, project, activeTarget } = get();
    if (!projectPath || !project || activeTarget === 'frontmatter') return;
    const sec = project.sections.find((s) => s.id === activeTarget);
    if (!sec) return;
    const list = (project.comments[sec.fileName] || []).filter((c) => c.id !== id);
    const nextProject = {
      ...project,
      comments: { ...project.comments, [sec.fileName]: list },
    };
    set({ project: nextProject });
    void paperService.savePaperProject(projectPath, nextProject);
  },

  createSnapshotAction: async (label) => {
    const { projectPath, project, activeTarget, sectionContents } = get();
    if (!projectPath || !project || activeTarget === 'frontmatter') return;
    const sec = project.sections.find((s) => s.id === activeTarget);
    if (!sec) return;
    const content = sectionContents[sec.id] ?? '';
    const snap: PaperSnapshot = {
      id: `snap-${Date.now().toString(36)}`,
      sectionPath: sec.path,
      timestamp: new Date().toISOString(),
      label: label.trim() || `Revision ${new Date().toLocaleDateString()}`,
      wordCount: countAcademicWords(content),
      content,
    };
    const nextSnaps = [snap, ...(project.snapshots || [])];
    await paperService.saveSnapshots(projectPath, nextSnaps);
    set({ project: { ...project, snapshots: nextSnaps } });
    get().setStatusMessage(`Saved snapshot "${snap.label}"`);
  },

  restoreSnapshotAction: async (snapshotId) => {
    const { project } = get();
    const snap = project?.snapshots?.find((s) => s.id === snapshotId);
    if (!snap) return;
    get().updateActiveMarkdown(snap.content);
    await get().saveActiveAction();
    get().setStatusMessage(`Restored snapshot "${snap.label}"`);
  },

  deleteSnapshotAction: async (snapshotId) => {
    const { projectPath, project } = get();
    if (!projectPath || !project) return;
    const nextSnaps = (project.snapshots || []).filter((s) => s.id !== snapshotId);
    await paperService.saveSnapshots(projectPath, nextSnaps);
    set({ project: { ...project, snapshots: nextSnaps } });
  },

  importLatexTemplateAction: async () => {
    const { projectPath, project, customTemplates } = get();
    if (!projectPath || !project) {
      get().setStatusMessage('Open a paper folder first before importing a LaTeX template.');
      return null;
    }
    try {
      const manifest = await latexService.importLatexTemplateFile(projectPath);
      if (!manifest) return null;
      const filtered = customTemplates.filter((t) => t.id !== manifest.id);
      const nextCustom = [manifest, ...filtered];
      const nextProject: PaperProject = {
        ...project,
        activeTemplateId: manifest.id,
        templateSlotMap: {},
      };
      await paperService.savePaperProject(projectPath, nextProject);
      set({
        customTemplates: nextCustom,
        activeManifest: manifest,
        project: nextProject,
      });
      get().setStatusMessage(
        `Loaded template "${manifest.name}" (${manifest.documentClass} — ${manifest.slots.length} slots detected)`
      );
      return manifest;
    } catch (err) {
      get().setStatusMessage(
        `Template import failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  },

  selectTemplateAction: async (templateId) => {
    const { projectPath, project, customTemplates } = get();
    const all = getAllManifests(customTemplates);
    const chosen = all.find((m) => m.id === templateId);
    if (!chosen) return;
    set({ activeManifest: chosen });
    if (projectPath && project) {
      const nextProject: PaperProject = {
        ...project,
        activeTemplateId: chosen.id,
        templateSlotMap: {},
      };
      set({ project: nextProject });
      await paperService.savePaperProject(projectPath, nextProject);
    }
    get().setStatusMessage(`Active template: ${chosen.name}`);
  },

  setSlotMappingAction: (slotId, sectionId) => {
    const { projectPath, project } = get();
    if (!projectPath || !project) return;
    const nextMap = { ...project.templateSlotMap };
    if (!sectionId) delete nextMap[slotId];
    else nextMap[slotId] = sectionId;
    const nextProject = { ...project, templateSlotMap: nextMap };
    set({ project: nextProject });
    void paperService.savePaperProject(projectPath, nextProject);
  },

  setCitationCommandModeAction: (citationCommandMode) => {
    const { projectPath, project } = get();
    if (!projectPath || !project) return;
    const nextProject = { ...project, citationCommandMode };
    set({ project: nextProject });
    void paperService.savePaperProject(projectPath, nextProject);
  },

  syncSectionsFromTemplateAction: async () => {
    const { projectPath, project, activeManifest, sectionContents } = get();
    if (!projectPath || !project) return;

    const ok = await confirmDialog({
      title: `Sync paper sections with "${activeManifest.name}"?`,
      message:
        'Missing sections required by this LaTeX template will be created and sections will be ordered to match the template. Existing text will NOT be deleted.',
      confirmLabel: 'Sync Structure',
    });
    if (!ok) return;

    const templateBuilt = paperService.buildSectionsFromTemplateManifest(projectPath, activeManifest);
    const existingByRole = new Map<string, PaperSection>();
    const existingByTitle = new Map<string, PaperSection>();
    for (const s of project.sections) {
      if (s.role !== 'custom') existingByRole.set(s.role, s);
      existingByTitle.set(s.title.toLowerCase(), s);
    }

    const usedIds = new Set<string>();
    const ordered: PaperSection[] = [];
    const nextContents = { ...sectionContents };

    for (const tplSec of templateBuilt.sections) {
      const match =
        (tplSec.role !== 'custom' ? existingByRole.get(tplSec.role) : undefined) ||
        existingByTitle.get(tplSec.title.toLowerCase());
      if (match && !usedIds.has(match.id)) {
        usedIds.add(match.id);
        ordered.push(match);
      } else {
        const created = await paperService.createNewSectionFile(
          projectPath,
          [...project.sections, ...ordered],
          tplSec.title,
          tplSec.role
        );
        ordered.push(created.section);
        nextContents[created.section.id] = created.content;
      }
    }

    // Preserve any extra user sections at the end so nothing is ever lost
    for (const s of project.sections) {
      if (!usedIds.has(s.id)) ordered.push(s);
    }

    const nextProject: PaperProject = {
      ...project,
      sections: decorateSections(ordered, nextContents),
      templateSlotMap: {},
    };
    await paperService.savePaperProject(projectPath, nextProject);
    set({ project: nextProject, sectionContents: nextContents });
    get().setStatusMessage(`Synced ${ordered.length} sections to ${activeManifest.name}`);
  },

  pingZoteroAction: async () => {
    const status = await pingZotero(get().zoteroPort);
    set({ zoteroStatus: status });
    return status;
  },

  addRawBibtexAction: async (rawBib) => {
    const incoming = parseBibTeX(rawBib);
    if (incoming.length === 0) return 0;
    const { bibEntries, projectPath } = get();
    const { merged, addedCount } = mergeBibEntries(bibEntries, incoming);
    set({ bibEntries: merged });
    if (projectPath) {
      await paperService.saveBibFile(projectPath, serializeBibLibrary(merged));
    }
    if (addedCount > 0) {
      get().setStatusMessage(`Added ${addedCount} reference${addedCount === 1 ? '' : 's'} to references.bib`);
    }
    return addedCount;
  },

  addReferenceByIdAction: async (identifier) => {
    const rawBib = await fetchBibtexByIdentifier(identifier);
    const parsed = parseBibTeX(rawBib);
    if (parsed.length === 0) {
      throw new Error('Resolver returned empty BibTeX.');
    }
    await get().addRawBibtexAction(rawBib);
    return parsed[0];
  },

  deleteBibEntryAction: async (key) => {
    const { bibEntries, projectPath } = get();
    const next = bibEntries.filter((e) => e.key !== key);
    set({ bibEntries: next });
    if (projectPath) {
      await paperService.saveBibFile(projectPath, serializeBibLibrary(next));
    }
  },

  importBibFileAction: async () => {
    const chosen = await fileService.pickFileDialog({
      title: 'Import BibTeX Library (.bib)',
      filters: [{ name: 'BibTeX Files', extensions: ['bib'] }],
    });
    if (!chosen) return 0;
    const opened = await fileService.readFileDirect(chosen);
    return await get().addRawBibtexAction(opened.content);
  },

  importFigureAction: async () => {
    const { projectPath } = get();
    if (!projectPath) return null;
    const chosen = await fileService.pickFileDialog({
      title: 'Insert Figure Image',
      filters: [{ name: 'Figure Images', extensions: ['png', 'jpg', 'jpeg', 'svg', 'pdf', 'eps', 'webp'] }],
    });
    if (!chosen) return null;

    const rawName = fileService.extractFileName(chosen);
    const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '-');
    const targetPath = fileService.joinPath(projectPath, 'figures', safeName);
    await fileService.copyAssetToProject(chosen, targetPath);
    await get().refreshFiguresAction();

    const slug = safeName.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return { relPath: `figures/${safeName}`, label: `fig:${slug}` };
  },

  refreshFiguresAction: async () => {
    const { projectPath } = get();
    if (!projectPath || !fileService.isTauri()) return;
    try {
      const nodes = await fileService.readDirTree(fileService.joinPath(projectPath, 'figures'));
      const map: Record<string, string> = {};
      for (const n of nodes) {
        if (n.is_dir) continue;
        const ext = n.name.split('.').pop()?.toLowerCase() || '';
        if (!['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'].includes(ext)) continue;
        try {
          const b64 = await fileService.readBinaryBase64(n.path);
          const url = `data:${mimeForExt(n.name)};base64,${b64}`;
          map[`figures/${n.name}`] = url;
          map[n.name] = url;
        } catch {
          // skip unreadable image
        }
      }
      set({ figureDataUrls: map });
    } catch {
      // ignore if figures/ empty
    }
  },

  detectToolchainAction: async () => {
    try {
      const info = await latexService.detectTexToolchain();
      set({ texToolchain: info });
    } catch {
      // ignore
    }
  },

  compilePdfAction: async (openPdfPane = true) => {
    const {
      projectPath,
      project,
      frontMatter,
      sectionContents,
      activeManifest,
      bibEntries,
      texEngine,
    } = get();
    if (!projectPath || !project) {
      get().setStatusMessage('Open a paper folder before compiling LaTeX.');
      return null;
    }

    await get().saveAllAction();
    set({ isCompilingPdf: true });
    get().setStatusMessage(`Compiling LaTeX with ${texEngine}…`);

    try {
      const assembled = await assembleLatexBuildDir({
        projectPath,
        project,
        frontMatter,
        sectionContents,
        manifest: activeManifest,
        bibEntries,
        pruneUnusedBib: true,
      });

      const result = await latexService.compileLatexBuild({
        buildDir: assembled.buildDir,
        texFilename: assembled.entryFile,
        engine: texEngine,
        useBiber: activeManifest.bibSystem === 'biblatex',
      });

      set({
        isCompilingPdf: false,
        lastCompileResult: result,
        lastBuildTexPath: assembled.texPath,
        ...(openPdfPane ? { viewMode: 'pdf' as ViewMode } : {}),
      });

      if (result.success) {
        get().setStatusMessage(
          `Compiled PDF in ${(result.elapsed_ms / 1000).toFixed(1)}s (${result.diagnostics.length} notes)`
        );
      } else {
        const errCount = result.diagnostics.filter((d) => d.severity === 'error').length;
        get().setStatusMessage(`LaTeX compile finished with ${errCount} error(s) — check Build Log`);
      }
      return result;
    } catch (err) {
      set({ isCompilingPdf: false });
      get().setStatusMessage(
        `Compile error: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  },

  openInTexstudioAction: async () => {
    const {
      projectPath,
      project,
      frontMatter,
      sectionContents,
      activeManifest,
      bibEntries,
      lastBuildTexPath,
    } = get();
    if (!projectPath || !project) return;
    let texPath = lastBuildTexPath;
    if (!texPath) {
      const assembled = await assembleLatexBuildDir({
        projectPath,
        project,
        frontMatter,
        sectionContents,
        manifest: activeManifest,
        bibEntries,
      });
      texPath = assembled.texPath;
      set({ lastBuildTexPath: texPath });
    }
    await fileService.openPathExternal(texPath, 'texstudio');
    get().setStatusMessage('Opened generated .tex in TeXstudio');
  },

  commitGitVersionAction: async () => {
    const { projectPath } = get();
    if (!projectPath) return;
    const msg = await promptDialog({
      title: 'Save Paper Version (Git Commit)',
      message: 'Optional commit message (e.g., "Completed Methods draft", "Pre-submission"):',
      placeholder: 'Manuscript milestone…',
      confirmLabel: 'Save Version',
    });
    if (msg === null) return;
    try {
      const res = await gitService.syncGit({ path: projectPath, commitMsg: msg, push: false });
      get().setStatusMessage(res);
      const changed = await gitService.getGitChangedFiles(projectPath);
      set({ gitChangedFiles: changed });
    } catch (err) {
      get().setStatusMessage(`Git error: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  syncGithubAction: async () => {
    const { projectPath, project } = get();
    if (!projectPath || !project) return;
    try {
      const status = await gitService.getGitStatus(projectPath);
      let remote = status.remote_url || project.gitRemoteUrl || '';
      if (!remote) {
        const entered = await promptDialog({
          title: 'Connect GitHub Repository',
          message: 'Enter your Git remote URL (HTTPS or SSH):',
          placeholder: 'https://github.com/username/my-paper.git',
          confirmLabel: 'Connect & Push',
        });
        if (!entered?.trim()) return;
        remote = entered.trim();
        const nextProject = { ...project, gitRemoteUrl: remote };
        set({ project: nextProject });
        await paperService.savePaperProject(projectPath, nextProject);
      }
      const res = await gitService.syncGit({ path: projectPath, remoteUrl: remote, push: true });
      get().setStatusMessage(res);
    } catch (err) {
      get().setStatusMessage(`Git push failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
}));

export function getActiveSection(state: PaperStoreState): PaperSection | null {
  if (!state.project || state.activeTarget === 'frontmatter') return null;
  return state.project.sections.find((s) => s.id === state.activeTarget) ?? null;
}

export function getTotalPaperWords(state: PaperStoreState): number {
  if (!state.project) return 0;
  return state.project.sections.reduce((acc, s) => acc + (s.wordCount || 0), 0);
}

export function getAllAvailableTemplates(state: PaperStoreState): TemplateManifest[] {
  return getAllManifests(state.customTemplates);
}

export const SECTION_STATUS_LABELS: Record<SectionStatus, string> = {
  outline: 'Outline',
  draft: 'Draft',
  revised: 'Revised',
  final: 'Ready',
};
