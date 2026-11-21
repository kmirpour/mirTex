import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

export type PopupTriggerKind = 'citation' | 'crossref';

export interface TriggerPopupState {
  active: boolean;
  kind: PopupTriggerKind | null;
  query: string;
  range: { from: number; to: number };
  coords: { left: number; top: number; bottom: number } | null;
}

export const triggerPopupPluginKey = new PluginKey<TriggerPopupState>('mirtexTriggerPopup');

const INACTIVE: TriggerPopupState = {
  active: false,
  kind: null,
  query: '',
  range: { from: 0, to: 0 },
  coords: null,
};

export const AcademicImageMarkdown = Extension.create({
  name: 'mirtexAcademicImageMarkdown',
  markdownTokenName: 'image',
  parseMarkdown: (token, helpers) => {
    const raw = token.raw || `![${token.text || ''}](${token.href || ''})`;
    return helpers.createTextNode(raw);
  },
});

/**
 * TipTap ProseMirror plugin that listens for:
 * - `[@query` -> opens inline Citation Picker
 * - `@fig:query`, `@tbl:query`, `@eq:query`, `@sec:query` -> opens Cross-Reference Picker
 */
export const TriggerPopup = Extension.create({
  name: 'mirtexTriggerPopup',

  addProseMirrorPlugins() {
    return [
      new Plugin<TriggerPopupState>({
        key: triggerPopupPluginKey,
        state: {
          init: () => INACTIVE,
          apply(tr, prev, _old, newState) {
            const meta = tr.getMeta(triggerPopupPluginKey) as TriggerPopupState | undefined;
            if (meta !== undefined) return meta;

            const { from, empty } = newState.selection;
            if (!empty) return INACTIVE;

            const $from = newState.doc.resolve(from);
            const textBefore = $from.parent.textBetween(0, $from.parentOffset, '\0', '\0');

            // 1. Citation trigger: `[@query`
            const citeMatch = /\[@([a-zA-Z0-9_.:-]*)$/.exec(textBefore);
            if (citeMatch) {
              const startPos = from - citeMatch[0].length;
              return {
                active: true,
                kind: 'citation',
                query: citeMatch[1],
                range: { from: startPos, to: from },
                coords: prev.active && prev.kind === 'citation' ? prev.coords : null,
              };
            }

            // 2. Cross-reference trigger: `@fig:`, `@tbl:`, `@eq:`, `@sec:`
            const refMatch = /(?:^|[\s(])@((?:fig|tbl|eq|sec):[a-zA-Z0-9_.-]*)$/.exec(textBefore);
            if (refMatch) {
              const atIdx = refMatch[0].indexOf('@');
              const startPos = from - (refMatch[0].length - atIdx);
              return {
                active: true,
                kind: 'crossref',
                query: refMatch[1],
                range: { from: startPos, to: from },
                coords: prev.active && prev.kind === 'crossref' ? prev.coords : null,
              };
            }

            return INACTIVE;
          },
        },
        props: {
          handleKeyDown(view: EditorView, event: KeyboardEvent) {
            const state = triggerPopupPluginKey.getState(view.state);
            if (!state?.active) return false;

            if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
              const ev = new CustomEvent('mirtex-popup-keydown', {
                detail: { key: event.key, shiftKey: event.shiftKey },
                cancelable: true,
                bubbles: true,
              });
              view.dom.dispatchEvent(ev);
              if (ev.defaultPrevented) {
                event.preventDefault();
                event.stopPropagation();
                return true;
              }
            }
            return false;
          },
        },
        view(editorView) {
          let wasActive = false;
          let lastKind: PopupTriggerKind | null = null;
          let lastQuery = '';
          let lastFrom = -1;

          const notify = () => {
            const st = triggerPopupPluginKey.getState(editorView.state) || INACTIVE;
            if (!st.active && !wasActive) {
              return;
            }
            if (
              st.active &&
              wasActive &&
              st.kind === lastKind &&
              st.query === lastQuery &&
              st.range.from === lastFrom
            ) {
              return;
            }

            wasActive = st.active;
            lastKind = st.kind;
            lastQuery = st.query;
            lastFrom = st.active ? st.range.from : -1;

            let coords = st.coords;
            if (st.active) {
              try {
                const c = editorView.coordsAtPos(st.range.from);
                coords = { left: c.left, top: c.top, bottom: c.bottom };
              } catch {
                coords = null;
              }
            }
            editorView.dom.dispatchEvent(
              new CustomEvent('mirtex-popup-update', { detail: { ...st, coords } })
            );
          };
          return {
            update: notify,
            destroy: () => {
              if (wasActive) {
                wasActive = false;
                editorView.dom.dispatchEvent(
                  new CustomEvent('mirtex-popup-update', { detail: INACTIVE })
                );
              }
            },
          };
        },
      }),
    ];
  },
});
