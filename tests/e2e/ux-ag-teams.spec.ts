import { expect, test, type Browser, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_DATABASE_URL } from '../../playwright.config';
import {
  addHomeThroughUi,
  answerName,
  answerPurpose,
  confirmItsYou,
  expectAccessible,
  expectNoSidewaysScroll,
  homeIdIn,
  latestCodeFor,
  licenceOf,
  openAccountMenu,
  screenshot,
  signIn,
  signUpOperator,
  uniqueEmail,
} from './support';

/**
 * Work package WP-19: teams (UX-AG-3, UX-AG-8 to UX-AG-17). Each journey runs at 390px and at
 * 1280px: the same steps and the same words at both (UX-DS-25).
 */
const widths = [
  [390, { width: 390, height: 844 }],
  [1280, { width: 1280, height: 900 }],
] as const;
type Viewport = (typeof widths)[number][1];

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

/** The newest email the development outbox "sent" to this address. */
async function newestMailTo(to: string, subject: string) {
  await expect
    .poll(
      async () =>
        (
          await asSystem<{ subject: string }>(
            'select subject from dev_outbox where to_address = $1',
            [to],
          )
        ).map((row) => row.subject),
      { timeout: 20_000 },
    )
    .toContain(subject);
  const [mail] = await asSystem<{ html: string; text: string }>(
    'select html, text from dev_outbox where to_address = $1 and subject = $2 order by created_at desc limit 1',
    [to, subject],
  );
  return mail!;
}

/** What a member's role is in the agency, as the database holds it. */
const roleOf = async (email: string) =>
  (
    await asSystem<{ role: string }>(
      'select m.role from memberships m join users u on u.id = m.user_id where u.email = $1',
      [email],
    )
  ).map((row) => row.role);

/** Test only: the name a person would give in Profile, for a colleague who joined by invite. */
const nameThem = (email: string, name: string) =>
  asSystem('update users set name = $1 where email = $2', [name, email]);

