# Deploying Gaff: Vercel and Supabase

Gaff is one Next.js app on Vercel, with its functions in Dublin, and one Postgres database on Supabase, in Ireland ([ADR-0014](adr/0014-vercel-supabase-approved-vendors.md)).

This sets up the **test copy**, for the end-to-end test in [testing-guide.md](testing-guide.md):
- **Email is real** for real addresses, through Resend with a send-only key. Mail to made-up addresses (`example.com`, `example.ie`, `.test`, `.example` and the like) goes to the Outbox instead. Replies by email can't be received, so each email that would invite a reply says to use its link instead.
- Texts aren't sent; they appear on the Outbox page. The ID and income checks are stand-ins. The AI is a stand-in too, unless you give it the Claude API's key (see [The AI](#the-ai)).
- It's open to anyone with the address, never indexed, and every page has a banner saying it's the test copy. The Outbox, the test inbox and the stand-in checks are for Gaff's own team only (`STAFF_EMAILS`); anyone else gets "not found". There is no stand-in for Google or Apple: without their real keys, their buttons aren't shown.
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
2. **Add the settings.** Before deploying, open **Environment Variables** and add these:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the address from step 1.4 |
   | `AUTH_SECRET` | 32 or more random letters and digits |
   | `CRON_SECRET` | another 32 or more random letters and digits |
   | `STAFF_EMAILS` | the founders' sign-in emails, separated by commas. They can open `/internal/agencies`, `/internal/funnels`, the Outbox and the test inbox; nobody else can. On the test copy alone, `TEST_STAFF_EMAILS` (the older name) is read as part of the same list |
   | `GAFF_ENV` | `staging` |
   | `EMAIL_PROVIDER` | `resend` |
   | `RESEND_API_KEY` | a Resend key with **sending access** only, limited to the sending domain |
   | `MAIL_FROM_DOMAIN` | a domain verified in Resend, in `eu-west-1` |
   | `TEST_EMAIL_RECIPIENTS` | optional: real email goes only to these addresses, or `@domain` for a whole domain, separated by commas; everyone else's goes to the Outbox. Unset, every real address gets real email |

   For the random values, use a password manager's generator, or run `openssl rand -hex 32` in a terminal. Without `RESEND_WEBHOOK_SECRET` (and a real `INBOUND_DOMAIN` with receiving set up), the test copy sends email but doesn't receive it: replies go through the links in each email, and each email says so. Production refuses `TEST_EMAIL_RECIPIENTS` and `TEST_STAFF_EMAILS`.

   **Keep real email on.** The Outbox is closed to strangers only where email is really sent. With `EMAIL_PROVIDER` left at `dev`, every email, sign-in codes included, sits in an Outbox anyone can open, which is only safe behind Vercel's own sign-in (see "Good to know").

   To try the real model, add the settings in [The AI](#the-ai) too. Without them, a stand-in answers.
3. **Deploy.** The build applies the database migrations first, then loads the place index (below), then builds the app. It takes 3 to 5 minutes; the first deploy with the place index takes about half a minute more.

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

2. **Sign in.** Open the app and sign in with your own email (one in `STAFF_EMAILS`), then enter the six-digit code from the email in your inbox. Then open `/dev/outbox`: it should open for you, and say "not found" in a private window.
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

## The AI

Gaff's AI does three tasks: it answers renters' questions from a letting's facts (`answers`), reads a pasted advert into a letting (`advert`), and reads an operator's question about who has enquired (`people`). All three go through one adapter and one log ([ADR-0017](adr/0017-one-ai-provider-with-usage-budget-and-switches.md)). Where it can't help, people take over: questions go to the letting team, the advert is filled in by hand, and the people question gets its fixed reply.

- **The test copy and development use the Claude API**, with the founders' credits and made-up details only. Production refuses it: real renters' data never goes there.

  | Name | Value |
  | --- | --- |
  | `AI_PROVIDER` | `anthropic` |
  | `ANTHROPIC_API_KEY` | a key from the Claude Console, for this test copy alone |

- **Production uses Claude on Amazon Bedrock in Dublin**, with invocation logging off.

  | Name | Value |
  | --- | --- |
  | `AI_PROVIDER` | `bedrock` |
  | `AWS_REGION` | `eu-west-1` |
  | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | an IAM user allowed to call Bedrock in `eu-west-1` and nothing else |

- **Either way:**

  | Name | Value |
  | --- | --- |
  | `AI_MODEL` | `claude-opus-5-5` unless set. Bedrock adds its `anthropic.` prefix itself. Change it only once that task's evals pass on the new model |
  | `AI_MONTHLY_BUDGET_USD` | the month's AI spend, in US dollars, `100` unless set. At 80%, everyone on `STAFF_EMAILS` gets one email. At 100%, the AI pauses until the 1st of next month, or until you raise this and redeploy |
  | `AI_TASKS_OFF` | tasks to switch off without a code change, separated by commas: `answers`, `advert`, `people`, or `all`. Empty unless set. Change it in Vercel and redeploy |

- **Every call is logged** in the `ai_calls` table: its task, model, prompt version, tokens, estimated cost, time and outcome, never its words. Only Gaff's own jobs read it. The nightly job deletes rows over 12 months old. In Supabase's **SQL Editor**, `select task, outcome, count(*), sum(cost_micros) / 1e6 as dollars from ai_calls where occurred_at >= date_trunc('month', now()) group by 1, 2` shows the month so far.
- **Before changing a prompt or the model,** run its golden set against the real model: `pnpm evals` prints what it would cost, and `pnpm evals advert --confirm` (or `answers`, `people`) runs it and saves the results under `tests/evals/results/`. Commit them with the change. Evals never run in CI.

## The place index (towns, streets and landmarks)

"Where" in search suggests places from Gaff's own place index, the `places` table ([ADR-0018](adr/0018-own-place-index-from-openstreetmap.md)): every county, city, town, village, area, Dublin district, townland, street and landmark in the Republic, about 100,000 places. It needs Postgres's `pg_trgm` extension, which the deploy's migrations add. If a migration stops with "pg_trgm is missing", enable **pg_trgm** in Supabase (**Database**, **Extensions**, in the `public` schema), then deploy again.

- **Loading.** Each production deploy runs `pnpm places:load --deploy`. It loads `data/places/places.ndjson.gz` when that file's version is newer than the one in the database, all in one transaction (about 20 seconds); otherwise it only refreshes the curated base (`src/domain/places/curated.ts`), which takes a second or two. Without the file, an empty index gets the fixture: the curated base and a few streets and landmarks. Preview deployments leave the index alone. Locally, run `pnpm places:load` once after `pnpm db:migrate`.
- **Building.** The file comes from OpenStreetMap, through Geofabrik's Ireland extract. Rebuild it every quarter, or when the misses below show gaps:
  1. Install `osmium-tool` (for example `apt-get install osmium-tool` or `brew install osmium-tool`).
  2. Run `pnpm places:build`. It downloads the extract (about 300 MB) and writes the file. Its version is the hour it was built (2026110819), and always above the file it replaces, so the next deploy loads it.
  3. Run `pnpm places:check`. It tests the file against the places renters must find, in `scripts/places/test-set.csv`.
  4. Commit the file. The next deploy loads it.

  The GitHub workflow **Build the place index** (`.github/workflows/places.yml`) does the same every quarter, or on demand, and opens a pull request with the new file.
- **Attribution.** The data is © OpenStreetMap contributors (ODbL 1.0). The place search says so under its suggestions, and `/map-and-place-data` (linked under the search) credits it in full.
- **Misses.** What renters typed that matched nothing is counted by day in `place_misses`, with no digits, person or device, and the nightly job deletes it after 30 days. The most common misses are the places to add as aliases.

## Good to know

- **Who can open what.** The test copy has a public address, and Vercel's sign-in (Vercel Authentication) doesn't cover it: in **Settings**, **Deployment Protection**, it covers **preview deployments only**, so testers can use the test copy on any device and previews (which share its database) stay private. What keeps the test copy safe is Gaff itself:
  - Everything under `/dev` that shows or changes anything (the Outbox, the test inbox, the stand-in checks) is for Gaff's own team only (`STAFF_EMAILS`) wherever email is really sent. Anyone else, signed in or not, gets "not found". `/dev/ui` stays open: it shows components with made-up words, and nothing from the database.
  - The Google and Apple stand-in exists only in local development and tests, never on staging or in production, so nobody can sign in as somebody else. Without real keys, those buttons aren't shown.
  - "Add test enquiries", in a live letting's menu, brings five made-up renters from Daft and MyHome, most with answers. Their mail goes to the Outbox.
  - Production, on Gaff's own domain, has the development tools off and no Outbox.
- **Google and Apple sign-in** send the browser on to `accounts.google.com` and `appleid.apple.com`. The page's security policy allows each one once its keys are set, and it's fixed when the app is built: redeploy after adding them.
- **Preview deployments** of other branches share the test database but never migrate it.
- **Search engines don't index the test copy.** Every page says `noindex`, and `robots.txt` disallows everything, unless `SEARCH_INDEXING=on`, which is set in production alone (UX-LS-11). Leave it unset here.
- **Settings left over from the earlier test copy** (`MARKETPLACE_PUBLIC`, `STORAGE_PROVIDER`, `STRIPE_SECRET_KEY`, `STRIPE_IDENTITY_WEBHOOK_SECRET`) are ignored and can be deleted. `IDENTITY_PROVIDER=stripe` isn't accepted yet: remove it, or set `stand_in`, until Stripe Identity is brought across. Sign in with Apple takes `APPLE_CLIENT_ID` with the team ID, key ID and private key the earlier copy used (`APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`: Gaff makes the client secret from them, BA-8), or with a static `APPLE_CLIENT_SECRET`. With `APPLE_CLIENT_ID` alone, the app won't start.
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
  | `RESEND_WEBHOOK_SECRET` | from Resend. Required in production, which receives replies and forwarded enquiries |
  | `INBOUND_DOMAIN` | e.g. `in.gaff.ie` |
  | `MAIL_FROM_DOMAIN` | e.g. `mail.gaff.ie` |
  | SMS | the Sinch settings |
  | AI | `AI_PROVIDER=bedrock`, `AWS_REGION`, the AWS keys and `AI_MONTHLY_BUDGET_USD` (see [The AI](#the-ai)). Never `ANTHROPIC_API_KEY`: production refuses it |
  | `IDENTITY_PROVIDER`, `INCOME_PROVIDER` | `none` |
  | `PSRA_REGISTER_SOURCE`, `PSRA_REGISTER_URL` | `url`, and the address of the PSRA register's download, once its format has been checked (see "The PSRA register") |
  | `ADDRESS_SEARCH` | `off`: the address is typed into the manual fields. Autoaddress is added once its DPA is signed (Q40) |
  | `ADVERT_READER` | `on` (the default): a pasted advert is read with the AI provider above, Claude on Bedrock in the EU, unless `AI_TASKS_OFF` names `advert`. `off`: adding a letting offers only "Fill it in myself". Nothing is ever fetched from a link (Q31) |
  | `PHOTO_STORE`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PHOTO_BUCKET` | `supabase`, the project's address (`https://<ref>.supabase.co`), its service-role key, and the bucket for homes' photos (`homes` unless set). Create the bucket as **private** in the Ireland project: browsers load photos from Gaff's own address, which reads them from the bucket. Photos of homes only, never anything personal |
  | `SEARCH_INDEXING` | `on`, in production only: search engines may index live homes' public pages (UX-LS-11). Leave it unset (`off`) on staging and preview deployments, so a test copy is never found. It is read at build time too, so redeploy after changing it |
  | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from a Google OAuth client (web application), with the redirect URI `https://<domain>/api/auth/callback/google`. Without both, "Continue with Google" isn't shown |
  | `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | Apple's Services ID, with the return URL `https://<domain>/api/auth/callback/apple`, and what its client secret is made from: the team ID, the Sign in with Apple key's ID and the key itself (the `.p8` file's text; line breaks may be written as `\n`). Gaff makes the secret on the server and renews it itself (BA-8, [ADR-0019](adr/0017-sign-in-hardened.md)). A static `APPLE_CLIENT_SECRET` still works in place of the three. Without them, "Continue with Apple" isn't shown |

  Production refuses to start with a stand-in or without the encryption key. Sign-in by email code and by passkey needs no setting ([ADR-0015](adr/0015-sign-in-google-apple-codes-passkeys.md)). Limits on signing in are counted in the database by network address, from Vercel's `x-forwarded-for`, and need no setting either ([ADR-0019](adr/0017-sign-in-hardened.md)). In production, Gaff's team open `/internal` only on a passkey sign-in: each adds a passkey on Profile before launch. A passkey belongs to the domain in `APP_URL`, so settle the domain before people add them.
- **Apple:** register the sending domain (`MAIL_FROM_DOMAIN`) with "Sign in with Apple", so "Hide My Email" addresses can be reached.
- **Resend:**
  - Add the sending domain in region `eu-west-1`, with open and click tracking off, and add its SPF and DKIM records.
  - Turn on receiving for the inbound subdomain and add its MX record.
  - Add a webhook for `email.received` pointing at `https://<domain>/api/inbound/resend`, and copy its signing secret.
- **Supabase:** turn on **Enforce SSL**.
- **DPAs:** sign them with Vercel, Supabase and Resend (Q26).
