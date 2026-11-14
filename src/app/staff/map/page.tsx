import type { Metadata } from 'next';
import { failureWords } from '@/copy/map';
import { failureKinds } from '@/domain/map/counts';
import { formatDate } from '@/lib/format';
import { mapSettings } from '@/lib/map';
import { requireStaff } from '@/server/auth/staff';
import { failuresOf, mapCounts, opensOf } from '@/server/measurement/map-counts';
import { PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { Table } from '@/ui/Table';

export const metadata: Metadata = { title: 'The map' };

const providerWords = {
  google: 'Google Maps',
  static: 'the stand-in map (no Google key is set)',
} as const;

/**
 * M133: how the search map is used, by day, for the last 31 days. Counts of uses, not people:
 * nothing about a renter, their device, the area or the search is kept. Staff set the opens
 * beside the map loads Google bills, and see what failed and why (M120).
 */
export default async function StaffMapPage() {
  const staff = await requireStaff();
  const { days, total } = await mapCounts(staff);
  const settings = mapSettings();
  const failed = failuresOf(total);

  return (
    <Stack gap={8}>
      <PageHeader
        title="The map"
        lead="How the search map was used in the last 31 days. These are counts of uses, with nothing about who or where."
      />
      <p>
        {settings
          ? `This copy of Gaff shows ${providerWords[settings.provider]}.`
          : 'The map is switched off on this copy of Gaff: renters see the list alone.'}
      </p>
      {days.length === 0 ? (
        <p>Nobody has opened the map yet.</p>
      ) : (
        <>
          <p>
            Opened {opensOf(total)} times ({total.opened.phone} on phones and tablets,{' '}
            {total.opened.larger} beside the list), shown {total.shown} times, and couldn’t load{' '}
            {failed} {failed === 1 ? 'time' : 'times'}. Each map that’s shown is one map load on
            Google’s bill: compare this with the month’s map loads in Google’s console.
          </p>
          {failed > 0 ? (
            <Notice tone="warning" title="Why the map couldn’t load">
              <ul>
                {failureKinds
                  .filter((kind) => total.failed[kind] > 0)
                  .map((kind) => (
                    <li key={kind}>
                      {total.failed[kind]}: {failureWords[kind]}
                    </li>
                  ))}
              </ul>
            </Notice>
          ) : null}
          <Table
            caption="The map, by day"
            head={[
              'Day',
              'Opened',
              'Shown',
              'Couldn’t load',
              'Area searches',
              'Shapes drawn',
              'Pins opened',
            ]}
          >
            {days.map((day) => (
              <tr key={day.day}>
                <td>{formatDate(day.day)}</td>
                <td>{opensOf(day)}</td>
                <td>{day.shown}</td>
                <td>{failuresOf(day)}</td>
                <td>{day.areaSearches}</td>
                <td>{day.shapes}</td>
                <td>{day.pins + day.sharedPins}</td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </Stack>
  );
}
