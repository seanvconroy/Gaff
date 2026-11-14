# Deploying Gaff: Vercel and Supabase

Gaff is one Next.js app on Vercel, with its functions in Dublin, and one Postgres database on Supabase, in Ireland ([ADR-0014](adr/0014-vercel-supabase-approved-vendors.md)).

This sets up the **test copy**, for the end-to-end test in [testing-guide.md](testing-guide.md):
- Real email goes to real addresses, through Resend. Mail to made-up addresses (`example.com`, `example.ie`, `.test`, `.example` and the like) goes to the Outbox page instead.
- Texts aren't sent: the mobile code shows on screen, and every text is in the Outbox.
- The AI and the ID and income checks are stand-ins.
- It's open to anyone with the address, never indexed, and has a banner saying it's the test copy. **Use made-up names and numbers.**

It takes about 20 minutes. Production uses the same steps with real providers; see [Production, later](#production-later).

## What you need

- **A Vercel account.** Hobby is fine for the test copy. Production needs Pro, because Hobby is for non-commercial use only.
- **A Supabase account.** The Free plan is fine for the test copy.
- **Access to the GitHub repository** `seanvconroy/Gaff`.

## 1. The database (Supabase)

1. **Create a project.** Name it `gaff-test` and choose the region **West EU (Ireland)**. Pick it by name: "Europe" can put the project in London or Zurich. Let Supabase generate the database password; Gaff doesn't use it.
2. **Create Gaff's role.**
   - When the project is ready, open **SQL Editor** and paste in [`scripts/db/supabase-setup.sql`](../scripts/db/supabase-setup.sql).
   - Replace `CHANGE-ME` with a new password of 32 or more letters and digits (for example from `openssl rand -hex 24`), then **Run**.
   - Keep the password for step 4.
3. **Switch off the Data API.** Go to **Integrations**, then **Data API**, and switch off **Enable Data API**. Gaff never uses it, so this closes a door nobody needs.
4. **Copy the connection address.**
   - Press **Connect** at the top of the project page, choose **Transaction pooler** (port 6543), and copy the URI. It looks like this:
     ```text
     postgresql://postgres.abcdefghijklmnop:[YOUR-PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres
     ```
   - Change `postgres.` at the very start to `gaff.`, and `[YOUR-PASSWORD]` to the password from step 2. Keep the host exactly as shown: projects sit on `aws-0-…` or `aws-1-…` and the two aren't interchangeable.
   - For example:
     ```text
     postgresql://gaff.abcdefghijklmnop:YourLongPassword123@aws-0-eu-west-1.pooler.supabase.com:6543/postgres
     ```
   - Use the transaction pooler, not the session pooler. Serverless functions hold connections open, and the session pooler allows only 15 at once on the Free plan. The deploy's migrations switch to session mode on their own, for one short connection.
   - That's your `DATABASE_URL`.

## 2. The app (Vercel)

1. **Import the project.** Choose **Add New**, then **Project**, and import `seanvconroy/Gaff`. Vercel finds Next.js and pnpm on its own.
2. **Add the settings.** Before deploying, open **Environment Variables** and add these, for **Production**:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the address from step 1.4 |
   | `AUTH_SECRET` | 32 or more random letters and digits |
   | `CRON_SECRET` | another 32 or more random letters and digits |
   | `GAFF_ENV` | `staging` |
   | `MARKETPLACE_PUBLIC` | `1`: renter sign-up, search and the public pages |
   | `EMAIL_PROVIDER` | `resend` |
   | `RESEND_API_KEY` | a Resend key with **sending access** only, limited to the sending domain (sensitive) |
   | `MAIL_FROM_DOMAIN` | a domain verified in Resend, in `eu-west-1`. The test copy borrows `avondale-square.com` until Gaff has its own (open question N2). |
   | `STORAGE_PROVIDER` | `database`: listing photos are kept in Postgres, so no storage buckets are needed |
   | `TEST_STAFF_EMAILS` | the founders' emails, separated by commas: they're testers (Gaff staff) from their first sign-in |

   For the random values, use a password manager's generator, or run `openssl rand -hex 32` in a terminal. Without `RESEND_WEBHOOK_SECRET`, the test copy sends email but doesn't receive it: replies go through the links in each email, and each email says so.
3. **Deploy.** The build applies the database migrations, seeds the made-up letters and homes ([`src/server/dev/seed.ts`](../src/server/dev/seed.ts)), then builds the app. The first build takes 5 to 8 minutes; later ones 3 to 5. The seed keeps what's there, tops up viewing times and confirms the made-up homes are still available. If it fails, the build carries on and the log says why.

**The real AI on the test copy (Q37).** To have Claude answer renters' questions, instead of the stand-in, add these too, then redeploy:

| Name | Value |
| --- | --- |
| `AI_PROVIDER` | `anthropic`: the Claude API, with the founders' credits. Made-up data only |
| `ANTHROPIC_API_KEY` | a key from the Claude Console, for a workspace holding the credits (sensitive) |
| `AI_MONTHLY_BUDGET_USD` | `90`: past it, the AI pauses for the month and people answer instead |

At 80% of the budget, Gaff's admins get an email. Every call is logged in `ai_calls`, without its text. To stop one task straight away, set `AI_TASKS_OFF` (for example `answers`) and redeploy.

The test copy deploys the branch `claude/epic-ride-0ha68s` as production. To have every push to it deploy on its own, set it in **Settings**, **Environments**, **Production**, under **Branch Tracking**. Otherwise, redeploy from the latest commit.

## 3. Check it works

1. **Health.** Open `https://<your-project>.vercel.app/api/health`, using the address under **Domains** on the project page.
   - It should say `{"ok":true}`.
   - If it doesn't, it names the problem:

   | It says | What to do |
   | --- | --- |
   | `"settings": ["CRON_SECRET"]` (or another name) | That setting is missing or too short. Add it, then redeploy. |
   | `"database": "28P01"` | The password in `DATABASE_URL` is wrong. |
   | `"database": "XX000"` | The user name should be `gaff.` followed by your project's reference. |
   | `"database": "42P01"` | The tables aren't there. Check the build log for the migration step. |

2. **Sign in.** Open the app and sign in with your own email. The link arrives in your inbox; check spam the first time.
3. **The daily job.** In Vercel, **Settings**, then **Cron Jobs**, shows `/api/cron/daily` once a day.

## 4. The minute tick (Supabase)

In Supabase's **SQL Editor**, run [`scripts/db/supabase-tick.sql`](../scripts/db/supabase-tick.sql). It needs three things:
- the app's address;
- the same `CRON_SECRET` as in Vercel;
- the project's **Protection Bypass for Automation** secret, from Vercel's **Settings**, then **Deployment Protection** (only needed while Vercel Authentication covers production).

From then on, Supabase calls the app every minute to run anything due. You can see it in **Integrations**, then **Cron**, as `gaff-tick`, with its history.

Then follow [testing-guide.md](testing-guide.md) from step 1.

## How background jobs run on Vercel

There's no always-on worker. Jobs wait in the database and run in two ways:
- **Straight after the action that queued them.** Sending a reply, reading an enquiry or drafting an answer happens within seconds.
- **On the minute tick.** Supabase Cron calls `/api/cron/tick` every minute with `CRON_SECRET`, on any Vercel plan. That runs anything due, such as reminders, offer deadlines and chasers.
- **Once a day.** At 02:30 UTC, Vercel Cron and Supabase Cron both call `/api/cron/daily`, which queues the retention job (R26). Whichever comes first queues it, and the other finds it already queued.

Each run stops once nothing is left, or after 45 seconds, and lets running jobs finish first.

Locally, `pnpm worker` does the same job continuously (see `CLAUDE.md`).

## 5. Listing photos (Supabase Storage, for production)

The test copy keeps listing photos in Postgres (`STORAGE_PROVIDER=database`), which is fine for a few dozen homes. Production keeps them (M43) in Supabase Storage, next to the database:

1. In the Supabase project, open **Storage** and create two buckets:
   - `uploads`, **private**: originals waiting to be checked;
   - `listing-photos`, **public**: the cleaned, resized copies renters see.
2. Open **Project Settings**, then **API Keys**, and copy the **service role** key. It's a secret: it only ever goes into Vercel's settings.
3. In Vercel, add these settings and redeploy:

   | Setting | Value |
   | --- | --- |
   | `STORAGE_PROVIDER` | `supabase` |
   | `SUPABASE_URL` | the project URL, like `https://abcdefghijklmnop.supabase.co` |
   | `SUPABASE_SERVICE_KEY` | the service role key |

## 6. The search map (Google Maps, for production)

Renters see homes on Google's map beside the list, and letters place each home's pin on it in the listing editor ([ADR-0027](adr/0027-places-index-on-google-maps.md), Q58; the [live map PRD](marketplace/map/prd.md) and [technical specification](marketplace/map/tech-spec.md)). Until it's set up, the test copy shows a stand-in map drawn from Gaff's own data, marked "Test map: not Google Maps", and production shows the list alone and asks for no pin. The map uses the **Maps JavaScript API only**, showing Gaff's own homes. Place suggestions never come from Google (see the next section).

### Setting it up

1. **Three projects (live map PRD, S9).** In the Google Cloud console, under Gaff's billing account, create `gaff-maps-production`, `gaff-maps-test` and `gaff-maps-ci`, with both founders as owners. In each, enable the **Maps JavaScript API** and nothing else. Separate projects keep each copy's cap, bill and key apart.
2. **A key for each project.** Under **Keys & Credentials**, create one API key in each project. Restrict it to the **Maps JavaScript API**, and to **Websites**. Gaff tells Google its site's origin and nothing more (`auth_referrer_policy=origin`), so each key lists its site twice: on its own, with no path, and with `/*`:

   | Key | Websites |
   | --- | --- |
   | Production | `https://<Gaff's domain>` and `https://<Gaff's domain>/*` |
   | The test copy | `https://gaff-test.vercel.app` and `https://gaff-test.vercel.app/*` |
   | The test run | `http://localhost:3100` and `http://localhost:3100/*` |

   The key is in every page that shows the map, so these restrictions and the cap are what protect it. Preview copies have no key: they show the stand-in map, whatever their settings say.

3. **Map IDs and styles.** Under **Map management**, create a **JavaScript**, **Vector** Map ID in each project. Under **Map styles**, create a style from this table and attach it to the Map ID. The colours come from `docs/design-tokens.json`: when those tokens change, change the styles by hand. A second Map ID with the dark column is optional: without it, the map stays light in both themes.

   | Map feature | Token | Light | Dark |
   | --- | --- | --- | --- |
   | Land | `surface-2` | `#ede6da` | `#202836` |
   | Water | `sky` | `#c9d8ea` | `#24334b` |
   | Roads | `border` | `#d8cfc0` | `#2c3544` |
   | Labels | `ink-muted` | `#4a5262` | `#b3bccb` |
   | Label outlines | `surface-1` | `#fffdf9` | `#171d28` |
   | Businesses and other points of interest | hidden | | |
   | Transport lines and stations | shown, in Google's colours | | |

4. **Caps and budget.** In each project, under **Quotas**, cap the Maps JavaScript API's map loads per day: 100 for the test run, and the figures in [launch-checklist.md](launch-checklist.md) for the others. On the billing account, set budget alerts at 50%, 80% and 100% of the monthly budget (live map PRD, S1), to both founders.
5. **In Vercel**, add these settings for the copy, then redeploy. The redeploy matters: the map pages' content security policy, and the rule that they're entered and left with a full page load, are set when the app is built.

   | Setting | Value |
   | --- | --- |
   | `MAP_PROVIDER` | `google` |
   | `GOOGLE_MAPS_API_KEY` | the key for this copy |
   | `GOOGLE_MAPS_MAP_ID` | the Map ID |
   | `GOOGLE_MAPS_MAP_ID_DARK` | the dark Map ID, if there is one |
   | `GOOGLE_MAPS_VERSION` | `quarterly` (the default: Google's script changes least often) |

6. **In GitHub**, under **Settings**, **Secrets and variables**, **Actions**, add the test run's key as the secret `GOOGLE_MAPS_TEST_KEY`, and its Map IDs as the variables `GOOGLE_MAPS_TEST_MAP_ID` and `GOOGLE_MAPS_TEST_MAP_ID_DARK`. Then run **The real map** from the **Actions** tab.
7. **Check it.**
   - Search for a place with homes. The map shows a pin with each home's rent, and Google's logo and terms are in sight along its bottom edge.
   - The browser console shows no `RefererNotAllowedMapError`, and no content security policy errors other than Google's fonts, which Gaff blocks on purpose (the map's buttons use the page's own).
   - Open a home from the list, then go back: each is a full page load, and the map draws again.
   - In a listing's editor, **Where it is** shows the same map with the home's pin.
   - Turn the network off and reload: the map's place says "The map isn't available right now. Every home is still in the list."
   - `/staff/map` counts the map being opened and shown.

**The first time, with real keys.** Two things have only been read in Google's documentation, not seen: that a key restricted as in step 2 is accepted with only the origin sent, and that a project over its daily cap shows Google's development-mode map (which Gaff replaces with its own sentence, counted as `google`). Check both on `gaff-maps-ci`, by running the real-map tests with its key and then with its cap set to 1, and correct this page if either is different.

### How it behaves

- **Google's script runs only on the search pages and a listing's editor.** A page's content security policy comes with its document, so going between one of those pages and any other is a full page load, in both directions. Google's script is never loaded on a page where renters or letters enter personal details, and it goes when the page does.
- **Nothing is asked of Google until the map is wanted:** on a computer, once the page has loaded and the map is on screen; on a phone, when the renter opens the map. Robots get no map.
- **Google is told the site's origin,** never the page's address, which names the place a renter searched. Every page sends `Referrer-Policy: no-referrer`.
- **A map that can't load never takes the page with it.** The list carries on, and the listing editor says the pin can't be placed just now.

### Looking after it

- **When the map can't load.** `/staff/map` counts each day's opens and failures, with nothing about the renter. When more than 1 in 20 opens fail on a day with 50 or more, Gaff's admins get an email the next morning. The count says why:

  | Count | What happened | What to do |
  | --- | --- | --- |
  | `script` | Google's script didn't arrive | A few are renters' own blockers. Many at once: check the copy was redeployed after `MAP_PROVIDER` changed |
  | `auth` | Google refused the key | Check the key, its two website entries, its API restriction and the project's billing |
  | `google` | Google drew its own error | The daily cap was reached, or billing is off |
  | `timeout` | No map appeared in 10 seconds | Slow connections. Many at once: look at Google's status page |
  | `error` | The map's code threw an error | A change in Google's script, or a bug in Gaff's: run the real-map tests |

- **Turning the map off (M135).** Set `MAP_PROVIDER=none` in Vercel and redeploy: a few minutes. The list fills the page, and listings go live without a pin. Set it back to `google` and redeploy to restore it; letters are then asked for the pins that are missing.
- **Rotating a key.** Create a new key with the same restrictions, set it in Vercel and redeploy, check the map, and delete the old key the next day.
- **If a key turns up elsewhere.** The website restriction turns other sites away in a browser, but a referrer can be faked outside one, so the daily cap is the backstop. If billed map loads rise while `/staff/map`'s opens don't, rotate the key.
- **Every month.** Compare Google's billed map loads with `/staff/map` (they should agree to within a tenth), look at the caps, and read any notice from Google about its terms or its script. Google emails the billing contact.
- **Every live home has a pin.** In Supabase's SQL editor, this should return 0. Any others are homes published before pins were asked for: their letters see "Place the pin" on their Today list.

  ```sql
  select count(*) from public_listings
  where status in ('live', 'enquiries_closed') and not on_map;
  ```

### Testing the real map

The journeys in `tests/e2e` use the stand-in map. Google's real map has its own run (M136), in a production build:

```bash
pnpm build:map && pnpm test:map
```

- **Without a key** it shows that only the map's pages let Google in, that nothing leaves for another site before the map is wanted, that the map's pages are entered and left with new documents, and that every way the map can fail (a blocked script, a script that never answers, a refused key, Google's development-mode map, a map that never finishes starting) ends in Gaff's sentence with the page whole. Some of these ask Google for its real script, so they need the internet.
- **With the test run's key** (`GOOGLE_MAPS_TEST_KEY=<the key> pnpm test:map`) it also draws the real map on a computer, on a phone and in the listing editor: pins and clusters by name, the map staying where the renter leaves it, an area drawn, a pin placed, Google's logo and terms uncovered, the content security policy kept, and nothing of the search sent to Google. Screenshots go to `screenshots/google` for a person to look over.
- **The real map** workflow runs both every night on the `quarterly` and `weekly` channels, on demand, and when the map's code changes. The weekly run is the warning of what the next quarter's script will bring.
- Run `pnpm build` afterwards: `pnpm build:map` leaves a build with Google's policy in `.next`.

Before a release that changes the map, also go through the [manual check list](marketplace/map/tech-spec.md#testing): the browsers, screens, settings and assistive technology a script can't judge.

## 7. The place index (towns, streets and landmarks)

The Where box suggests places from Gaff's own place index, the `places` table ([ADR-0027](adr/0027-places-index-on-google-maps.md)). It needs Postgres's `pg_trgm` extension, which the deploy's migrations add. If a migration stops with "pg_trgm is missing", enable **pg_trgm** in Supabase (**Database**, **Extensions**, in the `public` schema), then deploy again.

- **Loading.** Each production deploy runs `pnpm places:load --deploy`. It loads `data/places/places.ndjson.gz` when that file's version is newer than the one in the database, all in one transaction. Without the file, an empty index gets the fixture: the places Gaff started with, typed by hand, and a few streets and landmarks. Preview deployments leave the index alone.
- **Building.** The file comes from OpenStreetMap, through Geofabrik's Ireland extract. Rebuild it every quarter, or when the misses below show gaps:
  1. Install `osmium-tool` (for example `apt-get install osmium-tool` or `brew install osmium-tool`).
  2. Run `pnpm places:build`. It downloads the extract (about 300 MB) and writes the file. Its version is the hour it was built (2026110819), and always above the file it replaces, so the next deploy loads it.
  3. Run `pnpm places:check`. It tests the file against the places renters must find, in `scripts/places/test-set.csv`.
  4. Commit the file. The next deploy loads it.

  The GitHub workflow **Build the place index** does the same on GitHub and opens a pull request with the new file.
- **Attribution.** The data is © OpenStreetMap contributors (ODbL 1.0); the Where box says so under its suggestions.
- **Misses.** What renters typed that matched nothing is counted by day in `place_misses`, with no digits, user or device, and deleted after 30 days. The most common misses are the places to add as aliases.

## Good to know

- **Who can open what.** In **Settings**, **Deployment Protection**, Vercel Authentication covers **preview deployments only**: the test copy itself is open, so both testers can use it on any device, and previews (which share its database) stay private. The Outbox and test inbox are for testers only, and the Outbox holds only made-up people's mail. The test copy is never indexed: every page says `noindex` and `robots.txt` disallows everything.
- **Testers** are Gaff staff on the test copy. The founders in `TEST_STAFF_EMAILS` are admins from their first sign-in; an admin adds others at `/staff/testers`. Production has no such page: staff are added with `pnpm staff:add`.
- **Email limits:** Resend's free plan sends 100 emails a day and 3,000 a month.
- **Preview deployments** of other branches share the test database but never migrate it.
- **Logs:** Vercel shows function logs per request. They hold IDs and counts, never personal data.
- **Seeing the data:** Supabase's **Table Editor** shows Gaff's tables. Remember it's the test copy: made-up details only.

## Production, later

Before the first real renter (see [launch-checklist.md](launch-checklist.md)):

- **Separate projects.** Use a separate Supabase project in Ireland, on a paid plan with point-in-time recovery, and a separate Vercel project with Gaff's own domain.
- **Settings:**

  | Setting | Value |
  | --- | --- |
  | `GAFF_ENV` | `production` |
  | `APP_URL` | the domain, e.g. `https://app.gaff.ie` |
  | `DATA_ENCRYPTION_KEY` | `openssl rand -base64 32` |
  | `DATABASE_CA_CERT` | the whole certificate from Supabase, **Database Settings**, **SSL Configuration**, **Download certificate**. With it, the database's certificate is checked. |
  | `EMAIL_PROVIDER` | `resend` |
  | `RESEND_API_KEY` | from Resend |
  | `RESEND_WEBHOOK_SECRET` | from Resend |
  | `INBOUND_DOMAIN` | e.g. `in.gaff.ie` |
  | `MAIL_FROM_DOMAIN` | e.g. `mail.gaff.ie` |
  | SMS | the Sinch settings |
  | `AI_PROVIDER` | `bedrock`: Claude on Bedrock in Dublin, in-region, with invocation logging off. Production refuses the Claude API (Q37) |
  | `AWS_REGION` | `eu-west-1`, with AWS keys scoped to Bedrock in that region |
  | `AI_MONTHLY_BUDGET_USD` | the founders' monthly limit |
  | `IDENTITY_PROVIDER` | `stripe`, with `STRIPE_SECRET_KEY` and `STRIPE_IDENTITY_WEBHOOK_SECRET` (Q48) |
  | `INCOME_PROVIDER` | `none`, until work and income documents replace the income check (P30) |
  | `STORAGE_PROVIDER`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | as in [step 5](#5-listing-photos-supabase-storage) |

  Production refuses to start with a stand-in or without the encryption key.
- **Resend:**
  - Add the sending domain in region `eu-west-1`, with open and click tracking off, and add its SPF and DKIM records.
  - Turn on receiving for the inbound subdomain and add its MX record.
  - Add a webhook for `email.received` pointing at `https://<domain>/api/inbound/resend`, and copy its signing secret.
- **Supabase:** turn on **Enforce SSL**.
- **DPAs:** sign them with Vercel, Supabase and Resend (Q26).
