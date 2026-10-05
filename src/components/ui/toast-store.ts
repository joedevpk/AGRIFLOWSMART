export type ToastType = 'success' | 'error' | 'info';
type ToastHandler = (type: ToastType, message: string) => void;

let handler: ToastHandler | null = null;

/** Appelé par <ToastContainer/> pour s'enregistrer comme récepteur des notifications. */
export function registerToastHandler(fn: ToastHandler | null) {
  handler = fn;
}

export function toast(type: ToastType, message: string) {
  handler?.(type, message);
}
