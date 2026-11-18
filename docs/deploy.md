# Deploying Gaff: Vercel and Supabase

Gaff is one Next.js app on Vercel, with its functions in Dublin, and one Postgres database on Supabase, in Ireland ([ADR-0014](adr/0014-vercel-supabase-approved-vendors.md)).

This sets up the **test copy**, for the end-to-end test in [testing-guide.md](testing-guide.md):
- Emails and texts aren't sent. They appear on the Outbox page.
- The AI and the ID and income checks are stand-ins.
- **Use made-up details only.**

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
2. **Add the settings.** Before deploying, open **Environment Variables** and add these four:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the address from step 1.4 |
   | `AUTH_SECRET` | 32 or more random letters and digits |
   | `CRON_SECRET` | another 32 or more random letters and digits |
   | `STAFF_EMAILS` | the founders' sign-in emails, separated by commas. They can open `/internal/agencies` and `/internal/funnels`; nobody else can |
   | `GAFF_ENV` | `staging` |

   For the random values, use a password manager's generator, or run `openssl rand -hex 32` in a terminal.
3. **Deploy.** The build applies the database migrations first, then builds the app. It takes 3 to 5 minutes.

Vercel deploys the repository's default branch, `claude/gaff-mvp`, as production. You can check this in **Settings**, **Environments**, **Production**, under **Branch Tracking**. Every push to that branch deploys again.

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

2. **Sign in.** Open the app and sign in with a made-up email, then enter the six-digit code from the email in `/dev/outbox`.
3. **The daily job.** In Vercel, **Settings**, then **Cron Jobs**, shows `/api/cron/daily` once a day.

## 4. The minute tick (Supabase)

In Supabase's **SQL Editor**, run [`scripts/db/supabase-tick.sql`](../scripts/db/supabase-tick.sql). It needs three things:
- the app's address;
- the same `CRON_SECRET` as in Vercel;
- the project's **Protection Bypass for Automation** secret, from Vercel's **Settings**, then **Deployment Protection**.

From then on, Supabase calls the app every minute to run anything due. You can see it in **Integrations**, then **Cron**, as `gaff-tick`, with its history.

Then follow [testing-guide.md](testing-guide.md) from step 1.

## How background jobs run on Vercel

There's no always-on worker. Jobs wait in the database and run in two ways:
- **Straight after the action that queued them.** Sending a reply, reading an enquiry or drafting an answer happens within seconds.
- **On the minute tick.** Supabase Cron calls `/api/cron/tick` every minute with `CRON_SECRET`, on any Vercel plan. That runs anything due, such as reminders, offer deadlines and chasers.
- **Once a day.** At 02:30 UTC, Vercel Cron and Supabase Cron both call `/api/cron/daily`, which queues the retention job (R26). Whichever comes first queues it, and the other finds it already queued.
- **Once a week.** The same daily call queues the refresh of the PSRA register when Gaff's copy is a week old, or has never been loaded. So a new database gets its register within a day, with nothing to do.

Each run stops once nothing is left, or after 45 seconds, and lets running jobs finish first.

Locally, `pnpm worker` does the same job continuously (see `CLAUDE.md`).

## The PSRA register

An agency finds itself by name on Gaff's copy of the PSRA's register of licensed property services providers, and Gaff checks every agency against it each week (UX-AG-1, UX-AG-6, Q39). The copy holds businesses licensed to let and nothing else.

