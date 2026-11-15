import type { Metadata } from 'next';
import {
  formatDuration,
  formatShare,
  variantLabel,
  type FunnelReport,
} from '@/domain/funnels/report';
import { requireStaff } from '@/server/auth/staff';
import { funnelReportsFor } from '@/server/funnels/report';
import { Card, CardHeader, PageHeader, Stack } from '@/ui/Layout';
import { Cell, Table, tableStyles } from '@/ui/Table';

export const metadata: Metadata = { title: 'Funnels' };
export const dynamic = 'force-dynamic';

/** A dash for sighted readers, and the reason in words for screen readers. */
function Nothing({ why }: { why: string }) {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="visually-hidden">{why}</span>
    </>
  );
}

function FunnelCard({ report }: { report: FunnelReport }) {
  const id = `funnel-${report.code}`;
  const noData = report.steps.every((step) => step.reached === 0);
  return (
    <Card labelledBy={id}>
      <CardHeader
        id={id}
        title={report.label}
        description={`Measure: ${report.measure}. Target: ${report.target}.`}
      />
      <Table
        caption={`${report.label}: steps`}
        head={['Step', 'Reached', 'Of the step before', 'Of the first step', 'Median time']}
      >
        {report.steps.map((step) => (
          <tr key={step.code}>
            <Cell label="Step" className={tableStyles.strong}>
              {step.label}
            </Cell>
            <Cell label="Reached">{noData ? <Nothing why="Nothing yet" /> : step.reached}</Cell>
            <Cell label="Of the step before">
              {step.fromPrevious === null ? (
                <Nothing why="Nothing to compare" />
              ) : (
                formatShare(step.fromPrevious)
              )}
            </Cell>
            <Cell label="Of the first step">
              {step.fromFirst === null ? (
                <Nothing why="Nothing to compare" />
              ) : (
                formatShare(step.fromFirst)
              )}
            </Cell>
            <Cell label="Median time">
              {step.timedFromLabel === null ? (
                <Nothing why="Not timed" />
              ) : (
                // One block, so on a phone both lines sit beside the column's name.
                <div>
                  {step.medianMs === null ? (
                    <Nothing why="Nothing yet" />
                  ) : (
                    formatDuration(step.medianMs)
                  )}
                  <span className={tableStyles.sub}>from “{step.timedFromLabel}”</span>
                </div>
              )}
            </Cell>
          </tr>
        ))}
      </Table>
      {report.split ? (
        <Table
          caption={`${report.label}: by ${report.split.label.toLowerCase()}`}
          head={[report.split.label, ...report.steps.map((step) => step.label)]}
        >
          {report.split.rows.map((row) => (
            <tr key={row.variant ?? 'not-known'}>
              <Cell label={report.split!.label} className={tableStyles.strong}>
                {variantLabel(row.variant)}
              </Cell>
              {report.steps.map((step, index) => (
                <Cell key={step.code} label={step.label}>
                  {row.reached[index]}
                </Cell>
              ))}
            </tr>
          ))}
        </Table>
      ) : null}
    </Card>
  );
}

/**
 * UX-ME-2: each funnel from section 9 of the UX redesign, counted from Gaff's own events across
 * every organisation. Totals only: no names, no rows for one person, no organisation's name.
 * This is also where a baseline is read (UX-ME-5).
 */
export default async function FunnelsPage() {
  const staff = await requireStaff();
  const reports = await funnelReportsFor(staff);
  return (
    <Stack gap={8}>
      <PageHeader
        eyebrow="Gaff internal"
        title="Funnels"
        lead="How far people get in each key flow, across every organisation on Gaff. These are totals: nobody is named and no organisation is shown."
      />
      <Card tone="quiet" labelledBy="how-to-read">
        <h2 id="how-to-read" className="type-title">
          How to read this
        </h2>
        <p>
          “Reached” is how many got to a step. Each one counts once, however often it happened. The
          two shares compare that number with the step before and with the first step. The median
          time is between the two steps named, for those who reached both. A dash means there is
          nothing to count yet.
        </p>
      </Card>
      {reports.map((report) => (
        <FunnelCard key={report.code} report={report} />
      ))}
    </Stack>
  );
}