/** An admin invites a colleague from Team; returns the address. Ends on Team. */
async function inviteFromTeam(page: Page, email: string, role: 'Agent' | 'Admin' = 'Agent') {
  await page.goto('/settings/team/invite');
  await page.getByLabel('Email addresses').fill(email);
  await page.getByRole('radio', { name: role }).check();
  await page.getByRole('button', { name: 'Send invites' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Invite sent' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Team' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Team' })).toBeVisible();
}

/**
 * A colleague joins through the invite email: its link opens sign-in titled "Join {agency}",
 * with the address filled in; signing in lands them on Today, in the agency.
 */
async function joinFromEmail(
  browser: Browser,
  viewport: Viewport,
  email: string,
  agency: string,
): Promise<Page> {
  const mail = await newestMailTo(email, `Ann Power invited you to join ${agency} on Gaff`);
  const link = mail.text.match(/https?:\/\/\S+/)![0];
  const context = await browser.newContext({ viewport, locale: 'en-IE' });
  const page = await context.newPage();
  await page.goto(new URL(link).pathname);
  await expect(page.getByRole('heading', { level: 1, name: `Join ${agency}` })).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
  await page.getByLabel('Six-digit code').fill(await latestCodeFor(email));
  await expect(page).toHaveURL(/\/today$/);
  return page;
}

/** An admin with a colleague on the team, each signed in in a browser of their own. */
async function anAdminAndAnAgent(browser: Browser, page: Page, viewport: Viewport, agency: string) {
  await page.context().clearCookies();
  await page.setViewportSize(viewport);
  const admin = await signUpOperator(page, agency);
  const agentEmail = uniqueEmail('brid');
  await inviteFromTeam(page, agentEmail);
  const agent = await joinFromEmail(browser, viewport, agentEmail, agency);
  await nameThem(agentEmail, 'Bríd Walsh');
  return { admin, agentEmail, agent };
}

test('UX-AG-11, UX-AG-12: an admin invites a colleague, who signs in straight into the agency', async ({
  browser,
  page,
}) => {
  test.slow();
  for (const [width, viewport] of widths) {
    await page.context().clearCookies();
    await page.setViewportSize(viewport);
    const agency = `Halcyon ${width} Lettings`;
    await signUpOperator(page, agency);

    // Team is in the account menu. On it, "Invite a colleague" is the one primary action.
    const menu = await openAccountMenu(page);
    await menu.getByRole('menuitem', { name: 'Team' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Team' })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Ann Power/ })).toContainText('Admin · You');
    await expectAccessible(page);
    await screenshot(page, `ux-ag-team-${width}`);

    await page.getByRole('link', { name: 'Invite a colleague' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Invite your team' })).toBeVisible();
    // Role defaults to Agent, with Admin one tap away.
    await expect(page.getByRole('radio', { name: 'Agent' })).toBeChecked();
    // What's wrong is said at the field.
    await page.getByLabel('Email addresses').fill('orla@');
    await page.getByRole('button', { name: 'Send invites' }).click();
    await expect(
      page.getByText('orla@ isn’t an email address. Check it, then send again.'),
    ).toBeVisible();
    await expectNoSidewaysScroll(page);
    await expectAccessible(page);
    await screenshot(page, `ux-ag-invite-${width}`);

    const orla = uniqueEmail('orla');
    const niall = uniqueEmail('niall');
    await page.getByLabel('Email addresses').fill(`${orla}, ${niall}`);
    await page.getByRole('button', { name: 'Send invites' }).click();
    await expect(page.getByRole('heading', { level: 1, name: '2 invites sent' })).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-ag-invite-sent-${width}`);
    await page.getByRole('link', { name: 'Back to Team' }).click();

    // Step 2: each invite on Team, "Invited · sent today", with Send again and Cancel.
    const invited = page.getByRole('region', { name: 'Invited' });
    await expect(invited.getByText(orla)).toBeVisible();
    await expect(invited.getByText('Invited as an Agent · sent today').first()).toBeVisible();
    await invited.getByRole('button', { name: `More for ${niall}` }).click();
    await page.getByRole('menuitem', { name: 'Cancel' }).click();
    await expect(page.getByText('Invite cancelled. Its link no longer works.')).toBeVisible();
    await expect(invited.getByText(niall)).toHaveCount(0);
    await invited.getByRole('button', { name: `More for ${orla}` }).click();
    await page.getByRole('menuitem', { name: 'Send again' }).click();
    await expect(page.getByText('Sent again. The new invite works for 7 days.')).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-ag-team-invited-${width}`);

    // The email: who invited them, to which agency, one button.
    const mail = await newestMailTo(orla, `Ann Power invited you to join ${agency} on Gaff`);
    const letter = await page.context().newPage();
    await letter.setContent(mail.html);
    await expect(letter.getByRole('link', { name: `Join ${agency}` })).toHaveCount(1);
    await expectAccessible(letter);
    await letter.screenshot({
      path: `screenshots/ux-ag-email-colleague-${width}.png`,
      fullPage: true,
    });
    await letter.close();

    // The colleague opens it: sign-in says "Join {agency}", with the address filled in.
    const link = mail.text.match(/https?:\/\/\S+/)![0];
    expect(link).not.toContain('@');
    const context = await browser.newContext({ viewport, locale: 'en-IE' });
    const colleague = await context.newPage();
    await colleague.goto(new URL(link).pathname);
    await expect(
      colleague.getByRole('heading', { level: 1, name: `Join ${agency}` }),
    ).toBeVisible();
    await expect(colleague.getByLabel('Email', { exact: true })).toHaveValue(orla);
    await expectAccessible(colleague);
    await screenshot(colleague, `ux-ag-join-sign-in-${width}`);
    await colleague.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(colleague.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
    await colleague.getByLabel('Six-digit code').fill(await latestCodeFor(orla));
    // No questions: Today, in the agency, as an Agent.
    await expect(colleague).toHaveURL(/\/today$/);
    await expect(colleague.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    expect(await roleOf(orla)).toEqual(['negotiator']);
    // An agent sees the team, and changes none of it.
    await colleague.goto('/settings/team');
    await expect(colleague.getByRole('link', { name: 'Invite a colleague' })).toHaveCount(0);
    await expect(colleague.getByText('Only an admin can invite people')).toBeVisible();
    await expectAccessible(colleague);
    await screenshot(colleague, `ux-ag-team-as-agent-${width}`);
    await context.close();

    // The invite worked once: it's gone from Team, and the colleague is on it.
    await page.reload();
    await expect(page.getByRole('region', { name: 'Invited' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'People' }).getByText(orla)).toBeVisible();
  }
});

test('UX-AG-3: an admin answers a request to join, and the person is told', async ({
  browser,
  page,
}) => {
  test.slow();
  for (const [width, viewport] of widths) {
    await page.context().clearCookies();
    await page.setViewportSize(viewport);
    const agency = `Corrib ${width} Lettings`;
    const admin = await signUpOperator(page, agency);
    const licence = await licenceOf(admin);

    // Someone finds the agency on Gaff at first run, and asks to join.
    const context = await browser.newContext({ viewport, locale: 'en-IE' });
    const asker = await context.newPage();
    const askerEmail = uniqueEmail('fionn');
    await signIn(asker, askerEmail);
    await answerName(asker, 'Fionn Ryan');
    await answerPurpose(asker, 'I work at a letting agency');
    await expect(asker.getByRole('heading', { name: 'Which agency?' })).toBeVisible();
    await asker.goto('/welcome?step=agency&by=licence');
    await asker.getByLabel('Licence number').fill(licence);
    await asker.getByRole('button', { name: 'Continue', exact: true }).click();
    await asker.getByRole('button', { name: 'Ask to join' }).click();
    await expect(
      asker.getByRole('heading', { level: 1, name: `We’ve asked ${agency}` }),
    ).toBeVisible();

    // The admin sees who asked, and says yes.
    await page.goto('/settings/team');
    const requests = page.getByRole('region', { name: 'Asked to join' });
    await expect(requests.getByText('Fionn Ryan', { exact: true })).toBeVisible();
    await expect(requests.getByText(`${askerEmail} · asked today`)).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-ag-request-to-join-${width}`);
    await requests.getByRole('button', { name: 'Add to the team' }).click();
    await expect(
      page.getByText('They’re on the team now, as an Agent. We’ve emailed to tell them.'),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'People' }).getByText('Fionn Ryan'),
    ).toBeVisible();
    expect(await roleOf(askerEmail)).toEqual(['negotiator']);

    // They're told, and the agency is theirs to work in.
    await newestMailTo(askerEmail, `You’re in ${agency} on Gaff`);
    await asker.goto('/today');
    await expect(asker.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await context.close();
  }
});

test('UX-AG-8, UX-AG-9: change a role, change a letting’s lead, and help with a colleague’s letting', async ({
  browser,
  page,
}) => {
  test.slow();
  for (const [width, viewport] of widths) {
    const agency = `Shannon ${width} Lettings`;
    const { agentEmail, agent } = await anAdminAndAnAgent(browser, page, viewport, agency);

    // The admin adds a home: they lead it.
    await addHomeThroughUi(page, `${width} Ranelagh Road`);
    const lettingId = homeIdIn(page.url());

    // The agent sees it (every member sees every letting) and is offered help, not refused.
    await agent.goto(`/lettings/${lettingId}`);
    await expect(agent.getByText('Ann Power leads this letting')).toBeVisible();
    await expectAccessible(agent);
    await screenshot(agent, `ux-ag-help-with-letting-${width}`);
    await agent.getByRole('button', { name: 'Help with this letting' }).click();
    await expect(agent.getByText('Ann Power leads this letting')).toHaveCount(0);
    // It isn't theirs to hand over: no "Change lead".
    await agent.getByRole('button', { name: `More for ${width} Ranelagh Road` }).click();
    await expect(agent.getByRole('menuitem', { name: 'Change lead' })).toHaveCount(0);
    await agent.keyboard.press('Escape');

    // The admin makes the agent the lead, from the letting's menu.
    await page.goto(`/lettings/${lettingId}`);
    await page.getByRole('button', { name: `More for ${width} Ranelagh Road` }).click();
    await page.getByRole('menuitem', { name: 'Change lead' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Who leads this letting?' }),
    ).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Ann Power (you)' })).toBeChecked();
    await expectAccessible(page);
    await screenshot(page, `ux-ag-change-lead-${width}`);
    await page.getByRole('radio', { name: 'Bríd Walsh' }).check();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Bríd Walsh leads this letting now' }),
    ).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-ag-lead-changed-${width}`);

    // The agent now leads it: it's on their Lettings, and they can hand it on themselves.
    await agent.goto('/lettings');
    await expect(
      agent.getByRole('link', { name: new RegExp(`${width} Ranelagh Road`) }),
    ).toBeVisible();
    await agent.goto(`/lettings/${lettingId}/lead`);
    await expect(
      agent.getByRole('heading', { level: 1, name: 'Who leads this letting?' }),
    ).toBeVisible();

    // The admin makes the agent an admin, from their page on Team.
    await page.goto('/settings/team');
    await page.getByRole('link', { name: /^Bríd Walsh/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Bríd Walsh' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Agent' })).toBeChecked();
    await expectAccessible(page);
    await screenshot(page, `ux-ag-member-${width}`);
    await page.getByRole('radio', { name: 'Admin' }).check();
    await page.getByRole('button', { name: 'Save role' }).click();
    await expect(page.getByText('Role saved.')).toBeVisible();
    expect(await roleOf(agentEmail)).toEqual(['admin']);
    // Now an admin, they see "Invite a colleague" on Team.
    await agent.goto('/settings/team');
    await expect(agent.getByRole('link', { name: 'Invite a colleague' })).toBeVisible();
    await agent.context().close();
  }
});

test('UX-AG-15, UX-AG-16: removing a member hands their lettings over and ends their access at once; the last admin can’t leave', async ({
  browser,
  page,
}) => {
  test.slow();
  for (const [width, viewport] of widths) {
    const agency = `Liffey ${width} Lettings`;
    const { admin, agentEmail, agent } = await anAdminAndAnAgent(browser, page, viewport, agency);
    // The agent adds a home, so they lead it.
    await addHomeThroughUi(agent, `${width} Harcourt Street`);
    const lettingId = homeIdIn(agent.url());

    // UX-AG-16: the admin is the only admin: they can't leave, and Profile says why.
    await page.goto('/profile');
    const teams = page.getByRole('region', { name: 'Your teams' });
    await expect(teams.getByText(/You’re the only admin/)).toBeVisible();
    await expect(teams.getByRole('button', { name: `Leave ${agency}` })).toHaveCount(0);
    await expectAccessible(page);
    await screenshot(page, `ux-ag-profile-last-admin-${width}`);
    // Nor can their own role change from admin.
    await page.goto('/settings/team');
    await page.getByRole('link', { name: /^Ann Power/ }).click();
    await expect(page.getByText(/Every team needs an admin/)).toBeVisible();
    await expect(page.getByRole('link', { name: `Remove from ${agency}` })).toHaveCount(0);

    // Remove the agent: one screen lists their lettings, with the admin pre-selected.
    await page.goto('/settings/team');
    await page.getByRole('link', { name: /^Bríd Walsh/ }).click();
    await page.getByRole('link', { name: `Remove from ${agency}` }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: `Remove Bríd Walsh from ${agency}?` }),
    ).toBeVisible();
    await expect(page.getByLabel(`New lead for ${width} Harcourt Street`)).toHaveValue(
      (await asSystem<{ id: string }>('select id from users where email = $1', [admin]))[0]!.id,
    );
    await expectAccessible(page);
    await screenshot(page, `ux-ag-remove-${width}`);
    await page.getByRole('button', { name: 'Remove Bríd' }).click();
    // Gaff asks the admin to confirm it's them.
    await confirmItsYou(page);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Bríd Walsh is no longer on the team' }),
    ).toBeVisible();
    await expectAccessible(page);
    await screenshot(page, `ux-ag-removed-${width}`);

    // At once: the agent's next request can't open the agency's pages.
    await agent.goto(`/lettings/${lettingId}`);
    await expect(agent).toHaveURL(/\/welcome/);
    expect(await roleOf(agentEmail)).toEqual([]);
    // Their letting has a lead: the admin.
    const [lead] = await asSystem<{ email: string }>(
      'select u.email from lettings l join users u on u.id = l.lead_user_id where l.id = $1',
      [lettingId],
    );
    expect(lead!.email).toBe(admin);
    await agent.context().close();
  }
});

test('UX-AG-17: a member leaves an agency from their profile, and an admin is told', async ({
  browser,
  page,
}) => {
  test.slow();
  for (const [width, viewport] of widths) {
    const agency = `Boyne ${width} Lettings`;
    const { admin, agent } = await anAdminAndAnAgent(browser, page, viewport, agency);
    await addHomeThroughUi(agent, `${width} Pembroke Road`);
    const lettingId = homeIdIn(agent.url());

    await agent.goto('/profile');
    const teams = agent.getByRole('region', { name: 'Your teams' });
    await expect(teams.getByText(agency, { exact: true })).toBeVisible();
    await teams.getByRole('button', { name: `Leave ${agency}` }).click();
    const sheet = agent.getByRole('dialog', { name: `Leave ${agency}?` });
    await expect(sheet).toBeVisible();
    await expectAccessible(agent);
    await screenshot(agent, `ux-ag-leave-${width}`);
    await sheet.getByRole('button', { name: 'Leave', exact: true }).click();
    await expect(agent.getByText(`You’ve left ${agency}.`)).toBeVisible();
    await expect(teams).toHaveCount(0);

    // Their access has ended, their letting is the admin's, and the admin is told.
    await agent.goto('/today');
    await expect(agent).toHaveURL(/\/welcome/);
    const [lead] = await asSystem<{ email: string }>(
      'select u.email from lettings l join users u on u.id = l.lead_user_id where l.id = $1',
      [lettingId],
    );
    expect(lead!.email).toBe(admin);
    const mail = await newestMailTo(admin, `Bríd Walsh has left ${agency}`);
    expect(mail.text).toContain('You lead the letting they led now.');
    await agent.context().close();
  }
});
