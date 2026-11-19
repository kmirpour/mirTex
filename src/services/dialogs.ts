export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}

export type ActiveDialog =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (val: string | null) => void };

type Listener = (dialog: ActiveDialog | null) => void;

const listeners = new Set<Listener>();
let currentDialog: ActiveDialog | null = null;

function notify(next: ActiveDialog | null) {
  currentDialog = next;
  listeners.forEach((fn) => fn(next));
}

export function subscribeDialog(listener: Listener): () => void {
  listeners.add(listener);
  listener(currentDialog);
  return () => {
    listeners.delete(listener);
  };
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    notify({
      kind: 'confirm',
      options,
      resolve: (ok) => {
        notify(null);
        resolve(ok);
      },
    });
  });
}

export function promptDialog(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    notify({
      kind: 'prompt',
      options,
      resolve: (val) => {
        notify(null);
        resolve(val);
      },
    });
  });
}
