import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_DATABASE_URL } from '../../playwright.config';
import { daftEnquiry, myhomeEnquiry } from '../fixtures/emails';
import {
  addDocumentThroughUi,
  aPayslipFile,
  applyThroughUi,
  bookFirstTime,
  enterLinkCode,
  sharePayslipThroughUi,
} from '../e2e/renter';
import {
  confirmItsYou,
  forwardingTestTo,
  gaffAddress,
  homeIdIn,
  isoDateInDays,
  latestCodeFor,
  linkInEmail,
  openAccountMenu,
  pickDate,
  sendTestEmail,
  signIn,
  startViewingsNow,
} from '../e2e/support';
import { homePhotos, someoneElse, startRun, storyOf } from './capture';

/**
 * The deck's second run: a letting agent's journey, from signing the agency up to the results
 * screen, with the owner's, the referee's and a colleague's screens, and the renter's screens
 * that only exist when a renter arrives by email from Daft or MyHome.
 */

const ANN = 'ann.power@halcyonlettings.example';
const AGENCY = 'Halcyon Lettings';
const ADDRESS = '12 Ranelagh Road';
const STAFF = 'founder@staff.gaff.test';
const BRIAN = 'brian.daly@halcyonlettings.example';
const TOM = 'tom.walsh@example.ie';
const AOIFE = 'aoife.byrne@example.ie';
const CIARAN = 'ciaran.os@example.ie';
const DARRAGH = 'darragh.nolan@example.ie';
const MARY = 'mary.kelly@example.ie';
const DECLAN = 'declan.murphy@brightwell.example';

/** Another person in a browser of their own, who gives up on a missing control in good time. */
async function person(browser: Browser) {
  const someone = await someoneElse(browser);
  someone.context.setDefaultTimeout(20_000);
  return someone;
}

/**
 * A long page photographed again after a small change repeats its top. This drops the first
 * window of these shots from the run's manifest, so the deck shows only where the change is.
 */
function withoutTheirFirstPart(titles: readonly string[]): void {
  const file = 'screenshots/deck/agency/manifest.json';
  const entries = JSON.parse(readFileSync(file, 'utf8')) as {
    title: string;
    desktop: string[];
    phone: string[];
  }[];
  for (const entry of entries) {
    if (!titles.includes(entry.title)) continue;
    if (entry.desktop.length > 1) entry.desktop.shift();
    if (entry.phone.length > 1) entry.phone.shift();
  }
  writeFileSync(file, `${JSON.stringify(entries, null, 2)}\n`);
}

const conversations = (page: Page) => page.getByRole('list', { name: 'Conversations' });

/** The link in the newest email to this address with this subject, once the job has sent it. */
async function emailed(to: string, subject: string): Promise<string> {
  let link = '';
  await expect(async () => {
    link = await linkInEmail(to, subject);
  }).toPass({ timeout: 40_000 });
  return link;
}

/**
 * A renter's questions before a viewing, one per screen: answers each by what it asks, and
 * sends them. `each` is called on every question, before it is answered.
 */
async function answerAll(
  page: Page,
  answers: { people: string; pets: 'Yes' | 'No' },
  each?: (question: string) => Promise<void>,
): Promise<void> {
  for (let asked = 0; asked < 8; asked++) {
    const send = page.getByRole('button', { name: /^(Next|Send my answers)$/ });
    const thanks = page.getByRole('heading', { name: /^Thanks/ });
    await expect(send.or(thanks).first()).toBeVisible();
    if (await thanks.isVisible()) return;
    const question = (await page.getByRole('heading', { level: 2 }).first().innerText()).trim();
    const options = await page
      .getByRole('radio')
      .evaluateAll((radios) =>
        radios.map((radio) => (radio as HTMLInputElement).labels?.[0]?.innerText.trim() ?? ''),
      );
    const pick = /people|live here/i.test(question)
      ? answers.people
      : /pets?/i.test(question)
        ? answers.pets
        : (options.find((option) => /^(Yes|A year)/.test(option)) ?? options[0]!);
    await page.getByRole('radio', { name: pick, exact: true }).check();
    await each?.(question);
    await send.click();
    // The next question, or the page that says the answers are in.
    await expect
      .poll(async () => {
        const heading = page.getByRole('heading', { level: 2 }).first();
        return (await heading.count()) > 0 ? (await heading.innerText()).trim() : '';
      })
      .not.toBe(question);
    await page.waitForLoadState('networkidle');
  }
}

/** Runs a statement as the system would, for the run's own set-up. */
async function asSystem<T extends pg.QueryResultRow>(sql: string, params: unknown[]): Promise<T[]> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.rls_bypass', 'on', true)");
    const { rows } = await client.query<T>(sql, params);
    await client.query('commit');
    return rows;
  } finally {
    await client.end();
  }
}

const inWords = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** A made-up advert, as an agency would paste it: no BER, and two lines about who should apply. */
const advert = [
  `${ADDRESS}, Ranelagh, Dublin 6, D06 K7W2`,
  'Bright two-bed apartment on the first floor, five minutes from the Luas.',
  'Rent: €1,850 per month',
  `Available from ${inWords(isoDateInDays(30))}`,
  '2 bedrooms, 1 bathroom. Furnished.',
  'Gas fired central heating.',
  'Would suit a professional couple. No HAP.',
  'Minimum 12 month lease. No pets.',
  'Contact Ann Power on 01 234 5678 or ann.power@halcyonlettings.example',
].join('\n');

// Dates in the browser's own controls read as they do in Ireland.
test.use({
  launchOptions: {
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter((entry): entry is [string, string] => !!entry[1]),
      ),
      LANG: 'en_GB.UTF-8',
      LC_ALL: 'en_GB.UTF-8',
      LANGUAGE: 'en_GB',
    },
  },
});

