import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface SearchMatch {
  from: number;
  to: number;
}

export interface SearchState {
  term: string;
  caseSensitive: boolean;
  matches: SearchMatch[];
  currentIndex: number;
}

export const searchPluginKey = new PluginKey<SearchState>('mirtexSearch');

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mirtexSearch: {
      setSearchTerm: (term: string, caseSensitive?: boolean) => ReturnType;
      nextSearchMatch: () => ReturnType;
      prevSearchMatch: () => ReturnType;
      clearSearch: () => ReturnType;
      replaceCurrentMatch: (replacement: string) => ReturnType;
      replaceAllMatches: (replacement: string) => ReturnType;
    };
  }
}

function computeMatches(doc: Parameters<typeof DecorationSet.create>[0], term: string, caseSensitive: boolean): SearchMatch[] {
  if (!term) return [];
  const matches: SearchMatch[] = [];
  const needle = caseSensitive ? term : term.toLowerCase();

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const hay = caseSensitive ? node.text : node.text.toLowerCase();
    let idx = 0;
    while ((idx = hay.indexOf(needle, idx)) !== -1) {
      matches.push({ from: pos + idx, to: pos + idx + term.length });
      idx += Math.max(1, term.length);
    }
  });
  return matches;
}

export const SearchAndReplace = Extension.create({
  name: 'mirtexSearch',

  addCommands() {
    return {
      setSearchTerm:
        (term: string, caseSensitive = false) =>
        ({ tr, state, dispatch }) => {
          const matches = computeMatches(state.doc, term, caseSensitive);
          if (dispatch) {
            tr.setMeta(searchPluginKey, {
              term,
              caseSensitive,
              matches,
              currentIndex: matches.length > 0 ? 0 : -1,
            });
          }
          return true;
        },
      nextSearchMatch:
        () =>
        ({ tr, state, dispatch }) => {
          const prev = searchPluginKey.getState(state);
          if (!prev || prev.matches.length === 0) return false;
          const nextIdx = (prev.currentIndex + 1) % prev.matches.length;
          if (dispatch) tr.setMeta(searchPluginKey, { ...prev, currentIndex: nextIdx });
          return true;
        },
      prevSearchMatch:
        () =>
        ({ tr, state, dispatch }) => {
          const prev = searchPluginKey.getState(state);
          if (!prev || prev.matches.length === 0) return false;
          const nextIdx = (prev.currentIndex - 1 + prev.matches.length) % prev.matches.length;
          if (dispatch) tr.setMeta(searchPluginKey, { ...prev, currentIndex: nextIdx });
          return true;
        },
      clearSearch:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(searchPluginKey, { term: '', caseSensitive: false, matches: [], currentIndex: -1 });
          }
          return true;
        },
      replaceCurrentMatch:
        (replacement: string) =>
        ({ tr, state, dispatch }) => {
          const prev = searchPluginKey.getState(state);
          if (!prev || prev.currentIndex < 0 || !prev.matches[prev.currentIndex]) return false;
          const m = prev.matches[prev.currentIndex];
          if (dispatch) {
            tr.insertText(replacement, m.from, m.to);
          }
          return true;
        },
      replaceAllMatches:
        (replacement: string) =>
        ({ tr, state, dispatch }) => {
          const prev = searchPluginKey.getState(state);
          if (!prev || prev.matches.length === 0) return false;
          if (dispatch) {
            for (let i = prev.matches.length - 1; i >= 0; i--) {
              const m = prev.matches[i];
              tr.insertText(replacement, m.from, m.to);
            }
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchPluginKey,
        state: {
          init: () => ({ term: '', caseSensitive: false, matches: [], currentIndex: -1 }),
          apply(tr, prev, _old, newState) {
            const meta = tr.getMeta(searchPluginKey) as SearchState | undefined;
            if (meta) return meta;
            if (tr.docChanged && prev.term) {
              const matches = computeMatches(newState.doc, prev.term, prev.caseSensitive);
              return {
                ...prev,
                matches,
                currentIndex: matches.length > 0 ? Math.min(prev.currentIndex, matches.length - 1) : -1,
              };
            }
            return prev;
          },
        },
        props: {
          decorations(state) {
            const st = searchPluginKey.getState(state);
            if (!st || st.matches.length === 0) return DecorationSet.empty;
            const decos = st.matches.map((m, i) =>
              Decoration.inline(m.from, m.to, {
                class: i === st.currentIndex ? 'search-match search-match-current' : 'search-match',
              })
            );
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});
