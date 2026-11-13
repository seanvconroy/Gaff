import { expect, test } from '@playwright/test';
import {
  expectAccessible,
  enterEmailedCode,
  latestLinkFor,
  checkIdWithSelfie,
  latestSmsCode,
  makeStaff,
  screenshot,
  signIn,
  signUpLandlord,
  signUpOperator,
  uniqueEmail,
} from './support';

test('M3, M22, M24: a private landlord confirms their mobile and their identity', async ({
  page,
}) => {
  await signUpLandlord(page);
  await page.goto('/settings/checks');
  await expect(page.getByRole('heading', { name: 'Checks' })).toBeVisible();
  await expect(page.getByText('Before your homes can go live')).toBeVisible();
  await expectAccessible(page);

  const mobile = `087${String(Date.now()).slice(-7)}`;
  await page.getByLabel('Your mobile number').fill(mobile);
  await page.getByRole('button', { name: 'Text me a code' }).click();
  await expect(page.getByText(/We’ve texted a 6-digit code to 087 •••/)).toBeVisible();
  await page.getByLabel('The code from the text').fill('000000');
  await page.getByRole('button', { name: 'Confirm my number' }).click();
  await expect(page.getByText('That code doesn’t match.')).toBeVisible();
  await page
    .getByLabel('The code from the text')
    .fill(await latestSmsCode(`+353${mobile.slice(1)}`));
  await page.getByRole('button', { name: 'Confirm my number' }).click();
  await expect(page.getByText('Your mobile number is confirmed.')).toBeVisible();

  // P18 (Q60): the check is explained, then agreed to with one button; a selfie is required.
  await expect(page.getByRole('button', { name: /without a selfie/ })).toHaveCount(0);
  await checkIdWithSelfie(page);
  await expect(page.getByText('You’re checked')).toBeVisible();
  await expect(page.getByText(/Identity checked by Gaff on \d+ \w+/)).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, 'm2-landlord-checked');
});

test('M16, M18, M23, M105: an agency invites an agent, and Gaff staff check both licences', async ({
  browser,
  page,
}) => {
  const admin = await signUpOperator(page, 'Larkspur Lettings');
  await page.goto('/settings/team');
  await expectAccessible(page);
  const agentEmail = uniqueEmail('aoife');
  await page.getByLabel('Their work email').fill(agentEmail);
  await page.getByRole('button', { name: 'Send the invitation' }).click();
  await expect(page.getByText(`We’ve emailed an invitation to ${agentEmail}.`)).toBeVisible();

  // The agent joins from the link in the email, signing in on the way.
  const agentContext = await browser.newContext();
  const agent = await agentContext.newPage();
  await agent.goto(await latestLinkFor(agentEmail));
  await expect(
    agent.getByRole('heading', { name: 'Join Larkspur Lettings on Gaff' }),
  ).toBeVisible();
  await expectAccessible(agent);
  await agent.getByLabel('Your email address').fill(agentEmail);
  await agent.getByRole('button', { name: 'Email me a code instead' }).click();
  await enterEmailedCode(agent, agentEmail);
  await agent.getByRole('button', { name: 'Join Larkspur Lettings' }).click();
  await expect(agent.getByRole('heading', { name: 'Profile' })).toBeVisible();
  await agent.getByLabel('Your name, as renters see it').fill('Aoife Byrne');
  await agent.getByLabel('Your own PSRA licence number').fill('002345');
  await agent.getByRole('button', { name: 'Save my profile' }).click();
  await expect(agent.getByText('Saved.')).toBeVisible();
  await expectAccessible(agent);

  // A Gaff reviewer checks both licences on the register.
  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  const staffEmail = uniqueEmail('reviewer');
  await signIn(staff, staffEmail);
  await makeStaff(staffEmail);
  await staff.goto('/staff/checks');
  await expect(staff.getByRole('heading', { name: 'Licence checks' })).toBeVisible();
  await expectAccessible(staff);
  await screenshot(staff, 'm2-staff-checks');
  for (const whose of ['Larkspur Lettings', 'Agent at Larkspur Lettings']) {
    const row = staff
      .getByRole('row')
      .filter({ has: staff.getByRole('cell', { name: whose, exact: true }) });
    await row.getByRole('button', { name: 'Matches the register' }).click();
    await expect(staff.getByText('Recorded, and the letter has been emailed.')).toBeVisible();
  }

  await agent.goto('/settings/checks');
  await expect(
    agent.getByText(/PSRA licence 001234, checked on the public register/),
  ).toBeVisible();
  await expect(
    agent.getByText(/PSRA licence 002345, checked on the public register/),
  ).toBeVisible();
  await screenshot(agent, 'm2-agent-checks');

  // Someone who isn't staff doesn't even see the staff pages.
  await page.goto('/staff/checks');
  await expect(page.getByRole('heading', { name: 'Licence checks' })).toHaveCount(0);
  expect(admin).toBeTruthy();
  await agentContext.close();
  await staffContext.close();
});