test('The deck: an agent lets a home, from signing the agency up to the results screen', async ({
  browser,
  page,
}) => {
  startRun('agency');
  page.context().setDefaultTimeout(20_000);
  const ann = storyOf('agent');
  const next = () => page.getByRole('button', { name: 'Next', exact: true }).click();

  // ───────────────────────────── Signing up the agency
  ann.stage('Signing up the agency');
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'List a home' })).toBeVisible();
  await ann.shot(
    page,
    'The public site',
    'Ann works at Halcyon Lettings. She starts where everyone does, on Gaff’s public site, and presses “List a home”.',
    { parts: 1 },
  );
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: 'Sign in or sign up' })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill(ANN);
  await ann.shot(
    page,
    'Sign in or sign up',
    'One screen for both. Ann gives her work email; Google and Apple are there too. There are no passwords.',
  );
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
  await ann.shot(
    page,
    'Enter your code',
    'Gaff emails a six-digit code. The boxes send themselves once the last digit is in.',
  );
  await page.getByLabel('Six-digit code').fill(await latestCodeFor(ANN));
  await page.waitForURL(/\/welcome/);
  await expect(page.getByLabel('First and last name')).toBeVisible();
  await page.getByLabel('First and last name').fill('Ann Power');
  await ann.shot(
    page,
    'Let’s get you started. What’s your name?',
    'First run asks one question per screen, four at most. The first is her name.',
  );
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: /What brings you to Gaff\?$/ })).toBeVisible();
  await page.getByRole('radio', { name: 'I work at a letting agency', exact: true }).check();
  await ann.shot(
    page,
    'What brings you to Gaff?',
    'The one question that sets her path. Ann says she works at a letting agency.',
  );
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Which agency?' })).toBeVisible();
  await page.getByLabel('Agency name').pressSequentially('Halc', { delay: 30 });
  const mine = page.getByRole('link', { name: /Halcyon Lettings/ }).first();
  await expect(mine).toBeVisible();
  await ann.shot(
    page,
    'Which agency?',
    'Ann types the first letters and Gaff finds the agency on its copy of the PSRA register. Nobody types a licence number.',
  );
  await page.getByRole('link', { name: 'Enter the licence number instead' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'What’s your agency’s PSRA licence number?' }),
  ).toBeVisible();
  await ann.shot(
    page,
    'What’s your agency’s PSRA licence number?',
    'The other way in, for an agency the name search doesn’t find: its licence number.',
  );
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Which agency?' })).toBeVisible();
  await page.getByLabel('Agency name').fill('');
  await page.getByLabel('Agency name').pressSequentially('Halc', { delay: 30 });
  await mine.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Is this your agency?' })).toBeVisible();
  await ann.shot(
    page,
    'Is this your agency?',
    'The register’s own entry, to check. Ann presses “Yes, that’s us” and the agency is set up.',
  );
  await page.getByRole('button', { name: 'Yes, that’s us' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await ann.shot(
    page,
    'Today, on the first visit',
    'Today is home. With nothing to do yet, it shows the set-up checklist and its one next step: add the first letting.',
  );

  // ───────────────────────────── Adding the letting
  ann.stage('Adding the letting');
  await page.goto('/lettings/new');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Tell Gaff about the home' }),
  ).toBeVisible();
  await page.getByLabel('Paste your advert, or describe the home in your own words.').fill(advert);
  await ann.shot(
    page,
    'Tell Gaff about the home',
    'Ann pastes the advert she already wrote. Gaff reads the words; it never opens a link or fetches from a portal.',
  );
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Here’s what Gaff found' }),
  ).toBeVisible();
  const lettingId = homeIdIn(page.url());
  const lettingUrl = `/lettings/${lettingId}`;
  await ann.shot(
    page,
    'Here’s what Gaff found',
    'The advert, read by AI into the home’s facts, with nothing guessed. Three things are marked to check, and the lines about who should apply were left out.',
  );
  await page.getByRole('main').getByRole('button', { name: 'Why?' }).click();
  const why = page.getByRole('dialog', { name: 'What Gaff left out' });
  await expect(why).toBeVisible();
  await ann.shot(
    page,
    'What Gaff left out',
    '“Why?” shows each line Gaff left out and the reason: an advert can’t say who a home suits, or refuse housing assistance.',
  );
  await why.getByRole('button', { name: 'Done' }).click();
  await expect(why).toBeHidden();
  await page.getByRole('link', { name: /^The home/ }).click();
  const home = page.getByRole('dialog').last();
  await expect(home.getByLabel('BER rating')).toBeVisible();
  await home.getByLabel('BER rating').selectOption('C1');
  await ann.shot(
    page,
    'The home, to check',
    'Tapping a part opens it, with the advert’s own words above its fields. The advert gave no BER, so Ann adds it further down.',
  );
  await home.getByRole('button', { name: 'Save' }).click();
  await expect(home).toBeHidden();
  await page.getByRole('link', { name: /^Letting details/ }).click();
  const details = page.getByRole('dialog').last();
  await expect(details.getByRole('checkbox', { name: 'No pets' })).toBeVisible();
  await details.getByRole('checkbox', { name: 'No pets' }).check();
  await details.getByRole('checkbox', { name: 'Length of stay' }).check();
  await ann.shot(
    page,
    'Letting details, to check',
    'The advert mentioned a 12-month lease and no pets. Ann switches them on herself: letting details come only from Gaff’s fixed list.',
  );
  await details.getByRole('button', { name: 'Save' }).click();
  await expect(details).toBeHidden();
  await page.getByRole('button', { name: 'Looks right' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Photos' })).toBeVisible();
  await page.getByLabel('Choose photos').setInputFiles(await homePhotos());
  await expect(page.getByRole('list', { name: 'Photos' }).getByRole('img')).toHaveCount(4, {
    timeout: 60_000,
  });
  await ann.shot(
    page,
    'Photos',
    'Ann uploads the photos. Gaff keeps its own copies, turned upright and with location details stripped.',
  );
  await next();
  await expect(page.getByRole('heading', { name: 'Letting details' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Most people' }).check();
  await page.getByLabel('Most people who can live there').selectOption('3');
  await ann.shot(
    page,
    'Letting details',
    'What renters are asked about, from the fixed list only: move-in date, length of stay, how many people, pets. There are no free-text criteria.',
  );
  await next();
  await expect(page.getByRole('heading', { name: 'Has this home been let before?' })).toBeVisible();
  await page.getByLabel('No, this is its first letting').check();
  await ann.shot(
    page,
    'Has this home been let before?',
    'The rent check, one question per screen. Gaff works out whether a rent pressure zone caps the rent.',
  );
  await next();
  await expect(
    page.getByRole('heading', { name: 'You can set the rent at market level' }),
  ).toBeVisible();
  await ann.shot(
    page,
    'You can set the rent at market level',
    'The result, in a sentence. A first letting isn’t capped, so €1,850 a month stands.',
  );
  await next();
  await expect(page.getByRole('heading', { name: 'Ready to go live' })).toBeVisible();

  // Viewing times, before the home goes live.
  await page.goto(`${lettingUrl}/viewings`);
  await page.getByRole('button', { name: 'Add a time' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add a time' });
  await expect(sheet).toBeVisible();
  await pickDate(page, 'Day', isoDateInDays(7), sheet);
  await ann.shot(
    page,
    'Add a time',
    'Viewing times live on a calendar. Ann picks a day; 6pm to 7pm, one renter at a time, 15 minutes each, is filled in for her.',
  );
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'Viewing time added' })).toBeVisible();
  await ann.shot(
    page,
    'Viewing times',
    'The home’s own calendar, with the evening of viewings on it. Renters she invites will book a slot themselves.',
  );

  // ───────────────────────────── Going live
  ann.stage('Going live');
  await page.goto(`${lettingUrl}/setup/go-live`);
  await expect(page.getByRole('heading', { name: 'Ready to go live' })).toBeVisible();
  await ann.shot(
    page,
    'Ready to go live',
    'The home as renters will see it, to check one last time. One button starts taking enquiries.',
  );
  await page.getByRole('button', { name: 'Start taking enquiries' }).click();
  await expect(page.getByText(/We’re confirming Halcyon Lettings\./).first()).toBeVisible();
  await ann.shot(
    page,
    'Halcyon Lettings is being confirmed',
    'Ann has decided to go live. Because the agency is new to Gaff, the home waits while someone on Gaff’s team checks she works there. Everything else already works.',
  );

  const staff = await person(browser);
  await staff.page.setViewportSize({ width: 1280, height: 800 });
  await signIn(staff.page, STAFF);
  await staff.page.goto('/internal/agencies');
  await expect(staff.page.getByRole('heading', { level: 1, name: 'Agencies' })).toBeVisible();
  await ann.shot(
    staff.page,
    'Agencies waiting to be confirmed',
    'Gaff’s own team see the agency, its entry on the PSRA register and who signed it up. They confirm agencies; they never open a letting or read about a renter.',
    { actor: 'gaff' },
  );
  await staff.page
    .getByRole('region', { name: AGENCY })
    .getByRole('button', { name: `Confirm ${AGENCY}` })
    .click();
  await expect(staff.page.getByText(/^Confirmed\./)).toBeVisible();
  await staff.context.close();
  await ann.email(
    browser,
    { to: ANN, subject: `${AGENCY} is confirmed on Gaff` },
    'Halcyon Lettings is confirmed on Gaff',
    'Ann is emailed as soon as the agency is confirmed. The home goes live on the decision she already made.',
  );
  await page.goto(`${lettingUrl}/setup/advertised`);
  await expect(page.getByRole('heading', { name: / is live$/ })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Daft', exact: true }).check();
  await page.getByRole('checkbox', { name: 'MyHome', exact: true }).check();
  await ann.shot(
    page,
    '12 Ranelagh Road is live',
    'The home has a page on Gaff and the AI assistant is answering. Ann says it’s also on Daft and MyHome, so Gaff can pick up those enquiries too.',
  );
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  // ───────────────────────────── Forwarding enquiries
  ann.stage('Forwarding enquiries');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Where do your Daft enquiries arrive?' }),
  ).toBeVisible();
  await page.getByRole('radio', { name: 'Gmail' }).check();
  await ann.shot(
    page,
    'Where do your Daft enquiries arrive?',
    'Daft and MyHome email each enquiry to the agency. Ann says which mail service that inbox is, and Gaff gives the steps for it.',
  );
  await next();
  await expect(page.getByRole('heading', { level: 1, name: 'Forward them to Gaff' })).toBeVisible();
  await ann.shot(
    page,
    'Forward them to Gaff',
    'The agency’s own Gaff address to copy, and three steps in Gmail. Gaff never signs in to her mail or to a portal: it only reads what she forwards.',
  );
  await page.getByRole('link', { name: 'I’ve done that' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Waiting for Gmail’s confirmation' }),
  ).toBeVisible();
  await ann.shot(
    page,
    'Waiting for Gmail’s confirmation',
    'Gmail sends a confirmation to the Gaff address. Gaff waits for it, and says what to do if it doesn’t come.',
  );
  const mail = await page.context().newPage();
  const gaffTo = await gaffAddress(mail);
  await sendTestEmail(mail, {
    to: gaffTo,
    from: 'Gmail Team <forwarding-noreply@google.com>',
    subject: `(#123456789) Gmail Forwarding Confirmation - Receive Mail from ${ANN}`,
    text: `${ANN} has requested to automatically forward mail to your email address.\nConfirmation code: 123456789`,
  });
  await expect(page.getByRole('heading', { name: 'Gmail’s confirmation code' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByLabel('Your email address').fill(ANN);
  await ann.shot(
    page,
    'Confirm it in your email',
    'Gmail’s code appears here on its own, ready to copy into Gmail, with the filter that forwards only enquiries. No trip to the inbox.',
  );
  await page.getByRole('button', { name: 'Send a test enquiry' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Your test enquiry is on its way' }),
  ).toBeVisible();
  await ann.shot(
    page,
    'Your test enquiry is on its way',
    'Gaff emails a made-up enquiry to Ann’s inbox. If her rule works, it comes straight back.',
  );
  const sent = await forwardingTestTo(ANN);
  await sendTestEmail(mail, { to: gaffTo, ...sent });
  await expect(page.getByRole('heading', { level: 1, name: 'It works' })).toBeVisible({
    timeout: 30_000,
  });
  await ann.shot(
    page,
    'It works',
    'The test came back through her rule, and Gaff shows the answer a renter would have got. Forwarding is set up for good.',
  );
  await page.getByRole('link', { name: 'Done', exact: true }).click();
  await expect(page.getByText('Gaff is now answering enquiries for this home.')).toBeVisible();

  ann.stage('The home, live');
  await ann.shot(
    page,
    'The letting’s page, live',
    'Every letting has one page with three blocks: what needs Ann, what’s happening, and what’s next. Right now nothing needs her.',
  );
  await page.goto(`${lettingUrl}/test-enquiry`);
  await expect(page.getByRole('heading', { level: 1, name: 'Send a test enquiry' })).toBeVisible();
  await ann.shot(
    page,
    'Send a test enquiry',
    'Ann can watch the assistant work before a real renter writes: one button sends a made-up enquiry.',
  );
  await page.getByRole('button', { name: 'Send a test enquiry' }).click();
  await expect(page.getByRole('heading', { name: 'Here’s what a renter gets' })).toBeVisible();
  await ann.shot(
    page,
    'Here’s what a renter gets',
    'The first reply, exactly as a renter receives it. It says straight away that it’s from an AI assistant.',
  );
  await page.getByRole('link', { name: 'Done', exact: true }).click();
  await page.goto(`${lettingUrl}?view=home`);
  await ann.shot(
    page,
    'The letting’s Home view',
    'Everything about the home in one place: its facts, photos, letting details and viewing times, each with a “Change”.',
  );
  await page.getByRole('link', { name: /^Place the pin/ }).click();
  await expect(page.getByRole('heading', { name: 'Where is it on the map?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'The home’s pin' })).toBeVisible();
  await ann.shot(
    page,
    'Where is it on the map?',
    'The advert gave an address but no pin. Ann places it, so the home shows on the search map as well as in the list.',
  );
  await page.getByRole('button', { name: 'Save the pin' }).click();
  await page.waitForURL(/view=home/);
  await page
    .getByRole('link', { name: /^Change\s+description/ })
    .first()
    .click();
  await expect(page.getByLabel('About this home')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Draft (a|a new) description$/ })).toBeVisible();
  await ann.shot(
    page,
    'About this home',
    'The description, in the advert’s own words. “Draft a description” has Gaff write one from the home’s facts alone, marked “Drafted by AI” until Ann changes it. Either way it’s checked, so it never says who a home suits.',
  );
  const [{ ref } = { ref: '' }] = await asSystem<{ ref: string }>(
    'select public_ref as ref from lettings where id = $1',
    [lettingId],
  );
  await page.goto(`/homes/${ref}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await ann.shot(
    page,
    'The home’s page on Gaff',
    'What renters find in search: photos, facts, the letting details and “Ask to view”. The agency’s name and PSRA licence are on it.',
  );

  // ───────────────────────────── Inviting the team
  ann.stage('Inviting the team');
  await page.goto('/today');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await ann.shot(
    page,
    'Today, with the home live',
    'The checklist has one step left: invite the team.',
  );
  await page
    .getByRole('region', { name: 'Get set up' })
    .getByRole('link', { name: 'Invite your team' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Invite your team' })).toBeVisible();
  await page.getByLabel('Email addresses').fill(BRIAN);
  await page.getByRole('radio', { name: 'Agent' }).check();
  await ann.shot(
    page,
    'Invite your team',
    'Ann invites a colleague by email and chooses his role: Agent or Admin. “It’s just me” skips this.',
  );
  await page.getByRole('button', { name: 'Send invites' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Invite sent' })).toBeVisible();
  await ann.shot(
    page,
    'Invite sent',
    'Brian gets an email with one button. The invite works once.',
  );
  await ann.email(
    browser,
    { to: BRIAN, subject: `Ann Power invited you to join ${AGENCY} on Gaff` },
    'The invitation email',
    'What Brian receives: who invited him, to which agency, and one button to join.',
    { actor: 'teammate' },
  );
  const brian = await person(browser);
  const joinLink = await linkInEmail(BRIAN, `Ann Power invited you to join ${AGENCY} on Gaff`);
  await brian.page.goto(new URL(joinLink).pathname);
  await expect(brian.page.getByRole('heading', { level: 1, name: `Join ${AGENCY}` })).toBeVisible();
  await ann.shot(
    brian.page,
    'Join Halcyon Lettings',
    'Brian opens the link. Sign-in is titled with the agency’s name and has his address filled in.',
    { actor: 'teammate' },
  );
  await brian.page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(brian.page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
  await brian.page.getByLabel('Six-digit code').fill(await latestCodeFor(BRIAN));
  await expect(brian.page).toHaveURL(/\/today$/);
  await asSystem('update users set name = $1 where email = $2', ['Brian Daly', BRIAN]);
  await brian.page.reload();
  await expect(brian.page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await ann.shot(
    brian.page,
    'Brian’s Today',
    'No questions: he lands straight in the agency, and sees every letting it has.',
    { actor: 'teammate' },
  );
  await brian.page.goto(lettingUrl);
  await expect(brian.page.getByRole('button', { name: 'Help with this letting' })).toBeVisible();
  await ann.shot(
    brian.page,
    'A colleague’s letting',
    'Brian can read everything about a letting Ann leads. To act on it he chooses “Help with this letting”, and the record shows who did what.',
    { actor: 'teammate' },
  );
  await brian.context.close();
  await page.goto('/settings/team');
  await expect(page.getByRole('heading', { level: 1, name: 'Team' })).toBeVisible();
  await ann.shot(
    page,
    'Team',
    'Everyone at the agency, their role, and anyone invited who hasn’t joined yet.',
  );
  await page.getByRole('link', { name: /^Brian Daly/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Brian Daly' })).toBeVisible();
  await ann.shot(
    page,
    'A member’s page',
    'An admin can change a colleague’s role here, or remove them.',
  );
  await page.getByRole('link', { name: `Remove from ${AGENCY}` }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: `Remove Brian Daly from ${AGENCY}?` }),
  ).toBeVisible();
  await ann.shot(
    page,
    'Remove Brian Daly from Halcyon Lettings?',
    'Removing someone hands their lettings to a new lead and ends their access at once. Ann doesn’t go through with it.',
  );

  // ───────────────────────────── Enquiries from Daft and MyHome
  ann.stage('Enquiries from Daft and MyHome');
  // Gmail's confirmation did its job in the forwarding flow: it isn't an enquiry.
  await page.goto('/inbox');
  await conversations(page)
    .getByRole('listitem')
    .filter({ hasText: 'Gmail Team' })
    .getByRole('link')
    .click();
  await page.getByRole('main').getByRole('button', { name: 'It’s not an enquiry' }).click();

  await sendTestEmail(mail, { to: gaffTo, ...daftEnquiry });
  await sendTestEmail(mail, { to: gaffTo, ...myhomeEnquiry, replyTo: '' });
  await sendTestEmail(mail, {
    to: gaffTo,
    from: 'Daft.ie <noreply@daft.ie>',
    replyTo: `Darragh Nolan <${DARRAGH}>`,
    subject: 'New enquiry about your ad',
    text: [
      'You have a new enquiry about your ad.',
      '',
      'Name: Darragh Nolan',
      `Email: ${DARRAGH}`,
      'Phone: 086 555 0142',
      '',
      'Message:',
      'Hi, we’re four friends looking for a place from January. We’d love to view it.',
      'Thanks, Darragh',
    ].join('\n'),
  });
  const rows = conversations(page).getByRole('listitem');
  await expect(async () => {
    await page.goto('/inbox');
    await expect(rows).toHaveCount(3, { timeout: 1000 });
  }).toPass({ timeout: 40_000 });
  await page.goto('/today');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await ann.shot(
    page,
    'Today, with enquiries in',
    'Three enquiries arrived overnight from Daft and MyHome. Gaff replied to each within minutes; Today lists only what needs Ann.',
  );
  await ann.email(
    browser,
    { to: AOIFE, subject: `Your enquiry about ${ADDRESS}` },
    'The first reply a renter gets',
    'Sent by Gaff within minutes, in fixed wording. It says it’s from an AI assistant, and gives a private link to a few quick questions.',
    { actor: 'renter' },
  );
  await page.goto('/inbox');
  await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible();
  await ann.shot(
    page,
    'Inbox',
    'Every conversation in one place, under two chips: “Needs you” and “All”. Each row says who wrote and what’s waiting.',
  );
  await rows.filter({ hasText: 'Daft.ie' }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 2, name: 'Daft.ie' })).toBeVisible();
  const which = page.getByRole('group', { name: 'Which home is this about?' });
  await which.getByLabel(ADDRESS).check();
  await ann.shot(
    page,
    'Which home is this about?',
    'One enquiry didn’t name the home, so Gaff asks rather than guesses. Ann picks 12 Ranelagh Road and Gaff answers it.',
  );
  await page.getByRole('main').getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Darragh Nolan' })).toBeVisible();

  await page.goto('/inbox');
  await rows.filter({ hasText: 'Aoife' }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 2, name: 'Aoife Byrne' })).toBeVisible();
  const reply = page.getByRole('region', { name: 'Reply to Aoife' });
  await expect(reply.getByText('Drafted by AI')).toBeVisible();
  await ann.shot(
    page,
    'A conversation, with a draft waiting',
    'Aoife asked two things. Gaff drafted an answer to the one the home’s facts cover, marked “Drafted by AI”, and says plainly what it doesn’t know. Ann can send, edit or not send.',
  );
  await reply.getByRole('button', { name: 'Edit' }).click();
  await expect(reply.getByLabel('The draft')).toBeVisible();
  await ann.shot(
    page,
    'Editing the draft',
    '“Edit” opens the draft’s words. Nothing goes to a renter that Ann hasn’t seen.',
  );
  await reply.getByRole('button', { name: 'Stop editing' }).click();
  const unknown = reply.getByLabel(/^Gaff doesn’t know: /);
  await unknown.fill(
    'There’s on-street permit parking on Ranelagh Road, and a bike store in the building.',
  );
  await ann.shot(
    page,
    'Answering what Gaff doesn’t know',
    'Ann answers the parking question herself. “Remember this for 12 Ranelagh Road” is ticked, so Gaff can answer the next renter who asks.',
  );
  await reply.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('status').getByText('Sent')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Write to Aoife' })).toBeVisible();
  await ann.shot(
    page,
    'The conversation, answered',
    'One thread per renter: her enquiry, Gaff’s replies and Ann’s own. Ann can write to Aoife herself at any time.',
  );
  // Ciarán's and Darragh's drafts, sent as they are.
  await page.goto('/inbox?show=all');
  await rows.filter({ hasText: 'Ciarán' }).getByRole('link').click();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Ciarán Ó Súilleabháin' }),
  ).toBeVisible();
  const toCiaran = page.getByRole('region', { name: 'Reply to Ciarán' });
  await expect(toCiaran.getByText('Drafted by AI')).toBeVisible();
  await toCiaran.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('status').getByText('Sent')).toBeVisible();
  await page.goto('/inbox?show=all');
  await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible();
  await ann.shot(
    page,
    'Inbox, with nothing waiting',
    'Under “All”, every conversation stays to hand, with the last thing said.',
  );

  // The renters answer the questions on their own pages.
  const tell = storyOf('renter');
  tell.stage('Arriving from Daft or MyHome');
  tell.meanwhile(
    'Aoife saw 12 Ranelagh Road on Daft and enquired there. Halcyon Lettings forwards its Daft enquiries to Gaff.',
  );
  await tell.email(
    browser,
    { to: AOIFE, subject: `Your enquiry about ${ADDRESS}` },
    'The first reply',
    'Minutes after enquiring on Daft, Aoife gets this. It says straight away that it’s from an AI assistant, and that a person makes every decision.',
  );
  const aoife = await person(browser);
  const aoifeLink = await linkInEmail(AOIFE, `Your enquiry about ${ADDRESS}`);
  await aoife.page.goto(aoifeLink);
  let firstQuestion = true;
  await answerAll(aoife.page, { people: '2', pets: 'No' }, async (question) => {
    await tell.shot(
      aoife.page,
      question,
      firstQuestion
        ? 'The link opens Aoife’s own page for the home, with no account and no password. It asks a few quick questions, one per screen, each from the letting details the agent set.'
        : 'Only self-declared answers at this stage: nothing about work, income or ID.',
    );
    firstQuestion = false;
  });
  await tell.shot(
    aoife.page,
    'Thanks, your answers are in',
    'Her answers sit beside the letting details, with what happens next and when. From here her journey is the same as for a renter who found the home on Gaff.',
  );
  const ciaran = await person(browser);
  const ciaranLink = await linkInEmail(CIARAN, `Your enquiry about ${ADDRESS}`);
  await ciaran.page.goto(ciaranLink);
  await answerAll(ciaran.page, { people: '1', pets: 'No' });
  const darragh = await person(browser);
  await darragh.page.goto(await linkInEmail(DARRAGH, `Your enquiry about ${ADDRESS}`));
  await answerAll(darragh.page, { people: '4', pets: 'Yes' });
  await darragh.context.close();

  // Back with Ann: who has enquired.
  await page.goto(lettingUrl);
  await ann.shot(
    page,
    'The letting, with enquiries in',
    'What’s happening, in figures: how many enquired, answered, and meet everything asked. The one thing that needs Ann is choosing who views.',
  );
  await page.goto(`${lettingUrl}?view=people`);
  const people = page.getByRole('region', { name: 'Everyone who enquired' });
  await expect(people.getByRole('link', { name: 'Aoife Byrne' })).toBeVisible();
  await ann.shot(
    page,
    'People',
    'Everyone who enquired, with where they came from and “Meets 3 of 3”: who meets what was asked. Gaff never scores or recommends a person.',
  );
  await people.getByRole('link', { name: 'Darragh Nolan' }).click();
  await expect(page.getByRole('dialog', { name: 'Darragh Nolan' })).toBeVisible();
  await ann.shot(
    page,
    'A person’s sheet',
    'What Darragh told Gaff, set against what was asked, and a way into the conversation. Before anyone applies there is nothing here about money or identity.',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Darragh Nolan' })).toBeHidden();
  await page.getByLabel('Ask about who’s enquired').fill('Who has no pets?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByText(/^Showing \d of \d\./)).toBeVisible();
  await ann.shot(
    page,
    'Ask about who’s enquired',
    'Ann asks in her own words and Gaff turns it into filters on the answers. It sorts only by what everyone was asked.',
  );
  await page.getByLabel('Ask about who’s enquired').fill('Who would be the best tenant?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Gaff can sort people only' }),
  ).toBeVisible();
  await ann.shot(
    page,
    'A question Gaff won’t answer',
    'Asked who the best tenant is, Gaff declines in fixed words. It never recommends a person: that decision is Ann’s.',
  );

  // ───────────────────────────── Choosing who views
  ann.stage('Choosing who views');
  await page.goto(`${lettingUrl}/who-views`);
  const tick = (name: string) => page.getByRole('checkbox', { name, exact: true });
  await expect(tick('Aoife Byrne')).toBeVisible();
  await tick('Aoife Byrne').check();
  await tick('Ciarán Ó Súilleabháin').check();
  await tick('Darragh Nolan').uncheck();
  await ann.shot(
    page,
    'Choose who views',
    'The first of the three decisions people make. Everyone is listed in the order they enquired, with what they meet; Ann ticks who to invite.',
  );
  await next();
  await expect(page.getByRole('heading', { name: 'Check and send' })).toBeVisible();
  await ann.shot(
    page,
    'Check and send',
    'Who’s invited, and the message they’ll get, to check before it goes. The wording is fixed.',
  );
  await page.getByRole('button', { name: 'Send invitations' }).click();
  await expect(page.getByRole('heading', { name: 'Invitations sent' })).toBeVisible();
  await ann.shot(
    page,
    'Invitations sent',
    'Aoife and Ciarán can now book a viewing time themselves. Gaff sends the reminders.',
  );

  // They book.
  const mobiles: Record<string, string> = { [AOIFE]: '087 123 4567', [CIARAN]: '086 765 4321' };
  for (const [who, email] of [
    [aoife, AOIFE],
    [ciaran, CIARAN],
  ] as const) {
    await who.page.goto(await emailed(email, `Book a viewing: ${ADDRESS}`));
    await bookFirstTime(who.page, mobiles[email]);
  }

  // ───────────────────────────── The owner follows along
  ann.stage('The owner follows along');
  await page.goto(lettingUrl);
  await page.getByRole('button', { name: `More for ${ADDRESS}` }).click();
  await expect(page.getByRole('menu', { name: `More for ${ADDRESS}` })).toBeVisible();
  await ann.shot(
    page,
    'The letting’s menu',
    'The rarer things live in the letting’s menu: sharing with the owner, the history, changing who leads it, closing it.',
  );
  await page.getByRole('menuitem', { name: 'Share with the owner' }).click();
  await expect(page.getByRole('heading', { name: 'Share with the owner' })).toBeVisible();
  await page.getByLabel('Owner’s name').fill('Tom Walsh');
  await page.getByLabel('Owner’s email').fill(TOM);
  await ann.shot(
    page,
    'Share with the owner',
    'Halcyon lets this home for its owner, Tom Walsh. Ann gives his name and email once, and Gaff sends him a private link to follow the letting.',
  );
  await page.getByRole('button', { name: 'Send the link' }).click();
  await expect(page.getByRole('heading', { name: 'Sent to Tom' })).toBeVisible();
  await ann.shot(
    page,
    'Sent to Tom',
    'The link goes to Tom by email. Ann never sees it, and can stop sharing at any time.',
  );
  await ann.email(
    browser,
    { to: TOM, subject: `${ADDRESS}: follow the letting` },
    'The owner’s email',
    'Tom gets one email with one button. He needs no account.',
    { actor: 'owner' },
  );

  // The owner looks in.
  const tom = await person(browser);
  await tom.page.goto(await emailed(TOM, `${ADDRESS}: follow the letting`));
  await expect(tom.page.getByText(ADDRESS).first()).toBeVisible();
  await ann.shot(
    tom.page,
    'The owner’s page',
    'Tom’s one screen: where the letting stands in a sentence, what’s been decided and by whom, and how to reach the agent. No renter’s name or details appear before he’s asked to approve.',
    { actor: 'owner' },
  );
  await tom.page.getByText('See everything that’s happened').click();
  await expect(tom.page.getByText(/Applicant 1/).first()).toBeVisible();
  await ann.shot(
    tom.page,
    'Everything that’s happened',
    'The whole record is one tap away, with renters only as “Applicant 1” and “Applicant 2”.',
    { actor: 'owner' },
  );

  // ───────────────────────────── Viewing day
  ann.stage('Viewing day');
  await page.goto(`/calendar?day=${isoDateInDays(7)}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Calendar' })).toBeVisible();
  const onCalendar = page
    .getByRole('link', { name: /^6pm to 7pm · 12 Ranelagh Road/ })
    .locator('visible=true');
  await expect(onCalendar).toBeVisible();
  await ann.shot(
    page,
    'Calendar',
    'Every home’s viewings on one calendar: a week on a desktop, a day list on a phone. Both renters have booked their own slots.',
  );
  await onCalendar.click();
  const viewing = page.getByRole('dialog', { name: /^\w+day \d+ \w+, 6pm to 7pm$/ });
  await expect(viewing).toBeVisible();
  await ann.shot(
    page,
    'A viewing, opened',
    'Tapping a time shows who’s booked and when, the places left and the waiting list. Changing or cancelling it is in its menu.',
  );
  await viewing.getByRole('button', { name: 'Close' }).click();
  await startViewingsNow(ADDRESS, ANN);
  await page.goto('/today');
  await expect(
    page.getByRole('region', { name: 'Needs you' }).getByRole('link', { name: /^Mark who came/ }),
  ).toBeVisible();
  await ann.shot(
    page,
    'Today, on the day of the viewings',
    'On the day, Today shows the viewings and offers “Mark who came” from 15 minutes before the first.',
  );
  await page
    .getByRole('region', { name: 'Needs you' })
    .getByRole('link', { name: /^Mark who came/ })
    .click();
  await page.goto(`${lettingUrl}/attendance`);
  await expect(page.getByRole('heading', { level: 1, name: 'Mark who came' })).toBeVisible();
  await ann.shot(
    page,
    'Mark who came',
    'A focused screen for the doorstep, with no navigation: who’s booked, and how many are left to mark.',
  );
  for (const name of ['Aoife Byrne', 'Ciarán Ó Súilleabháin']) {
    const group = page.getByRole('group', { name: `Did ${name} come?` });
    await group.getByRole('button', { name: 'Came' }).click();
    await expect(group.getByRole('button', { name: 'Came' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }
  await expect(page.getByText('Everyone is marked.')).toBeVisible();
  await ann.shot(
    page,
    'Everyone is marked',
    'Two taps. Everyone who came is invited to apply, and Gaff asks only now about work and income.',
  );

  // They apply.
  for (const [who, income] of [
    [aoife, '5,200'],
    [ciaran, '4,800'],
  ] as const) {
    await who.page.reload();
    await applyThroughUi(who.page, { earning: 'From a job', income });
  }

  // ───────────────────────────── Choosing an applicant
  ann.stage('Choosing an applicant');
  await page.goto(lettingUrl);
  await ann.shot(
    page,
    'The letting, with applications in',
    'Both renters came and applied. The letting’s one task is now the second decision: choose an applicant.',
  );
  await page.goto(`${lettingUrl}/choose`);
  await page.getByRole('radio', { name: 'Choose Aoife Byrne' }).check();
  await ann.shot(
    page,
    'Choose an applicant',
    'The applicants side by side: what they meet, and income as a multiple of the rent. Gaff ranks nobody above anybody; Ann chooses Aoife.',
  );
  await next();
  await page.getByRole('radio', { name: 'Ciarán Ó Súilleabháin', exact: true }).check();
  await ann.shot(
    page,
    'And a backup?',
    'One backup, or none. Only the chosen applicant and one backup are ever asked for ID, documents and references.',
  );
  await next();
  await expect(page.getByRole('heading', { name: 'Check and confirm' })).toBeVisible();
  await ann.shot(
    page,
    'Check and confirm',
    'Her choice and her backup, to confirm. The decision is recorded as Ann’s, with the date.',
  );
  await page.getByRole('button', { name: 'Start the checks' }).click();
  await expect(page.getByRole('heading', { name: 'Checks started' })).toBeVisible();
  await ann.shot(
    page,
    'Checks started',
    'Gaff emails Aoife and Ciarán a few checks to do on their phones. Ann waits; nothing more is asked of her.',
  );

  // ───────────────────────────── Checks and references
  ann.stage('Checks and references');
  await page.goto(`${lettingUrl}/checks`);
  await ann.shot(
    page,
    'Checks, under way',
    'One screen for both people’s checks: ID, references, work and income. Each line fills in as it comes back.',
  );

  // Aoife's checks: she has rented before, and names a landlord and an employer.
  tell.stage('Naming your references');
  tell.meanwhile('Aoife viewed the home and applied, and Halcyon Lettings chose her.');
  await aoife.page.goto(await emailed(AOIFE, `${ADDRESS}: a few checks before an offer`));
  await enterLinkCode(aoife.page, AOIFE, 'Start');
  await aoife.page.getByRole('button', { name: 'Check my ID' }).click();
  await expect(aoife.page.getByRole('heading', { name: 'Stand-in ID check' })).toBeVisible();
  await aoife.page.getByRole('button', { name: 'The ID and selfie match' }).click();
  await expect(
    aoife.page.getByRole('heading', { name: 'Keep this, so you never have to do it again?' }),
  ).toBeVisible();
  await aoife.page.getByRole('link', { name: 'Not now' }).click();
  await expect(aoife.page.getByRole('heading', { name: 'Have you rented before?' })).toBeVisible();
  await aoife.page.getByRole('radio', { name: 'Yes', exact: true }).check();
  await tell.shot(
    aoife.page,
    'Have you rented before?',
    'After her ID check, references. The opt-out is the first question; Aoife has rented before, so she says yes.',
  );
  await aoife.page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    aoife.page.getByRole('heading', { name: 'Who was your last landlord?' }),
  ).toBeVisible();
  await aoife.page.getByLabel('Their name').fill('Mary Kelly');
  await aoife.page.getByLabel('Their email').fill(MARY);
  await tell.shot(
    aoife.page,
    'Who was your last landlord?',
    'A name and an email, nothing else. Gaff will send them a short form.',
  );
  await aoife.page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    aoife.page.getByRole('heading', { name: 'Is there an employer we can ask?' }),
  ).toBeVisible();
  await aoife.page.getByRole('radio', { name: 'Yes', exact: true }).check();
  await tell.shot(
    aoife.page,
    'Is there an employer we can ask?',
    'The same again for an employer, and again she can say no.',
  );
  await aoife.page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(aoife.page.getByRole('heading', { name: 'Who should we ask?' })).toBeVisible();
  await aoife.page.getByLabel('Your employer’s name, or your manager’s').fill('Declan Murphy');
  await aoife.page.getByLabel('Their work email').fill(DECLAN);
  await tell.shot(
    aoife.page,
    'Who should we ask?',
    'Her manager’s name and work email. Referees’ answers go only to the agency, and are deleted once the tenancy starts or the letting closes.',
  );
  await aoife.page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(aoife.page.getByRole('heading', { name: 'Your work and income' })).toBeVisible();
  await addDocumentThroughUi(aoife.page, aPayslipFile('Aoife Byrne'));
  await aoife.page.getByRole('link', { name: 'Check and share' }).click();
  await expect(
    aoife.page.getByRole('heading', { name: 'Share with Halcyon Lettings' }),
  ).toBeVisible();
  await tell.shot(
    aoife.page,
    'Share with Halcyon Lettings',
    'Exactly what will be shared, before anything is: her ID result, her payslip as Gaff read it, and the two people who’ll be asked for a reference.',
  );
  await aoife.page.getByRole('button', { name: 'Share with Halcyon Lettings' }).click();
  await expect(
    aoife.page.getByRole('heading', { name: 'That’s everything from you' }),
  ).toBeVisible();
  await tell.shot(
    aoife.page,
    'That’s everything from you',
    'Her checks are done, and the page says who has been asked for a reference and when.',
  );

  // Ciarán, the backup: his page, then his checks, with nobody to ask.
  tell.stage('If you’re the backup');
  tell.meanwhile(
    'Ciarán also came from MyHome, viewed the home and applied. Halcyon Lettings chose Aoife, with Ciarán as the backup.',
  );
  await tell.email(
    browser,
    { to: CIARAN, subject: `${ADDRESS}: a few checks before an offer` },
    'A few checks before an offer',
    'Ciarán gets the same email and the same checks as Aoife. Neither is told who is first: if the first offer falls through, the home can be offered to him without delay.',
  );
  await ciaran.page.goto(await emailed(CIARAN, `${ADDRESS}: a few checks before an offer`));
  await expect(ciaran.page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  await enterLinkCode(ciaran.page, CIARAN, 'Start');
  await ciaran.page.getByRole('button', { name: 'Check my ID' }).click();
  await ciaran.page.getByRole('button', { name: 'The ID and selfie match' }).click();
  await ciaran.page.getByRole('link', { name: 'Not now' }).click();
  await ciaran.page.getByRole('radio', { name: 'No', exact: true }).check();
  await ciaran.page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    ciaran.page.getByRole('heading', { name: 'Is there an employer we can ask?' }),
  ).toBeVisible();
  await ciaran.page.getByRole('radio', { name: 'No', exact: true }).check();
  await ciaran.page.getByRole('button', { name: 'Send', exact: true }).click();
  await sharePayslipThroughUi(ciaran.page, 'Ciarán Ó Súilleabháin', AGENCY);

  // The referees answer.
  await ann.email(
    browser,
    { to: MARY, subject: 'Reference for Aoife Byrne' },
    'The referee’s email',
    'Aoife’s last landlord gets one email: who is asking, why, and one button.',
    { actor: 'referee' },
  );
  const mary = await person(browser);
  await mary.page.goto(await emailed(MARY, 'Reference for Aoife Byrne'));
  await expect(
    mary.page.getByRole('heading', { name: 'A reference for Aoife Byrne' }),
  ).toBeVisible();
  const say = (question: string, option: string) =>
    mary.page.getByRole('group', { name: question }).getByLabel(option, { exact: true }).check();
  await say('Did Aoife rent a home from you?', 'Yes');
  await say('Was the rent paid on time?', 'Always');
  await say('Did Aoife look after the home?', 'Yes');
  await say('Would you rent to Aoife again?', 'Yes');
  await ann.shot(
    mary.page,
    'A reference for Aoife Byrne',
    'The referee’s page, with no account: four questions, every answer a tap, no free text. “I can’t give this reference” is one tap too.',
    { actor: 'referee' },
  );
  await mary.page.getByRole('button', { name: 'Send my reference' }).click();
  await expect(mary.page.getByRole('heading', { name: 'Thanks' })).toBeVisible();
  await ann.shot(
    mary.page,
    'Thanks',
    'Her answers go to Halcyon Lettings only. Nothing invites her to sign up.',
    { actor: 'referee' },
  );
  await mary.context.close();
  const declan = await person(browser);
  await declan.page.goto(await emailed(DECLAN, 'Reference for Aoife Byrne'));
  for (const [question, option] of [
    ['Does Aoife work for you?', 'Yes'],
    ['What kind of job is it?', 'Permanent'],
    ['How long has Aoife worked for you?', 'More than 3 years'],
  ] as const) {
    await declan.page
      .getByRole('group', { name: question })
      .getByLabel(option, { exact: true })
      .check();
  }
  await ann.shot(
    declan.page,
    'An employer’s reference',
    'Her employer gets the same kind of page, with questions about her job.',
    { actor: 'referee' },
  );
  await declan.page.getByRole('button', { name: /^Send/ }).click();
  await expect(declan.page.getByRole('heading', { name: 'Thanks' })).toBeVisible();
  await declan.context.close();

  await expect(async () => {
    await page.goto(`${lettingUrl}/checks`);
    await expect(page.getByText('Verified: Aoife Byrne.')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 40_000 });
  await ann.shot(
    page,
    'The checks are back',
    'Everything in words: identity verified, what each referee said, work and income as Gaff read the documents. A check that didn’t pass is shown as a warning with a plain reason, never as a failure.',
  );
  await page.getByRole('link', { name: 'See what they shared' }).first().click();
  await page.waitForURL(/\/checks\/[0-9a-f-]{36}/);
  await ann.shot(
    page,
    'What Aoife shared',
    'Her work and income, as Gaff read it from her documents, with the document itself one tap away. Ann sees this only because Aoife was chosen, and shared it herself.',
  );

  // ───────────────────────────── The owner approves
  ann.stage('The owner approves');
  await page.goto(`${lettingUrl}/approval`);
  await expect(page.getByRole('heading', { level: 1, name: 'Ask Tom to approve' })).toBeVisible();
  await ann.shot(
    page,
    'Ask Tom to approve',
    'Before an offer, the owner approves. Ann sees exactly what Tom will see: the two people by name, with their results in words.',
  );
  await page.getByRole('button', { name: 'Send to Tom' }).click();
  await expect(page.getByRole('heading', { name: 'Sent to Tom' })).toBeVisible();
  await ann.shot(
    page,
    'Sent to Tom',
    'Gaff emails Tom, and tells Ann on Today as soon as he answers. She can remind him from the letting.',
  );
  await ann.email(
    browser,
    { to: TOM, subject: `${ADDRESS}: please approve a tenant` },
    'The owner’s email: please approve a tenant',
    'One email, one button. Tom answers on his phone with no account.',
    { actor: 'owner' },
  );
  await tom.page.goto(await emailed(TOM, `${ADDRESS}: please approve a tenant`));
  await expect(tom.page.getByRole('heading', { name: 'Aoife Byrne' })).toBeVisible();
  await ann.shot(
    tom.page,
    'Approve a tenant',
    'One person per screen, the chosen tenant first. Tom sees income as a multiple of the rent, never the amount, and no contact details.',
    { actor: 'owner' },
  );
  await tom.page.getByRole('button', { name: 'Approve Aoife' }).click();
  await expect(tom.page.getByRole('heading', { name: 'And a backup?' })).toBeVisible();
  await ann.shot(
    tom.page,
    'And a backup?',
    'Then the backup, the same way, so the letting isn’t held up if the first offer falls through.',
    { actor: 'owner' },
  );
  await tom.page.getByRole('button', { name: 'Approve Ciarán' }).click();
  await expect(tom.page.getByRole('heading', { name: 'Thanks, Tom' })).toBeVisible();
  await ann.shot(
    tom.page,
    'Thanks, Tom',
    'That’s all he’s asked. Nothing invites him to sign up for anything.',
    { actor: 'owner' },
  );

  // ───────────────────────────── The offer
  ann.stage('The offer');
  await expect(async () => {
    await page.goto('/today');
    await expect(
      page.getByRole('region', { name: 'Needs you' }).getByRole('link').first(),
    ).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  await ann.shot(
    page,
    'Today, once Tom has approved',
    'Each decision becomes a task on Today when it’s due. Tom has approved, so the next one is the offer.',
  );
  await page.goto(`${lettingUrl}/comparables`);
  for (const [n, rent] of [
    [1, '1,800'],
    [2, '1,850'],
    [3, '1,950'],
  ] as const) {
    await expect(
      page.getByRole('heading', { level: 1, name: `Comparable rent ${n} of 3` }),
    ).toBeVisible();
    await page.getByLabel('Area').fill('Dublin 6');
    await page.getByLabel('Rent a month').fill(rent);
    if (n === 1) {
      await ann.shot(
        page,
        'Comparable rent 1 of 3',
        'The law asks for three comparable rents before a rent is set. Gaff asks for them only now, one home per screen, with the type of home filled in.',
      );
    }
    await page
      .getByRole('button', { name: n < 3 ? 'Next' : 'Save comparables', exact: true })
      .click();
  }
  await expect(page.getByText('Comparables saved for the rent-setting pack.')).toBeVisible();
  await ann.shot(
    page,
    'Comparables saved',
    'The three rents are kept on the letting’s Home view, and go into the rent-setting pack for the tenant.',
    { parts: 1 },
  );
  await page.goto(`${lettingUrl}/offer`);
  await expect(page.getByRole('heading', { name: 'The offer', exact: true })).toBeVisible();
  await ann.shot(
    page,
    'The offer',
    'The third decision. The terms are filled in from the letting: rent, deposit (capped at one month’s rent), start date and length.',
  );
  await next();
  await ann.shot(
    page,
    'Check and send the offer',
    'The message Aoife will get, in fixed wording, with one total to pay. Nothing is paid to Gaff, and renters never pay a fee.',
  );
  await page.getByRole('button', { name: 'Send the offer to Aoife' }).click();
  await expect(page.getByRole('heading', { name: 'Offer sent' })).toBeVisible();
  await ann.shot(
    page,
    'Offer sent',
    'Aoife is emailed the offer. Gaff tells Ann when she answers.',
  );
  await aoife.page.goto(await emailed(AOIFE, `An offer: ${ADDRESS}`));
  await aoife.page.getByRole('button', { name: 'Accept the offer' }).click();
  await expect(
    aoife.page.getByText(/You’ve accepted the offer\. Your tenancy starts on/),
  ).toBeVisible();
  await page.goto(lettingUrl);
  await ann.shot(
    page,
    'The letting, once Aoife accepts',
    'Aoife accepted on her phone. The letting moves to its last part, Sign, and its task is the agreement.',
  );

  // ───────────────────────────── The tenancy
  ann.stage('The tenancy');
  await page.goto(`${lettingUrl}/tenancy`);
  await expect(page.getByRole('heading', { name: 'The tenancy, step by step' })).toBeVisible();
  await ann.shot(
    page,
    'The tenancy, step by step',
    'From an accepted offer to keys in hand, one step at a time: the agreement, the payment, RTB registration, move-in.',
  );
  await page.getByRole('link', { name: 'Send the agreement', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Send the agreement to Aoife' }),
  ).toBeVisible();
  await ann.shot(
    page,
    'Send the agreement to Aoife',
    'Gaff fills the agreement from the letting and the offer. Ann sends it to sign on screen, or records that both signed on paper.',
  );
  await page.getByRole('button', { name: 'Send to Aoife to sign' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sent to Aoife' })).toBeVisible();
  await ann.shot(
    page,
    'Sent to Aoife',
    'Aoife signs first, on her phone. Then it comes back to Ann.',
  );
  await page.goto(`${lettingUrl}/tenancy/agreement`);
  await ann.shot(
    page,
    'The tenancy agreement',
    'The agreement itself, to read or print: the home, the people, the rent and the terms.',
  );
  await page.goto(`${lettingUrl}/tenancy/rent-pack`);
  await ann.shot(
    page,
    'The rent-setting pack',
    'What the law says a tenant must be given about how the rent was set, made from the rent check and the three comparables.',
  );
  await aoife.page.goto(await emailed(AOIFE, `${ADDRESS}: your tenancy agreement to sign`));
  await aoife.page.getByLabel('Type your full name to sign').fill('Aoife Byrne');
  await aoife.page
    .getByLabel('I’ve read the agreement, and I agree to sign it electronically')
    .check();
  await aoife.page.getByRole('button', { name: 'Sign my tenancy agreement' }).click();
  await expect(aoife.page.getByRole('heading', { name: 'You’ve signed' })).toBeVisible();
  await page.goto(`${lettingUrl}/tenancy/sign`);
  await expect(page.getByRole('heading', { level: 1, name: 'Sign the agreement' })).toBeVisible();
  await page.getByLabel('Type your full name to sign').fill('Ann Power');
  await page.getByLabel(/I agree to sign this agreement electronically, for the landlord/).check();
  await ann.shot(
    page,
    'Sign the agreement',
    'Aoife has signed. Ann signs for the landlord by typing her name.',
  );
  await page.getByRole('button', { name: 'Sign the agreement' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Signed by both sides' })).toBeVisible();
  await ann.shot(
    page,
    'Signed by both sides',
    'Both have a copy. What is signed is the third thing a person, not Gaff, decides.',
  );
  await page.goto(`${lettingUrl}/tenancy/payment`);
  await page.getByLabel('Name on the account').fill('Halcyon Lettings client account');
  await page.getByLabel('IBAN').fill('IE29 AIBK 9311 5212 3456 78');
  await ann.shot(
    page,
    'Where does Aoife pay?',
    'The agency’s own client account. Gaff never holds money: the deposit and first month’s rent go straight from tenant to agent.',
  );
  await page.getByRole('button', { name: 'Save the account' }).click();
  const itsYou = page.getByRole('dialog', { name: 'Confirm it’s you' });
  await expect(itsYou).toBeVisible();
  await ann.shot(
    page,
    'Confirm it’s you',
    'Changing where money goes is one of the few sensitive changes. Gaff asks Ann to confirm it’s her first, with a code or her passkey.',
  );
  await confirmItsYou(page);
  await expect(
    page.getByRole('heading', { level: 1, name: 'A number Aoife can ring' }),
  ).toBeVisible();
  await page.getByLabel('Phone number').fill('01 234 5678');
  await ann.shot(
    page,
    'A number Aoife can ring',
    'So the tenant can ring and check the bank details before paying: the simplest guard against a fake payment request.',
  );
  await page.getByRole('button', { name: 'Save the number' }).click();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Ask Aoife for the deposit and first month’s rent',
    }),
  ).toBeVisible();
  await ann.shot(
    page,
    'Ask Aoife for the deposit and first month’s rent',
    'One total, the account, and a reference for the transfer. Each of the two is capped at one month’s rent.',
  );
  await page.getByRole('button', { name: 'Ask Aoife to pay' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Asked Aoife to pay' })).toBeVisible();
  await ann.shot(page, 'Asked Aoife to pay', 'Aoife’s page now shows how to pay, and to whom.');
  await page.goto(`${lettingUrl}/tenancy/received`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Has Aoife’s payment arrived?' }),
  ).toBeVisible();
  await ann.shot(
    page,
    'Has Aoife’s payment arrived?',
    'Ann checks the agency’s account herself and says when the money is in.',
  );
  await page.getByRole('button', { name: 'It’s in our account' }).click();
  await expect(page.getByText('Aoife has a receipt.')).toBeVisible();
  await ann.shot(page, 'Payment received', 'Recorded, and Aoife is sent a receipt.');
  // Aoife gives her PPS number, for the RTB only.
  await aoife.page.goto(aoifeLink);
  const pps = aoife.page.getByRole('heading', { name: 'Your PPS number' });
  await expect(pps).toBeVisible();
  await aoife.page.getByRole('textbox', { name: 'PPS number' }).fill('1234567T');
  await aoife.page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(pps).toHaveCount(0);
  await page.goto(`${lettingUrl}/tenancy/rtb`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Register with the RTB' }),
  ).toBeVisible();
  await page.getByLabel('RTB registration number').fill('RT0012345');
  await ann.shot(
    page,
    'Register with the RTB',
    'Everything the RTB’s form asks for, each with a copy button, and the deadline. The tenant’s PPS number stays hidden until Ann asks to see it, and is deleted once the tenancy is registered.',
  );
  await page.getByRole('button', { name: 'I’ve registered it' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Registered with the RTB' }),
  ).toBeVisible();
  await ann.shot(
    page,
    'Registered with the RTB',
    'The registration number is on the record, and the PPS number is gone.',
  );
  await page.goto(`${lettingUrl}/tenancy`);
  await page.getByRole('link', { name: 'Hand over the keys', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Hand over the keys' })).toBeVisible();
  await page.getByLabel('Keys handed over').check();
  await page.getByLabel('Electricity meter reading').fill('012345');
  await ann.shot(
    page,
    'Hand over the keys',
    'The move-in checklist: keys, meter readings, and an inventory to add to.',
  );
  await page.getByRole('button', { name: 'Save the checklist' }).click();
  await page.waitForLoadState('networkidle');
  await expect(page.getByLabel('Keys handed over')).toBeChecked();
  await page.getByRole('link', { name: 'Add an item' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Add to the inventory' })).toBeVisible();
  await page.getByLabel('Room').fill('Kitchen');
  await page.getByLabel('Item', { exact: true }).fill('Fridge freezer');
  await page.getByRole('group', { name: 'Condition' }).getByRole('radio', { name: 'Good' }).check();
  await ann.shot(
    page,
    'Add to the inventory',
    'One item at a time, on a phone, walking through the home: the room, the item, its condition in one tap, a note and a photo.',
  );
  await page.getByRole('button', { name: 'Add to the inventory' }).click();
  await expect(page.getByText(/Added Fridge freezer, Kitchen\. 1 item so far\./)).toBeVisible();
  for (const [room, item] of [
    ['Kitchen', 'Oven and hob'],
    ['Living room', 'Corner sofa'],
    ['Bedroom 1', 'Double bed and mattress'],
  ] as const) {
    await page.getByLabel('Room').fill(room);
    await page.getByLabel('Item', { exact: true }).fill(item);
    await page
      .getByRole('group', { name: 'Condition' })
      .getByRole('radio', { name: 'Good' })
      .check();
    await page.getByRole('button', { name: 'Add to the inventory' }).click();
    await expect(page.getByText(new RegExp(`Added ${item}, ${room}\\.`))).toBeVisible();
  }
  await page.getByRole('link', { name: 'Done', exact: true }).click();
  await ann.shot(
    page,
    'The inventory, ready to share',
    'The checklist with the inventory on it. One button saves it and shares it with Aoife to confirm.',
  );
  await page.getByRole('button', { name: 'Save and share with Aoife' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Keys handed over' })).toBeVisible();
  await ann.shot(
    page,
    'Keys handed over',
    'Aoife is in. She checks the inventory on her own page and confirms it’s a fair record.',
  );
  await aoife.page.goto(aoifeLink);
  await aoife.page.getByRole('link', { name: 'Check the inventory' }).click();
  await aoife.page.getByRole('button', { name: 'This is a fair record' }).click();
  await expect(aoife.page.getByRole('heading', { name: 'You’ve confirmed it' })).toBeVisible();

  // ───────────────────────────── Finishing
  ann.stage('Finishing');
  await page.goto(`${lettingUrl}/tenancy`);
  await ann.shot(
    page,
    'The tenancy, with every step done',
    'Signed, paid, registered and moved in, with the inventory confirmed. One thing is left: finish the letting.',
  );
  await page.getByRole('link', { name: 'Finish this letting', exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Finish this letting' })).toBeVisible();
  await ann.shot(
    page,
    'Finish this letting',
    'Finishing closes the letting and tells everyone else who enquired, in fixed wording, that the home is let.',
  );
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  const usual = page.getByRole('heading', {
    level: 1,
    name: 'Before Gaff, how long did a letting usually take?',
  });
  await expect(usual).toBeVisible();
  await page.getByText('About a month', { exact: true }).click();
  await ann.shot(
    page,
    'Before Gaff, how long did a letting usually take?',
    'Asked once, on the first letting, so the results can be set against how things were.',
  );
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'And how many hours of your own time?' }),
  ).toBeVisible();
  await page.getByText('About 10 hours', { exact: true }).click();
  await ann.shot(
    page,
    'And how many hours of your own time?',
    'The second half of the same question.',
  );
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `${ADDRESS} is let` })).toBeVisible();
  await ann.shot(
    page,
    '12 Ranelagh Road is let',
    'The results screen: days from first enquiry to let, and Ann’s own time, against what’s usual for her. One next action.',
  );
  await page
    .getByRole('link', { name: 'Send Tom the summary' })
    .or(page.getByRole('button', { name: 'Send Tom the summary' }))
    .first()
    .click();
  await page.waitForLoadState('networkidle');
  await ann.shot(
    page,
    'Shared with Tom Walsh',
    '“Send Tom the summary” opens the owner’s sharing: Tom’s link now shows how it went. Ann can send him a fresh link, or stop sharing.',
  );
  await tom.page.goto(await emailed(TOM, `${ADDRESS}: follow the letting`));
  await ann.shot(
    tom.page,
    'The owner’s page, once the home is let',
    'Tom’s link now shows the summary: who it was let to, from when, and each decision along the way.',
    { actor: 'owner' },
  );
  await tom.context.close();

  // The backup's page, now that the home is let.
  await ciaran.page.goto(ciaranLink);
  await tell.shot(
    ciaran.page,
    'The home has been let',
    'Once Aoife’s tenancy is under way, Ciarán is told plainly, on his page and by email, that the home went to someone else, and when his details will be deleted.',
  );
  await tell.email(
    browser,
    { to: CIARAN, subject: `${ADDRESS}: an update on your application` },
    'The email that says so',
    'The outcome arrives in fixed wording, with no blame and no reason that could be about who he is.',
  );
  await ciaran.context.close();
  await aoife.context.close();

  await page.goto(lettingUrl);
  await ann.shot(
    page,
    'The letting, closed',
    'The letting’s page stays as the record, and says it’s closed.',
  );
  await page.getByRole('button', { name: `More for ${ADDRESS}` }).click();
  await page.getByRole('menuitem', { name: 'History' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeVisible();
  await ann.shot(
    page,
    'History',
    'Every step, with who did it and when, and a filter for the decisions alone. It holds IDs, dates and outcomes, never anyone’s personal details.',
  );

  // ───────────────────────────── Around Gaff
  ann.stage('Around Gaff');
  await page.goto('/today');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await ann.shot(page, 'Today, with nothing waiting', 'When nothing needs Ann, Today says so.');
  await page.goto('/lettings');
  await ann.shot(
    page,
    'Lettings',
    'Every letting the agency has, live and finished. Every member of the team sees them all.',
  );
  await page.goto('/inbox?show=all');
  await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible();
  await ann.shot(
    page,
    'Inbox',
    'Every conversation with a renter or an owner, kept with its letting.',
  );
  const menu = await openAccountMenu(page);
  await ann.shot(
    page,
    'The account menu',
    'On the avatar: switch between the agency and renting, add another, and reach Settings, Profile, Help and Sign out.',
  );
  await menu.press('Escape');
  for (const [path, title, caption] of [
    ['/settings', 'Settings', 'A short list of rows, each a page with one subject.'],
    [
      '/settings/agency',
      'Settings: the agency',
      'The agency’s name and PSRA licence, as renters see them on every page and message.',
    ],
    [
      '/settings/assistant',
      'Settings: the assistant',
      'What the AI assistant may send on its own and what waits for a person.',
    ],
    [
      '/settings/enquiries',
      'Settings: enquiries',
      'The agency’s Gaff address and its forwarding, set up earlier.',
    ],
    [
      '/settings/income',
      'Settings: the income rule',
      'The one income rule the agency applies to every applicant, as a multiple of the rent. Housing assistance counts as income.',
    ],
    [
      '/settings/payment',
      'Settings: where tenants pay',
      'The client account saved at the payment step. Changing it asks Ann to confirm it’s her.',
    ],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await ann.shot(page, title, caption);
  }
  await page.goto('/profile');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await ann.shot(
    page,
    'Profile',
    'Ann’s own profile: her name, how she signs in, and the teams she’s in. It belongs to her, not to the agency.',
  );
  await page.goto('/help');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await ann.shot(
    page,
    'Help',
    'For now, Help explains how search results are ordered and where the map’s data comes from. Help with using Gaff is still to come.',
  );

  // The same conversation three times over: after the first, only what changed, lower down.
  withoutTheirFirstPart([
    'Editing the draft',
    'Answering what Gaff doesn’t know',
    'The conversation, answered',
  ]);
});
