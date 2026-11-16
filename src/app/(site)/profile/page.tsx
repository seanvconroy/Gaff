import type { Metadata } from 'next';
import { requirePerson } from '@/server/context/current-person';
import { Card, Narrow, PageHeader, Stack } from '@/ui/Layout';
import { SummaryList } from '@/ui/SummaryList';

export const metadata: Metadata = { title: 'Profile' };

/**
 * Profile, from the account menu (UX-NV-8): for now, the name and email address the person signs
 * in with. Work packages WP-5 and WP-14 build the rest. Only the person themselves sees this.
 */
export default async function ProfilePage() {
  const person = await requirePerson();
  return (
    <Stack gap={8}>
      <PageHeader title="Profile" />
      <Narrow>
        <Card as="div">
          <SummaryList
            rows={[
              // Until someone gives their name, there is only the address they signed in with.
              {
                label: 'Name',
                value: person.name === person.email ? 'Not given yet' : person.name,
              },
              { label: 'Email', value: person.email },
            ]}
          />
        </Card>
      </Narrow>
    </Stack>
  );
}
