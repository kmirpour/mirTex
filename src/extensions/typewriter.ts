import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface TypewriterOptions {
  isEnabled: () => boolean;
}

export const Typewriter = Extension.create<TypewriterOptions>({
  name: 'typewriter',

  addOptions() {
    return { isEnabled: () => false };
  },

  addProseMirrorPlugins() {
    const isEnabled = this.options.isEnabled;
    return [
      new Plugin({
        key: new PluginKey('typewriter'),
        view() {
          return {
            update(view, prevState) {
              if (!isEnabled()) return;
              if (prevState.selection.eq(view.state.selection)) return;
              const { from } = view.state.selection;
              try {
                const coords = view.coordsAtPos(from);
                const scroller = view.dom.closest('.editor-scroll-container') as HTMLElement | null;
                if (!scroller) return;
                const rect = scroller.getBoundingClientRect();
                const targetY = rect.top + rect.height * 0.45;
                const delta = coords.top - targetY;
                if (Math.abs(delta) > 24) {
                  scroller.scrollBy({ top: delta, behavior: 'smooth' });
                }
              } catch {
                // ignore out-of-bounds pos
              }
            },
          };
        },
      }),
    ];
  },
});
