'use client';

import { Check } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import styles from './Toast.module.css';

export interface ToastMessage {
  /** A word or a short sentence: "Saved", "Copied", "Viewing time removed". */
  message: string;
  /** Where the action can be undone: it is done at once, and this takes it back. */
  undo?: () => void;
}

interface ToastApi {
  show: (toast: ToastMessage) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** How long a toast stays: ten seconds when it offers Undo (section 8, "Confirmation"). */
const PLAIN_MS = 5_000;
const UNDO_MS = 10_000;

/**
 * Toasts (section 8): "Saved", "Copied", "Sent", with Undo where the action can be undone, which
 * replaces "Are you sure?". One at a time. On a phone it sits above the tab bar; on a desktop,
 * bottom left. Screen readers hear it without focus moving, and it waits while it's hovered or
 * has focus, so there is time to reach Undo by keyboard.
 *
 * Put the provider round a shell once; anything inside calls `useToast().show(...)`.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastMessage & { id: number }) | null>(null);
  const [held, setHeld] = useState(false);
  const count = useRef(0);

  const show = useCallback((next: ToastMessage) => {
    count.current += 1;
    setHeld(false);
    setToast({ ...next, id: count.current });
  }, []);

  useEffect(() => {
    if (!toast || held) return;
    const timer = window.setTimeout(() => setToast(null), toast.undo ? UNDO_MS : PLAIN_MS);
    return () => window.clearTimeout(timer);
  }, [toast, held]);

  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Always in the page, so a screen reader is already listening when a toast arrives. */}
      <div className={styles.region} role="status" aria-live="polite">
        {toast ? (
          <div
            key={toast.id}
            className={styles.toast}
            onMouseEnter={() => setHeld(true)}
            onMouseLeave={() => setHeld(false)}
            onFocus={() => setHeld(true)}
            onBlur={() => setHeld(false)}
          >
            <Check className={styles.icon} size={20} strokeWidth={2} aria-hidden="true" />
            <span className={styles.message}>{toast.message}</span>
            {toast.undo ? (
              <button
                type="button"
                className={styles.undo}
                onClick={() => {
                  toast.undo?.();
                  setToast(null);
                }}
              >
                Undo
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast needs a ToastProvider round the shell');
  return api;
}
