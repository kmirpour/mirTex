import { type Theme, applyTheme, isTheme } from './themes';
import type { CitationStyle } from '../types/citation';

export type { Theme } from './themes';
export type ViewMode = 'editor' | 'split' | 'pdf' | 'preview' | 'scratchpad' | 'reference';
export type TexEngine = 'pdflatex' | 'xelatex' | 'lualatex';

export const TYPEFACES = [
  { id: 'serif', label: 'Georgia', kind: 'Serif', stack: "Georgia, 'Palatino Linotype', Palatino, serif" },
  { id: 'palatino', label: 'Palatino', kind: 'Serif', stack: "'Palatino Linotype', Palatino, Georgia, serif" },
  { id: 'cambria', label: 'Cambria', kind: 'Serif', stack: "Cambria, Georgia, serif" },
  { id: 'garamond', label: 'Garamond', kind: 'Serif', stack: "Garamond, 'EB Garamond', Georgia, serif" },
  { id: 'times', label: 'Times New Roman', kind: 'Serif', stack: "'Times New Roman', Times, serif" },
  { id: 'sans', label: 'System Sans', kind: 'Sans-serif', stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
  { id: 'calibri', label: 'Calibri', kind: 'Sans-serif', stack: "Calibri, 'Segoe UI', sans-serif" },
  { id: 'mono', label: 'Consolas', kind: 'Monospace', stack: "Consolas, 'Courier New', monospace" },
] as const;

export type FontFamily = (typeof TYPEFACES)[number]['id'];

export function typefaceInfo(id: FontFamily) {
  return TYPEFACES.find((t) => t.id === id) ?? TYPEFACES[0];
}

export const FONT_SIZE_RANGE = { min: 12, max: 28 };
export const LINE_HEIGHT_RANGE = { min: 1.3, max: 2.2 };
export const LINE_WIDTH_RANGE = { min: 560, max: 1100 };

export interface AppSettings {
  theme: Theme;
  viewMode: ViewMode;
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  autoSaveEnabled: boolean;
  autoSaveIntervalMs: number;
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
  zoteroEnabled: boolean;
  zoteroPort: number;
  watchedBibPath: string;
  lastProjectPath: string | null;
  recentProjects: string[];
}

const SETTINGS_KEY = 'mirtex-settings';

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'sepia',
  viewMode: 'editor',
  sidebarOpen: true,
  inspectorOpen: true,
  autoSaveEnabled: true,
  autoSaveIntervalMs: 1500,
  fontFamily: 'serif',
  fontSize: 16.5,
  lineHeight: 1.75,
  lineWidth: 780,
  smartQuotes: false,
  focusMode: false,
  typewriterMode: false,
  dimUnfocused: false,
  spellCheckEnabled: true,
  citationStyle: 'nature',
  texEngine: 'pdflatex',
  zoteroEnabled: true,
  zoteroPort: 23119,
  watchedBibPath: '',
  lastProjectPath: null,
  recentProjects: [],
};

const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      theme: isTheme(parsed.theme) ? parsed.theme : DEFAULT_SETTINGS.theme,
      fontFamily: TYPEFACES.some((t) => t.id === parsed.fontFamily)
        ? (parsed.fontFamily as FontFamily)
        : DEFAULT_SETTINGS.fontFamily,
      fontSize: clamp(parsed.fontSize, FONT_SIZE_RANGE.min, FONT_SIZE_RANGE.max, DEFAULT_SETTINGS.fontSize),
      lineHeight: clamp(parsed.lineHeight, LINE_HEIGHT_RANGE.min, LINE_HEIGHT_RANGE.max, DEFAULT_SETTINGS.lineHeight),
      lineWidth: clamp(parsed.lineWidth, LINE_WIDTH_RANGE.min, LINE_WIDTH_RANGE.max, DEFAULT_SETTINGS.lineWidth),
      recentProjects: stringList(parsed.recentProjects),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(partial: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const updated: AppSettings = { ...current, ...partial };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    if (partial.theme) applyTheme(updated.theme);
  } catch {
    // ignore storage errors
  }
  return updated;
}

export function addRecentProject(projectPath: string): AppSettings {
  const current = loadSettings();
  const filtered = current.recentProjects.filter((p) => p !== projectPath);
  return saveSettings({
    recentProjects: [projectPath, ...filtered].slice(0, 8),
    lastProjectPath: projectPath,
  });
}

export function removeRecentProject(projectPath: string): AppSettings {
  const current = loadSettings();
  return saveSettings({
    recentProjects: current.recentProjects.filter((p) => p !== projectPath),
  });
}
