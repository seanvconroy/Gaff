import { formatDate, formatRent, irishToday } from '@/lib/format';

/**
 * M86: alert emails. From Gaff's alerts address, never a letter. Plain text, every home with its
 * rent and when it's available, and how to change or stop the alerts in one click.
 */
export interface AlertHome {
  title: string;
  rentCents: number;
  availableFrom: string;
  url: string;
}

export interface AlertSearch {
  name: string;
  stopUrl: string;
  homes: AlertHome[];
}

export function alertEmail(input: {
  givenName: string;
  frequency: 'instant' | 'daily';
  searches: AlertSearch[];
  manageUrl: string;
  stopAllUrl: string;
  now?: Date;
}): { subject: string; text: string } {
  const now = input.now ?? new Date();
  const homes = input.searches.flatMap((s) => s.homes);
  const subject =
    homes.length === 1
      ? `New home: ${homes[0]!.title}`
      : `${homes.length} new homes for your ${input.searches.length === 1 ? 'search' : 'searches'}`;
  const lines = [`Hello ${input.givenName},`, ''];
  for (const search of input.searches) {
    lines.push(
      search.homes.length === 1
        ? `A new home matches your search “${search.name}”:`
        : `${search.homes.length} new homes match your search “${search.name}”:`,
      '',
    );
    for (const home of search.homes) {
      const available =
        home.availableFrom <= irishToday(now)
          ? 'available now'
          : `available from ${formatDate(home.availableFrom, now)}`;
      lines.push(home.title, `${formatRent(home.rentCents)}, ${available}`, home.url, '');
    }
    lines.push(`Stop alerts for “${search.name}”: ${search.stopUrl}`, '');
  }
  lines.push(
    input.frequency === 'instant'
      ? 'You get these as soon as a home is listed. Every home on Gaff is checked, and everyone who enquires hears back.'
      : 'You get these once a day, at 8am. Every home on Gaff is checked, and everyone who enquires hears back.',
    '',
    `Change how often, or stop: ${input.manageUrl}`,
    `Stop all your alerts with one click: ${input.stopAllUrl}`,
    '',
    'Gaff',
  );
  return { subject, text: lines.join('\n') };
}
