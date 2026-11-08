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

Renters see homes on Google's map beside the list ([ADR-0027](adr/0027-places-index-on-google-maps.md), Q58). Until it's set up, the test copy shows a stand-in map drawn from Gaff's own data, marked "Test map: not Google Maps", and production shows the list alone. The map uses the **Maps JavaScript API only**, showing Gaff's own homes. Place suggestions never come from Google (see the next section).

1. **A project.** In the Google Cloud console, create a project in Gaff's name, with a billing account, and enable the **Maps JavaScript API** and nothing else. Set the budget alerts and quota cap in [launch-checklist.md](launch-checklist.md).
2. **A key for each copy.** Under **Keys & Credentials**, create an API key for production and another for the test copy. Restrict each to **Websites** (HTTP referrers: its own address, such as `https://gaff-test.vercel.app/*`) and to the **Maps JavaScript API**. The key is in every search page, so these restrictions are what protect it.
3. **Map IDs.** Under **Map management**, create a **JavaScript**, **Vector** Map ID. Under **Map styles**, create a style that hides points of interest (businesses) and keeps transit, and attach it to the Map ID. A second Map ID with a dark style is optional.
4. **In Vercel**, add these settings, then redeploy (the search pages' content security policy is set when the app is built):

   | Setting | Value |
   | --- | --- |
   | `MAP_PROVIDER` | `google` |
   | `GOOGLE_MAPS_API_KEY` | the key for this copy |
   | `GOOGLE_MAPS_MAP_ID` | the Map ID |
   | `GOOGLE_MAPS_MAP_ID_DARK` | the dark Map ID, if there is one |

5. **Check it.** Search for a place with homes: the map shows a pin with each home's rent, and Google's logo and terms are visible. The browser console should show no content security policy errors other than Google's font, which Gaff blocks on purpose (the map's buttons use the page's own font).

## 7. The place index (towns, streets and landmarks)

The Where box suggests places from Gaff's own place index, the `places` table ([ADR-0027](adr/0027-places-index-on-google-maps.md)). It needs Postgres's `pg_trgm` extension, which the deploy's migrations add. If a migration stops with "pg_trgm is missing", enable **pg_trgm** in Supabase (**Database**, **Extensions**, in the `public` schema), then deploy again.

- **Loading.** Each production deploy runs `pnpm places:load --deploy`. It loads `data/places/places.ndjson.gz` when that file's version is newer than the one in the database, all in one transaction. Without the file, an empty index gets the fixture: the places Gaff started with, typed by hand, and a few streets and landmarks. Preview deployments leave the index alone.
- **Building.** The file comes from OpenStreetMap, through Geofabrik's Ireland extract. Rebuild it every quarter, or when the misses below show gaps:
  1. Install `osmium-tool` (for example `apt-get install osmium-tool` or `brew install osmium-tool`).
  2. Run `pnpm places:build`. It downloads the extract (about 300 MB) and writes the file, with its version as the date.
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
  | AI | the Bedrock settings and AWS keys |
  | `IDENTITY_PROVIDER`, `INCOME_PROVIDER` | `none` |
  | `STORAGE_PROVIDER`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | as in [step 5](#5-listing-photos-supabase-storage) |

  Production refuses to start with a stand-in or without the encryption key.
- **Resend:**
  - Add the sending domain in region `eu-west-1`, with open and click tracking off, and add its SPF and DKIM records.
  - Turn on receiving for the inbound subdomain and add its MX record.
  - Add a webhook for `email.received` pointing at `https://<domain>/api/inbound/resend`, and copy its signing secret.
- **Supabase:** turn on **Enforce SSL**.
- **DPAs:** sign them with Vercel, Supabase and Resend (Q26).
