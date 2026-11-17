import { ExternalLink } from 'lucide-react';
import { notFound } from 'next/navigation';
import { forwardingCopy, ruleFrom, settingsLinks } from '@/copy/forwarding';
import {
  type ForwardingFrom,
  forwardingFromQuery,
  type ForwardingService,
  isForwardingService,
} from '@/domain/enquiries/forwarding';
import { buttonProps } from '@/ui/Button';
import { CopyButton } from '@/ui/CopyButton';
import { Row } from '@/ui/Layout';
import styles from './forwarding.module.css';

const copy = forwardingCopy;

export type Query = Promise<{ letting?: string | string[]; live?: string | string[] }>;

/** The screen's mail service, from its address, and where the flow was opened from. */
export async function screenOf(
  params: Promise<{ service: string }>,
  searchParams: Query,
): Promise<{ service: ForwardingService; from: ForwardingFrom }> {
  const { service } = await params;
  if (!isForwardingService(service)) notFound();
  return { service, from: forwardingFromQuery(await searchParams) };
}

/** Something to copy into the person's own mail, with what it is above it. */
export function CopyValue({ label, value, what }: { label: string; value: string; what: string }) {
  return (
    <div className={styles.value}>
      <p className={styles.label}>{label}</p>
      <Row>
        <p className={`type-heading ${styles.code}`}>{value}</p>
        <CopyButton value={value} what={what} />
      </Row>
    </div>
  );
}

/** What the rule matches: the portals, and Gaff's test sender. Gmail's search wants "OR". */
export function RuleValue({
  service,
  testSender,
}: {
  service: ForwardingService;
  testSender: string;
}) {
  return (
    <CopyValue
      label={copy.steps.rule}
      value={ruleFrom(testSender, service === 'gmail' ? 'OR' : ',')}
      what={copy.steps.copyRule}
    />
  );
}

/**
 * The button that opens the mail service's own settings, in a new tab. The person changes their
 * own settings: Gaff never opens or fetches this page itself.
 */
export function OpenSettings({ service }: { service: ForwardingService }) {
  const href = settingsLinks[service];
  if (!href) return null;
  return (
    <div>
      <a href={href} target="_blank" rel="noopener noreferrer" {...buttonProps('secondary')}>
        <ExternalLink size={20} strokeWidth={1.75} aria-hidden="true" />
        {copy.steps.open[service]}
        <span className="visually-hidden"> {copy.steps.opensElsewhere}</span>
      </a>
    </div>
  );
}
