import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { objectStorage } from '@/adapters/storage';
import { mediaKeys } from '@/domain/media/photos';
import { formatRent } from '@/lib/format';
import { requireMember } from '@/server/auth/member';
import { developmentForEditor } from '@/server/developments/developments';
import { ButtonLink } from '@/ui/Button';
import { Card, PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { StatusPill } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import { Table } from '@/ui/Table';
import { PhotoUploader } from '../../PhotoUploader';
import {
  finishDevelopmentUploadAction,
  publishDevelopmentAction,
  publishHomesAction,
  startDevelopmentUploadAction,
} from '../actions';
import { AddHomesForm, DescriptionForm } from './DevelopmentForms';
import styles from './development.module.css';

export const metadata: Metadata = { title: 'Development' };

const listingWords: Record<string, string> = {
  draft: 'Draft',
  in_review: 'With Gaff',
  live: 'Live',
  paused: 'Paused',
  enquiries_closed: 'Enquiries closed',
  let_agreed: 'Let agreed',
  let: 'Let',
  withdrawn: 'Withdrawn',
};

/** M32 to M35: one development: its page, its photos, and the homes in it. */
export default async function DevelopmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ developmentId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const member = await requireMember();
  const { developmentId } = await params;
  const notice = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(developmentId)) notFound();
  const detail = await developmentForEditor(member, developmentId);
  if (!detail) notFound();
  const { development, photos, homes, problems } = detail;
  const storage = objectStorage();
  const drafts = homes.filter((h) => h.listingStatus === 'draft').length;

  return (
    <Stack gap={8}>
      <PageHeader
        eyebrow="Development"
        title={development.name}
        lead={`${development.addressLine1}, ${development.area}`}
        actions={
          development.status === 'live' ? (
            <ButtonLink href={`/development/${development.slug}`}>See its page</ButtonLink>
          ) : null
        }
      />
      {notice.published ? (
        <Notice tone="success" title="The development’s page is live" role="status">
          <p>Its homes link to it, and it lists every home taking enquiries.</p>
        </Notice>
      ) : null}
      {notice.live !== undefined ? (
        <Notice tone="success" role="status">
          <p>
            {notice.live} published
            {Number(notice.held) ? `, ${notice.held} waiting for a person at Gaff` : ''}
            {Number(notice.waiting) ? `, ${notice.waiting} still need details` : ''}.
          </p>
        </Notice>
      ) : null}

      <Card labelledBy="page-heading">
        <Stack gap={6}>
          <h2 id="page-heading" className="type-title">
            The development’s page
          </h2>
          {development.status === 'live' ? (
            <StatusPill tone="success">Live</StatusPill>
          ) : problems.length ? (
            <ul className={styles.problems}>
              {problems.map((p) => (
                <li key={p.message}>{p.message}</li>
              ))}
            </ul>
          ) : (
            <form action={publishDevelopmentAction.bind(null, development.id)}>
              <SubmitButton pendingLabel="Publishing…">Publish the development’s page</SubmitButton>
            </form>
          )}
          <DescriptionForm
            id={development.id}
            description={development.description ?? ''}
            chosen={development.amenities}
          />
          <h3 className="type-title">Photos</h3>
          <p>Every home in the development shows these after its own.</p>
          <PhotoUploader
            start={startDevelopmentUploadAction.bind(null, development.id)}
            finish={finishDevelopmentUploadAction.bind(null, development.id)}
            label="Add photos of the development"
          />
          <ul className={styles.photos}>
            {photos.map((photo) =>
              photo.status === 'ready' && photo.widths ? (
                <li key={photo.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={storage.publicUrl(
                      mediaKeys(photo.organisationId, photo.id).sized(photo.widths[0]!),
                    )}
                    alt={photo.altText ?? 'Photo of the development'}
                    width={photo.width ?? undefined}
                    height={photo.height ?? undefined}
                    className={styles.thumb}
                  />
                </li>
              ) : (
                <li key={photo.id}>
                  <StatusPill tone={photo.status === 'rejected' ? 'warning' : 'info'}>
                    {photo.status === 'rejected'
                      ? 'Couldn’t use this file'
                      : 'Checking and resizing…'}
                  </StatusPill>
                </li>
              ),
            )}
          </ul>
        </Stack>
      </Card>

      <Card labelledBy="homes-heading">
        <Stack gap={6}>
          <h2 id="homes-heading" className="type-title">
            Homes in {development.name}
          </h2>
          {homes.length ? (
            <Table caption="Homes" head={['Home', 'Bedrooms', 'Rent', 'Listing']}>
              {homes.map((home) => (
                <tr key={home.lettingId}>
                  <td>
                    <Link href={`/lettings/${home.lettingId}/listing`}>{home.addressLine1}</Link>
                  </td>
                  <td>{home.bedrooms}</td>
                  <td>{formatRent(home.rentCents)}</td>
                  <td>{listingWords[home.listingStatus] ?? home.listingStatus}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <p>No homes yet. Add the first one, then copy it for the rest.</p>
          )}
          <p>
            <Link href={`/lettings/new?development=${development.id}`}>
              Add a home in {development.name}
            </Link>
          </p>
          {homes.length ? (
            <>
              <h3 className="type-title">Add many homes at once</h3>
              <AddHomesForm
                id={development.id}
                templates={homes.map((h) => ({
                  lettingId: h.lettingId,
                  label: `${h.addressLine1} (${h.bedrooms} bed, ${formatRent(h.rentCents)})`,
                }))}
              />
            </>
          ) : null}
          {drafts ? (
            <form action={publishHomesAction.bind(null, development.id)}>
              <Stack gap={4}>
                <h3 className="type-title">
                  Publish {drafts === 1 ? 'the draft home' : `the ${drafts} draft homes`}
                </h3>
                {notice.declare ? (
                  <Notice tone="warning" role="alert">
                    <p>Confirm you can let these homes first.</p>
                  </Notice>
                ) : null}
                <label className={styles.declare}>
                  <input type="checkbox" name="declare" value="yes" />
                  <span>
                    I own these homes or I’m authorised to let them, and their details are true.
                  </span>
                </label>
                <div>
                  <SubmitButton variant="secondary" pendingLabel="Publishing…">
                    Publish the homes that are ready
                  </SubmitButton>
                </div>
              </Stack>
            </form>
          ) : null}
        </Stack>
      </Card>
    </Stack>
  );
}