- **The test copy uses a made-up register.** `PSRA_REGISTER_SOURCE` is `sample` unless set. Its agencies are invented (Halcyon Lettings, Rowan & Byrne and ten more), so anyone testing can pick one. A founder still has to press Confirm on `/internal/agencies` before its homes go live.
- **Production uses the real one.** Set `PSRA_REGISTER_SOURCE` to `url` and `PSRA_REGISTER_URL` to the address of the register's download. Production refuses to start with the sample.
- **Check the format first.** The reader was written without sight of the real file. It expects a CSV in UTF-8 with these columns, in any order: `Licence Number`, `Licensee Name`, `Trading Name`, `Licence Type`, `Licence Category` and `County`. `src/domain/register/parse.ts` says exactly what it accepts. Before the first real refresh, someone must:
  1. Download the register from psr.ie and compare it with that list: the file type, the column names, how a licence type is written (the reader knows Company, Partnership, Sole Trader, Independent Contractor, Principal Officer and Employee), and how the categories are written (it expects the letters A to D, where C is letting).
  2. Check which rows are businesses. The reader keeps a company, a partnership or a sole trader, and drops everyone else without storing them. If the real file tells them apart another way, change `licenceTypes` in that file and its tests.
  3. If the download is a spreadsheet and not a CSV, either point `PSRA_REGISTER_URL` at a CSV copy kept up to date, or add a reader for the spreadsheet. Nothing reads a spreadsheet today.
  4. Read the PSRA's re-use terms and check that the credit shown where an agency is picked meets them.
- **If the file isn't what's expected, the refresh fails loudly** and Gaff's copy stays as it was. The log names the row and the column, never what the row said. A file that has lost more than half of its businesses is refused too, so a download cut short can't tell every agency its licence has lapsed.
- **What a lapse does.** An agency missing from a week's register is marked lapsed and its admins are emailed. Its live lettings carry on. No new one goes live until the register lists it again.

## Good to know

- **Vercel's sign-in protects the test copy.** New Vercel projects ask for a Vercel sign-in on every `vercel.app` address, so only you can open the test copy and its Outbox, which shows every email, sign-in codes included. Keep it on. Sign in to Vercel once on your phone too. The minute tick passes it with the project's automation bypass secret. Production, on Gaff's own domain, is open to renters and has no Outbox.
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
  | `PSRA_REGISTER_SOURCE`, `PSRA_REGISTER_URL` | `url`, and the address of the PSRA register's download, once its format has been checked (see "The PSRA register") |
  | `ADDRESS_SEARCH` | `off`: the address is typed into the manual fields. Autoaddress is added once its DPA is signed (Q40) |
  | `ADVERT_READER` | `on` (the default): a pasted advert is read with the AI provider above, Claude on Bedrock in the EU. `off`: adding a letting offers only "Fill it in myself". Nothing is ever fetched from a link (Q31) |
  | `PHOTO_STORE`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PHOTO_BUCKET` | `supabase`, the project's address (`https://<ref>.supabase.co`), its service-role key, and the bucket for homes' photos (`homes` unless set). Create the bucket as **private** in the Ireland project: browsers load photos from Gaff's own address, which reads them from the bucket. Photos of homes only, never anything personal |
  | `SEARCH_INDEXING` | `on`, in production only: search engines may index live homes' public pages (UX-LS-11). Leave it unset (`off`) on staging and preview deployments, so a test copy is never found. It is read at build time too, so redeploy after changing it |
  | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from a Google OAuth client (web application), with the redirect URI `https://<domain>/api/auth/callback/google`. Without both, "Continue with Google" isn't shown |
  | `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET` | Apple's Services ID and client secret, with the return URL `https://<domain>/api/auth/callback/apple`. Apple accepts a client secret for six months at most, so renew it. Without both, "Continue with Apple" isn't shown |

  Production refuses to start with a stand-in or without the encryption key. Sign-in by email code and by passkey needs no setting ([ADR-0015](adr/0015-sign-in-google-apple-codes-passkeys.md)). A passkey belongs to the domain in `APP_URL`, so settle the domain before people add them.
- **Apple:** register the sending domain (`MAIL_FROM_DOMAIN`) with "Sign in with Apple", so "Hide My Email" addresses can be reached.
- **Resend:**
  - Add the sending domain in region `eu-west-1`, with open and click tracking off, and add its SPF and DKIM records.
  - Turn on receiving for the inbound subdomain and add its MX record.
  - Add a webhook for `email.received` pointing at `https://<domain>/api/inbound/resend`, and copy its signing secret.
- **Supabase:** turn on **Enforce SSL**.
- **DPAs:** sign them with Vercel, Supabase and Resend (Q26).
