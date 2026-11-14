import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { canDisconnect, type SocialProvider } from '@/domain/auth/email-authority';
import { methodWords } from '@/domain/auth/sign-in-methods';
import { connectProblemWords, problemForCode } from '@/domain/auth/sign-in-problems';
import { env } from '@/lib/env';
import { formatDate, formatDateTime } from '@/lib/format';
import { currentSession, findMember } from '@/server/auth/member';
import { offeredProviders } from '@/server/auth/providers';
import { signInOverview } from '@/server/auth/security';
import { findStaff } from '@/server/auth/staff';
import { renterProfile } from '@/server/renters/profile';
import { Disclosure } from '@/ui/Disclosure';
import { TextField } from '@/ui/Field';
import { BackLink, PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { ProviderButton } from '@/ui/ProviderButton';
import { StatusPill } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import {
  connectProviderAction,
  disconnectProviderAction,
  removePasskeyAction,
  renamePasskeyAction,
  signOutDeviceAction,
  signOutOthersAction,
} from './actions';
import { AddPasskey } from './AddPasskey';
import { PasswordForm } from './PasswordForms';
import styles from './security.module.css';

export const metadata: Metadata = { title: 'How you sign in' };
export const dynamic = 'force-dynamic';

const names: Record<SocialProvider, string> = { google: 'Google', apple: 'Apple' };

const doneWords: Record<string, string> = {
  password_added: 'Your password is added. You can sign in with it from now on.',
  password_changed: 'Your password is changed, and your other devices have been signed out.',
  disconnected: 'Disconnected. It can’t be used to sign in to this account any more.',
  passkey_added: 'Your passkey is added. Next time, choose “Sign in with a passkey”.',
  passkey_removed:
    'That passkey is removed. Delete it from your device or password manager too, so it isn’t offered again.',
  passkey_renamed: 'Renamed.',
  device_signed_out: 'That device is signed out.',
  others_signed_out: 'Every other device is signed out.',
};

/** Where "Back" goes: the workspace, Gaff's own tools, or a renter's homes. */
async function home(userId: string): Promise<{ href: string; words: string }> {
  if (await findMember(userId)) return { href: '/settings', words: 'Back to settings' };
  if (await findStaff(userId)) return { href: '/staff/checks', words: 'Back to Gaff’s tools' };
  if (env().MARKETPLACE_PUBLIC && (await renterProfile(userId))) {
    return { href: '/my/account', words: 'Back to your account' };
  }
  return { href: '/welcome', words: 'Back' };
}

/**
 * AU7, AU8: how this person signs in, and where they're signed in: the same page for renters,
 * letters and staff. Changing a way in needs a sign-in in the last hour; otherwise the change
 * goes by way of "Confirm it's you".
 */
export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{
    done?: string;
    problem?: string;
    error?: string;
    provider?: string;
    need?: string;
  }>;
}) {
  const session = await currentSession();
  if (!session) redirect('/sign-in?next=%2Faccount%2Fsecurity');
  const { done, problem, error, provider, need } = await searchParams;
  const overview = await signInOverview(session.user.id, session.session.id);
  const offered = offeredProviders();
  const back = await home(session.user.id);
  const from = provider === 'google' || provider === 'apple' ? provider : undefined;
  const linkProblem = problemForCode(typeof error === 'string' ? error : undefined);
  const doneLine =
    done === 'connected' && from
      ? `${names[from]} is connected. You can sign in with it from now on.`
      : done
        ? doneWords[done]
        : undefined;
  const others = overview.devices.filter((device) => !device.current);

  return (
    <Stack gap={8}>
      <Stack gap={4}>
        <BackLink href={back.href}>{back.words}</BackLink>
        <PageHeader title="How you sign in" lead={`You’re signed in as ${session.user.email}.`} />
      </Stack>

      {/* M5: sent here from Gaff's own tools, which take a passkey and nothing else. */}
      {need === 'passkey' && overview.passkeys.length === 0 ? (
        <Notice tone="info" role="status">
          <p>
            Gaff’s own tools need a passkey. Add one under “Passkeys” below, then open the tools
            again and sign in with it.
          </p>
        </Notice>
      ) : null}
      {doneLine ? (
        <Notice tone="success" role="status">
          <p>{doneLine}</p>
        </Notice>
      ) : null}
      {linkProblem ? (
        <Notice tone="warning" role="alert">
          <p>{connectProblemWords(linkProblem, from)}</p>
        </Notice>
      ) : problem ? (
        <Notice tone="warning" role="alert">
          <p>That didn’t work. It may already have been removed. Check the lists below.</p>
        </Notice>
      ) : null}

      <section aria-labelledby="ways-heading" className={styles.section}>
        <h2 id="ways-heading" className="type-heading">
          Ways to sign in
        </h2>
        <ul className={styles.rows}>
          <li className={styles.row}>
            <div className={styles.what}>
              <span className={styles.name}>A code by email</span>
              <span className={styles.detail}>
                Always there. We email a 6-digit code to {session.user.email}.
              </span>
            </div>
          </li>
          <li className={styles.row}>
            <div className={styles.what}>
              <span className={styles.name}>Password</span>
              <span className={styles.detail}>
                {overview.hasPassword ? 'You have a password.' : 'You haven’t set one.'}
              </span>
            </div>
            <Disclosure summary={overview.hasPassword ? 'Change your password' : 'Add a password'}>
              <PasswordForm email={session.user.email} has={overview.hasPassword} />
            </Disclosure>
          </li>
          {(['google', 'apple'] as const).map((who) => {
            const connectedOn = overview.providers[who];
            if (!connectedOn && !offered.includes(who)) return null;
            return (
              <li key={who} className={styles.row}>
                <div className={styles.what}>
                  <span className={styles.name}>{names[who]}</span>
                  <span className={styles.detail}>
                    {connectedOn ? `Connected on ${formatDate(connectedOn)}.` : 'Not connected.'}
                  </span>
                </div>
                <div className={styles.actions}>
                  {connectedOn && !canDisconnect(who, session.user.email) ? (
                    <p className={styles.detail}>
                      Your account’s email address is one Apple made for you (Hide My Email), so
                      Apple stays connected. It’s how you get in.
                    </p>
                  ) : connectedOn ? (
                    <form action={disconnectProviderAction.bind(null, who)}>
                      <SubmitButton variant="secondary" pendingLabel="Disconnecting…">
                        Disconnect {names[who]}
                      </SubmitButton>
                    </form>
                  ) : (
                    <form action={connectProviderAction.bind(null, who)}>
                      <ProviderButton provider={who} verb="Connect" />
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="passkeys-heading" className={styles.section}>
        <h2 id="passkeys-heading" className="type-heading">
          Passkeys
        </h2>
        <p>
          Sign in with Face ID, Touch ID, Windows Hello or a security key, with nothing to type. A
          passkey only works on Gaff’s own site, so nobody can trick you into using it elsewhere.
        </p>
        {overview.passkeys.length > 0 ? (
          <ul className={styles.rows}>
            {overview.passkeys.map((key) => (
              <li key={key.id} className={styles.row}>
                <div className={styles.what}>
                  <span className={styles.name}>{key.name}</span>
                  <span className={styles.detail}>
                    {key.addedOn ? `Added on ${formatDate(key.addedOn)}. ` : ''}
                    {key.kind === 'synced'
                      ? 'Kept in your password manager, so it’s on all your devices.'
                      : 'On one device only.'}
                  </span>
                </div>
                <Disclosure summary={`Rename “${key.name}”`}>
                  <form action={renamePasskeyAction.bind(null, key.id)} className={styles.rename}>
                    <TextField
                      name="name"
                      label="A name you’ll recognise"
                      defaultValue={key.name}
                      maxLength={60}
                      width="medium"
                    />
                    <div>
                      <SubmitButton variant="secondary" pendingLabel="Saving…">
                        Save the name
                      </SubmitButton>
                    </div>
                  </form>
                </Disclosure>
                <div className={styles.actions}>
                  <form action={removePasskeyAction.bind(null, key.id)}>
                    <SubmitButton variant="quiet" pendingLabel="Removing…">
                      Remove “{key.name}”
                    </SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        <AddPasskey />
      </section>

      <section aria-labelledby="devices-heading" className={styles.section}>
        <h2 id="devices-heading" className="type-heading">
          Signed-in devices
        </h2>
        <ul className={styles.rows}>
          {overview.devices.map((device) => (
            <li key={device.id} className={styles.row}>
              <div className={styles.what}>
                <span className={styles.name}>
                  {device.words}
                  {device.current ? <StatusPill tone="info">This device</StatusPill> : null}
                </span>
                <span className={styles.detail}>
                  Signed in{device.method ? ` with ${methodWords[device.method]}` : ''} on{' '}
                  {formatDateTime(device.signedInAt)}.
                  {device.current ? '' : ` Last used on ${formatDateTime(device.lastActive)}.`}
                </span>
              </div>
              {device.current ? null : (
                <div className={styles.actions}>
                  <form action={signOutDeviceAction.bind(null, device.id)}>
                    <SubmitButton variant="secondary" pendingLabel="Signing out…">
                      Sign out {device.words}
                    </SubmitButton>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
        {others.length > 1 ? (
          <form action={signOutOthersAction}>
            <SubmitButton variant="secondary" pendingLabel="Signing out…">
              Sign out everywhere else
            </SubmitButton>
          </form>
        ) : null}
        <p>
          Don’t recognise one? Sign it out, then change your password, or add one if you haven’t.
        </p>
      </section>
    </Stack>
  );
}
