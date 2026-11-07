import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Circle,
  CircleDot,
  Info,
  Sparkles,
} from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './StatusPill.module.css';

export type PillTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'ai';

const icons = {
  neutral: Circle,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
  accent: CircleDot,
  ai: Sparkles,
};

/**
 * A status label: the status tint, the status colour for the icon and words, and always both
 * (never colour alone). `ai` marks anything the AI wrote. Renter pages pass `large`, so the
 * words are body size like everything else a renter must read.
 */
export function StatusPill({
  tone = 'neutral',
  large,
  children,
}: {
  tone?: PillTone;
  large?: boolean;
  children: ReactNode;
}) {
  const Icon = icons[tone];
  return (
    <span className={`${styles.pill} ${styles[tone]} ${large ? styles.large : ''}`}>
      <Icon size={large ? 16 : 14} strokeWidth={2} aria-hidden="true" />
      {children}
    </span>
  );
}

/** The label on anything the AI drafted; a person approves it before it goes out. */
export function DraftedByAi() {
  return <StatusPill tone="ai">Drafted by AI</StatusPill>;
}
