import { devices, expect, test } from '@playwright/test';
import {
  createLettingThroughUi,
  expectAccessible,
  expectNoSidewaysScroll,
  getChecked,
  goLiveThroughUi,
  latestLinkFor,
  screenshot,
  signUpLandlord,
} from './support';

const PIN_MAP = 'Map for placing the home’s pin';

test('M38, M126: a letter places the home’s pin with the buttons, the keys and a tap, and is asked about a pin outside the area', async ({
  page,
}) => {
  test.slow();
  await signUpLandlord(page);
  await getChecked(page);
  await createLettingThroughUi(page, '40 Highfield Road', '', 'Rathgar, Dublin 6');
  await goLiveThroughUi(page);
  await page.getByRole('link', { name: 'Listing', exact: true }).click();

  // The listing can't go live until the pin is placed, and the checklist says where to do it.
  const checklist = page.getByRole('listitem').filter({ hasText: 'Place the pin on the map' });
  await expect(checklist.getByRole('link', { name: 'Where it is' })).toHaveAttribute(
    'href',
    '#location',
  );

  // The pin starts on the address's street, from Gaff's own place index: no address service.
  const where = page.getByRole('region', { name: 'Where it is' });
  await expect(
    where.getByText('The pin starts on Highfield Road, from the address. Move it to the home.'),
  ).toBeVisible();
  await expect(where.getByText('The pin is on Highfield Road, in Rathgar.')).toBeVisible();
  await expect(where.getByText('The pin isn’t placed yet.')).toBeVisible();
  await expectAccessible(page);

  // Without dragging: a step at a time with the buttons, then with the arrow keys on the pin.
  await where.getByRole('button', { name: 'Move the pin up' }).click();
  await expect(where.getByText('The pin has moved. Save the location to keep it.')).toBeVisible();
  const pin = where.getByRole('button', { name: 'The home’s pin' });
  const before = await pin.boundingBox();
  await pin.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(async () => (await pin.boundingBox())!.x).toBeGreaterThan(before!.x + 20);
  await expect(where.getByText('The pin is on Highfield Road, in Rathgar.')).toBeVisible();
  await screenshot(page, 'm38-pin');

  await where.getByRole('button', { name: 'Save the location' }).click();
  await expect(where.getByText('Saved. Renters see the home here on the map.')).toBeVisible();
  await expect(page.getByText('Place the pin on the map')).toHaveCount(0);

  // It's kept: the page comes back with the pin placed, and nothing left to ask.
  await page.reload();
  await expect(where.getByText('The pin is on Highfield Road, in Rathgar.')).toBeVisible();
  await expect(where.getByText('The pin isn’t placed yet.')).toHaveCount(0);

  // M126: a tap on the map moves the pin there. Far outside Rathgar, Gaff asks, and keeps it.
  const map = where.getByRole('group', { name: PIN_MAP });
  for (let i = 0; i < 3; i++) await where.getByRole('button', { name: 'Zoom out' }).click();
  const box = (await map.boundingBox())!;
  await map.click({ position: { x: box.width - 40, y: box.height / 2 } });
  await where.getByRole('button', { name: 'Save the location' }).click();
  await expect(where.getByText(/the address says/)).toBeVisible();
  await expect(
    where.getByText(/Is that right\? If it is, there’s nothing more to do\./),
  ).toBeVisible();
  await expect(where.getByText('Saved. Renters see the home here on the map.')).toBeVisible();
  await expectAccessible(page);
  await screenshot(page, 'm38-pin-outside');
});

test('M38: on a phone, a letter places the pin with a tap', async ({ browser, page }) => {
  test.slow();
  const email = await signUpLandlord(page);
  await getChecked(page);
  await createLettingThroughUi(page, '12 Castle Street', '', 'Dalkey, Co. Dublin');
  await goLiveThroughUi(page);
  const listing = page.url().replace(/\/(viewings|criteria|rent-check|comparables).*$/, '');

  const phone = await browser.newContext({
    ...devices['Pixel 7'],
    locale: 'en-IE',
    timezoneId: 'Europe/Dublin',
  });
  const mobile = await phone.newPage();
  await mobile.goto('/sign-in');
  await mobile.getByLabel('Your email address').fill(email);
  await mobile.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(mobile.getByText('Check your email')).toBeVisible();
  await mobile.goto(await latestLinkFor(email));
  await mobile.goto(`${new URL(listing).pathname.replace(/\/$/, '')}/listing`);

  // The fixture's place index doesn't hold this street, so the pin starts in the area's middle.
  const where = mobile.getByRole('region', { name: 'Where it is' });
  await expect(
    where.getByText('The pin starts in the middle of the area. Move it to the home.'),
  ).toBeVisible();
  await expect(where.getByText('The pin is in Dalkey.')).toBeVisible();
  const map = where.getByRole('group', { name: PIN_MAP });
  await map.scrollIntoViewIfNeeded();
  const pin = where.getByRole('button', { name: 'The home’s pin' });
  const before = (await pin.boundingBox())!;
  await map.tap({ position: { x: 60, y: 90 } });
  await expect.poll(async () => (await pin.boundingBox())!.x).toBeLessThan(before.x - 20);
  await where.getByRole('button', { name: 'Save the location' }).tap();
  await expect(where.getByText('Saved. Renters see the home here on the map.')).toBeVisible();
  await expectAccessible(mobile);
  await expectNoSidewaysScroll(mobile);
  await screenshot(mobile, 'm38-pin-phone');
  await phone.close();
});
