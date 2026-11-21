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
   | `STAFF_EMAILS` | the founders' sign-in emails, separated by commas. They can open `/internal/agencies`, `/internal/funnels`, the Outbox and the test inbox; nobody else can. Name at least two people: an appeal about a hidden listing must be decided by someone other than the person who decided it (ADR-0024). On the test copy alone, `TEST_STAFF_EMAILS` (the older name) is read as part of the same list |
   | `GAFF_ENV` | `staging` |
   | `EMAIL_PROVIDER` | `resend` |
   | `RESEND_API_KEY` | a Resend key with **sending access** only, limited to the sending domain |
   | `MAIL_FROM_DOMAIN` | a domain verified in Resend, in `eu-west-1` |
   | `MAIL_FROM_ADDRESS` | optional, until a domain is verified: `onboarding@resend.dev` sends everything from Resend's test address. Resend delivers that only to the Resend account owner's inbox, so set `TEST_EMAIL_RECIPIENTS` to that address too, and everyone else's mail waits in the Outbox. Production refuses it |
   | `TEST_EMAIL_RECIPIENTS` | optional: real email goes only to these addresses, or `@domain` for a whole domain, separated by commas; everyone else's goes to the Outbox. Unset, every real address gets real email |

   For the random values, use a password manager's generator, or run `openssl rand -hex 32` in a terminal. Without `RESEND_WEBHOOK_SECRET` (and a real `INBOUND_DOMAIN` with receiving set up), the test copy sends email but doesn't receive it: replies go through the links in each email, and each email says so. Production refuses `TEST_EMAIL_RECIPIENTS` and `TEST_STAFF_EMAILS`.

   **Keep real email on.** The Outbox is closed to strangers only where email is really sent. With `EMAIL_PROVIDER` left at `dev`, every email, sign-in codes included, sits in an Outbox anyone can open, which is only safe behind Vercel's own sign-in (see "Good to know").

   To try the real model, add the settings in [The AI](#the-ai) too. Without them, a stand-in answers.
3. **Deploy.** The build applies the database migrations first, then loads the place index (below), then adds the test copy's made-up homes ([The made-up homes](#the-made-up-homes-the-test-copy-only)), then builds the app. It takes 3 to 5 minutes; the first deploy on an empty database takes about half a minute more.

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

Gaff's AI does four tasks: it answers renters' questions from a letting's facts (`answers`), reads a pasted advert into a letting (`advert`), reads an operator's question about who has enquired (`people`), and checks a public home's description for unfair wording the word list misses (`wording`, [ADR-0027](adr/0027-checks-at-going-public.md)). All four go through one adapter and one log ([ADR-0017](adr/0017-one-ai-provider-with-usage-budget-and-switches.md)). Where it can't help, people take over: questions go to the letting team, the advert is filled in by hand, the people question gets its fixed reply, and a home goes on gaff.ie on the word list alone.

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
  | `AI_TASKS_OFF` | tasks to switch off without a code change, separated by commas: `answers`, `advert`, `people`, `wording`, `description`, or `all`. Empty unless set. Change it in Vercel and redeploy |

- **Every call is logged** in the `ai_calls` table: its task, model, prompt version, tokens, estimated cost, time and outcome, never its words. Only Gaff's own jobs read it. The nightly job deletes rows over 12 months old. In Supabase's **SQL Editor**, `select task, outcome, count(*), sum(cost_micros) / 1e6 as dollars from ai_calls where occurred_at >= date_trunc('month', now()) group by 1, 2` shows the month so far.
- **Before changing a prompt or the model,** run its golden set against the real model: `pnpm evals` prints what it would cost, and `pnpm evals advert --confirm` (or `answers`, `people`) runs it and saves the results under `tests/evals/results/`. Commit them with the change. Evals never run in CI. The `wording` set has not been run against the real model yet: run `pnpm evals wording --confirm` on the test copy before relying on it.
- **Held listings (ADR-0027).** A home the checks hold waits on `/internal` under "Reported listings", due in four working hours (one working day for wording alone). Someone on `STAFF_EMAILS` releases it or keeps it off; a second person decides any appeal. The same page can pause a lister's listings after a decided case.

## The search map (Google Maps)

Renters see homes on Google's map beside the list (behind "Map" below 900px), and listers place each home's pin on it as they add it ("Where is it on the map?") and from Home ([ADR-0021](adr/0021-search-map-on-google-maps.md), [ADR-0022](adr/0022-google-script-only-on-map-pages.md), Q51). Until it's set up, a copy shows the stand-in map drawn from Gaff's own data, marked "Test map: not Google Maps", and production shows the list alone and asks for no pin. The map uses the **Maps JavaScript API only**, showing Gaff's own homes. Place suggestions never come from Google (the place index, below).

### Setting it up

1. **Three projects.** In the Google Cloud console, under Gaff's billing account, create `gaff-maps-production`, `gaff-maps-test` and `gaff-maps-ci`, with both founders as owners. In each, enable the **Maps JavaScript API** and nothing else. Separate projects keep each copy's cap, bill and key apart.
2. **A key for each project.** Under **Keys & Credentials**, create one API key in each project. Restrict it to the **Maps JavaScript API**, and to **Websites**. Gaff tells Google its site's origin and nothing more (`auth_referrer_policy=origin`), so each key lists its site twice: on its own, with no path, and with `/*`:

   | Key | Websites |
   | --- | --- |
   | Production | `https://<Gaff's domain>` and `https://<Gaff's domain>/*` |
   | The test copy | `https://<the test copy's domain>` and `https://<the test copy's domain>/*` |
   | The test run | `http://localhost:3100` and `http://localhost:3100/*` |

   The key is in every page that shows the map, so these restrictions and the cap are what protect it. Preview copies have no key: they show the stand-in map, whatever their settings say.

3. **Map IDs and styles.** Under **Map management**, create a **JavaScript**, **Vector** Map ID in each project, and attach a style made from Gaff's tokens (`docs/design-tokens.json`; when they change, change the style by hand). A second Map ID with the dark column is optional: without it, the map and its pins stay light in both themes.

   | Map feature | Token | Light | Dark |
   | --- | --- | --- | --- |
   | Land | `surface-2` | `#f4f5f7` | `#202632` |
   | Water | `info-bg` | `#e3f2f4` | `#14313a` |
   | Roads | `border` | `#e2e5ea` | `#2b3241` |
   | Labels | `ink-muted` | `#566074` | `#aab3c2` |
   | Label outlines | `surface-0` | `#ffffff` | `#0e1219` |
   | Businesses and other points of interest | hidden | | |
   | Transport lines and stations | shown, in Google's colours | | |

4. **Caps and budget.** In each project, under **Quotas**, cap the Maps JavaScript API's map loads per day: 100 for the test run, 300 for the test copy, and the production figure the founders set. On the billing account, set budget alerts at 50%, 80% and 100% of the monthly budget, to both founders.
5. **In Vercel**, add these settings for the copy, then redeploy. The redeploy matters: the map pages' content security policy, and the rule that they're entered and left with a full page load, are set when the app is built.

   | Setting | Value |
   | --- | --- |
   | `MAP_PROVIDER` | `google` |
   | `GOOGLE_MAPS_API_KEY` | the key for this copy |
   | `GOOGLE_MAPS_MAP_ID` | the Map ID |
   | `GOOGLE_MAPS_MAP_ID_DARK` | the dark Map ID, if there is one |
   | `GOOGLE_MAPS_VERSION` | `quarterly` (the default: Google's script changes least often) |

6. **In GitHub**, under **Settings**, **Secrets and variables**, **Actions**, add the test run's key as the secret `GOOGLE_MAPS_TEST_KEY`, and its Map IDs as the variables `GOOGLE_MAPS_TEST_MAP_ID` and `GOOGLE_MAPS_TEST_MAP_ID_DARK`. Then run **The real map** from the **Actions** tab. Without the secret, the nightly run does nothing.
7. **Check it.**
   - Search for a place with homes. The map shows a pin with each home's rent, and Google's logo and terms are in sight along its bottom edge.
   - The browser console shows no `RefererNotAllowedMapError`, and no content security policy errors other than Google's fonts, which Gaff blocks on purpose.
   - Open a home from the list, then go back: each is a full page load, and the map draws again.
   - Add a letting: after the address, "Where is it on the map?" shows Google's map with the pin on the address's street.
   - Turn the network off and reload Search: the map's place says "The map isn't available right now. Every home is still in the list."
   - `/internal` counts the map being opened and drawn.

**The first time, with real keys.** Two things have only been read in Google's documentation, not seen: that a key restricted as in step 2 is accepted with only the origin sent, and that a project over its daily cap shows Google's development-mode map (which Gaff replaces with its own sentence, counted as `google`). Check both on `gaff-maps-ci`, by running the real-map tests with its key and then with its cap set to 1, and correct this page if either is different.

### How it behaves

- **Google's script runs only on Search and "Where is it on the map?"** (`src/lib/map-pages.ts`). Going between one of those pages and any other is a full page load, in both directions, so Google's script is never loaded where renters or listers enter personal details.
- **Nothing is asked of Google until the map is wanted:** at 900px and up, once the page has loaded and the map is on screen; below it, when the renter taps "Map". Robots get no map.
- **Google is told the site's origin,** never the page's address, which names the place a renter searched. Every page sends `Referrer-Policy: no-referrer`.
- **A map that can't load never takes the page with it.** The list carries on, and "Where is it on the map?" says the pin can't be placed just now and lets the lister carry on without it.
- **Only a placed pin goes on the map.** A home without one is in the list (and found near a street by its address). A private landlord's home is shown within about 150 metres of its pin.

### Looking after it

- **When the map can't load.** `/internal` counts the last 31 days' opens and failures, with nothing about the renter. The count says why:

  | Count | What happened | What to do |
  | --- | --- | --- |
  | `script` | Google's script didn't arrive | A few are renters' own blockers. Many at once: check the copy was redeployed after `MAP_PROVIDER` changed |
  | `auth` | Google refused the key | Check the key, its two website entries, its API restriction and the project's billing |
  | `google` | Google drew its own error | The daily cap was reached, or billing is off |
  | `timeout` | No map appeared in 10 seconds | Slow connections. Many at once: look at Google's status page |
  | `error` | The map's code threw an error | A change in Google's script, or a bug in Gaff's: run the real-map tests |

- **Turning the map off (M135).** Set `MAP_PROVIDER=none` in Vercel and redeploy: a few minutes. The list fills the page, and no pin is asked for. Set it back to `google` and redeploy to restore it.
- **Rotating a key.** Create a new key with the same restrictions, set it in Vercel and redeploy, check the map, and delete the old key the next day.
- **If a key turns up elsewhere.** The website restriction turns other sites away in a browser, but a referrer can be faked outside one, so the daily cap is the backstop. If billed map loads rise while `/internal`'s opens don't, rotate the key.
- **Every month.** Compare Google's billed map loads with `/internal`'s opens (they should agree to within a tenth), look at the caps, and read any notice from Google about its terms or its script.
- **Live homes without a pin.** In Supabase's SQL editor, this counts them; their listers see "Place the pin" on the letting's Home:

  ```sql
  select count(*) from lettings where status = 'live' and point_source is null;
  ```

### Testing the real map

The journeys in `tests/e2e` use the stand-in map. Google's real map has its own run (M136), in a production build:

```bash
pnpm build:map && pnpm test:map
```

- **Without a key** it shows that only the map's pages let Google in, that nothing leaves for another site before the map is wanted, that the map's pages are entered and left with new documents, and that every way the map can fail (a blocked script, a script that never answers, a refused key, a key refused while pins wait, Google's development-mode map, a map that never finishes starting, a hidden tab) ends in Gaff's sentence with the list whole. These ask Google for its real script, so they need the internet.
- **With the test run's key** (`GOOGLE_MAPS_TEST_KEY=<the key> pnpm test:map`) it also draws the real map on a computer, on a phone and on "Where is it on the map?". Screenshots go to `screenshots/google` for a person to look over.
- **The real map** workflow (`.github/workflows/map.yml`) runs every night on the `quarterly` and `weekly` channels with the key, on demand, and when the map's code changes.
- Run `pnpm build` afterwards: `pnpm build:map` leaves a build with Google's policy in `.next`.

## The place index (towns, streets and landmarks)

"Where" in search suggests places from Gaff's own place index, the `places` table ([ADR-0018](adr/0018-own-place-index-from-openstreetmap.md)): every county, city, town, village, area, Dublin district, townland, street and landmark in the Republic, about 100,000 places. It needs Postgres's `pg_trgm` extension, which the deploy's migrations add. If a migration stops with "pg_trgm is missing", enable **pg_trgm** in Supabase (**Database**, **Extensions**, in the `public` schema), then deploy again.

- **Loading.** Each production deploy runs `pnpm places:load --deploy`. It loads `data/places/places.ndjson.gz` when that file's version is newer than the one in the database, all in one transaction (about 20 seconds); otherwise it only refreshes the curated base (`src/domain/places/curated.ts`), which takes a second or two. Without the file, an empty index gets the fixture: the curated base and a few streets and landmarks. Preview deployments leave the index alone. Locally, run `pnpm places:load` once after `pnpm db:migrate`.
- **Building.** The file comes from OpenStreetMap, through Geofabrik's Ireland extract. Rebuild it every quarter, or when the misses below show gaps:
  1. Install `osmium-tool` (for example `apt-get install osmium-tool` or `brew install osmium-tool`).
  2. Run `pnpm places:build`. It downloads the extract (about 300 MB) and writes the file. Its version is the hour it was built (2026110819), and always above the file it replaces, so the next deploy loads it.
  3. Run `pnpm places:check`. It tests the file against the places renters must find, in `scripts/places/test-set.csv`.
  4. Commit the file. The next deploy loads it.

  The GitHub workflow **Build the place index** (`.github/workflows/places.yml`) does the same every quarter, or on demand, and opens a pull request with the new file.
- **Attribution.** The data is © OpenStreetMap contributors (ODbL 1.0). The search bar and "Where" say so under their suggestions, the map says so where a street is drawn, and `/map-and-place-data` (linked from each of those, and from Help) credits it in full.
- **Misses.** What renters typed that matched nothing is counted by day in `place_misses`, with no digits, person or device, and the nightly job deletes it after 30 days. The most common misses are the places to add as aliases.

## The made-up homes (the test copy only)

The test copy opens with homes to search, find on the map and ask to view, and lettings to run, so nobody has to set any up first (`src/server/dev/seed.ts`):
- **Liffey Quay**, an agency in Dublin, with four homes: Ranelagh, Rathmines, Drumcondra and Portobello;
- **Corrib Homes Limited**, an agency in Galway, with three: Salthill, the city centre and Knocknacarra;
- **Siobhán**, a private landlord in Cork, with two: Ballintemple and the city centre.

The agencies are on the made-up sample register (licences `001239` and `001236`), so the made-up homes need `PSRA_REGISTER_SOURCE` left at `sample`, as it is on the test copy. Their people have made-up addresses (`ann@liffey-quay.test`, `cian@corrib-homes.test`, `siobhan.daly@example.ie`), so their email goes to the Outbox.

- **When it runs.** Each deploy runs `pnpm db:seed --deploy` after the place index. It seeds only the test copy's production deployment (`GAFF_ENV=staging`): never production, never a preview, which shares the test copy's database. If it fails, the build log says why and the deploy carries on.
- **Everything through the product.** Each agency is found on the register, claimed by its admin and confirmed as Gaff's team would; the landlord confirms it's them; each home is added, given its letting details, photos (through the photo pipeline, [ADR-0023](adr/0023-photo-pipeline.md)), a pin, a rent check and viewing times, and put live by its lister's decision. So every row and event is one the product writes itself. On an empty database, the seed loads the sample register first, as the daily job would.
- **Safe every time.** It adds what's missing and changes nothing a tester made. A seeded home that's there gets only more viewing times, when it has fewer than two sessions ahead; a photo or pin a tester added stays; a closed letting stays closed.
- **How long.** About 10 seconds on an empty database (28 photos through the pipeline; a little more with each one sent to Supabase Storage), and under a second after that.
- **The photos** are in `data/seed-photos/`, real photos supplied for the test copy only (see its README).
- **Locally**, `pnpm db:seed` adds the same homes to your own database after `pnpm db:migrate` and `pnpm places:load`.

## The ID check (Stripe Identity)

A chosen renter, and a private landlord at their first go-live, check their ID: a photo of a passport, driving licence or ID card, and a live selfie ([ADR-0020](adr/0020-id-check-on-stripe-identity-and-booking-mobile.md)). Gaff keeps only the result, the name and the date.

- **The test copy can use Stripe's test mode**, so every tester passes the check the way a real person would, with Stripe's test documents and no real ID:
  1. In the Stripe dashboard, in **test mode**, copy the secret key (`sk_test_…`) from **Developers**, **API keys**.
  2. In **Developers**, **Webhooks**, add an endpoint at `https://<test copy address>/api/webhooks/stripe-identity` for the events `identity.verification_session.verified`, `identity.verification_session.requires_input`, `identity.verification_session.processing` and `identity.verification_session.canceled`, and copy its signing secret (`whsec_…`).
  3. In Vercel, set these, then redeploy (the page's security policy lets the browser go on to Stripe only once it's set, and that is fixed when the app is built):

     | Name | Value |
     | --- | --- |
     | `IDENTITY_PROVIDER` | `stripe` |
     | `STRIPE_SECRET_KEY` | the `sk_test_…` key |
     | `STRIPE_IDENTITY_WEBHOOK_SECRET` | the endpoint's `whsec_…` secret |

  Without them, the stand-in is used: a Gaff page where the tester picks the result. On the test copy, the person whose check it is opens it through the link the stand-in sent them to; nothing else under `/dev` opens for them.
- **Production uses Stripe's live keys**, once the founders have Stripe's DPA, the privacy notice names Stripe, and the solicitor has answered on consent to the selfie (Q51). Production refuses the stand-in.
- **What happens at Stripe.** Gaff gives Stripe only the check's ID. Gaff never believes a webhook's contents: it reads the session from Stripe itself. A person has three tries; after that, they're told to reply to an email to talk to a person. Thirty days after each result, the nightly job asks Stripe to delete ("redact") the document and the selfie.

## Texts, and the code to book a viewing

**Signing in with a mobile number** (ADR-0033) is offered only where texts are really sent: with Sinch's settings, the sign-in field reads "Email or mobile number"; with `SMS_PROVIDER=fake` it reads "Email", except on a developer's machine, where the text is in the Outbox. A sign-in code is never shown on the screen. `SIGN_IN_TEXTS_PER_HOUR` (300 unless set) is every sign-in text Gaff may send in an hour; past it the screen asks for an email until the hour is out, and `0` switches sign-in by mobile off.

A renter confirms their mobile with a six-digit text code before booking a viewing (P16), and the 2-hour reminder goes to that number. With `SMS_PROVIDER=fake` (the test copy, until Sinch is set up) no text is sent: the code is shown on the screen instead, on staging only. With Sinch's settings, it is texted.

### Setting up Sinch

Sinch sends every text: sign-in codes, the code to book a viewing, and the 2-hour reminder. It is approved for this (rule 10, Q61). Nothing below needs a code change.

Sinch's own screens change. Where a label below doesn't match, look for the same thing by what it is: a _service plan ID_, an _API token_ and a _region_.

1. **Make the account** at [sinch.com](https://sinch.com) ("Build" dashboard), as the company. A trial is enough to prove it works. On a trial, Sinch sends your words only to numbers you have verified there (the one you signed up with, and up to five in all); to any other number it sends its own test words, with no code. It gives a small credit and a test number to send from.
2. **Use the EU region.** In the dashboard, under SMS, open **APIs** (the REST configuration). Make sure the service plan shown is for the **EU** region, and create one there if not. Gaff only ever calls `eu.sms.api.sinch.com`, so a US plan's ID and token are refused.
3. **Copy two values** from that page: the **service plan ID** and its **API token**. The token is a password: put it straight into Vercel, and never into a chat, an email or the repository.
4. **Choose what texts come from** (`SINCH_FROM`):
   - on a trial, the test number Sinch gives you, as digits with the country code (no plus);
   - for real use, a name of up to 11 letters and digits, `Gaff`. In Ireland a name must be registered first (step 8), or phones show "Likely Scam" in its place.
5. **Add four settings in Vercel** (**Settings**, **Environment Variables**, for **Production**, which is the test copy):

   | Name | Value |
   | --- | --- |
   | `SMS_PROVIDER` | `sinch` |
   | `SINCH_SERVICE_PLAN_ID` | the service plan ID |
   | `SINCH_API_TOKEN` | the API token (mark it **Sensitive**) |
   | `SINCH_FROM` | the test number, or `Gaff` once registered |

   The app refuses to start with `SMS_PROVIDER=sinch` and any of the other three missing, so add all four before the next step.
6. **Redeploy** (**Deployments**, the newest one, **Redeploy**). Settings only reach a new deployment.
7. **Check it**, with your own mobile, verified at Sinch if you're on a trial:
   - the sign-in screen's field reads "Email or mobile number", and the banner says texts are real and asks for your own number;
   - type your mobile and press Continue: the text arrives within a few seconds, and the code signs you in (the first time, after one more code to your email);
   - if no text comes, the screen says "We couldn't send the text", and the reason is in Vercel's logs as "Sinch refused the SMS:" with Sinch's status. `401` is a wrong token or a plan from another region; `403` is usually a sender or a country the account may not use.
8. **Before real people use it:**
   - **Upgrade the account** (add a payment method), which lifts the trial's limits.
   - **Register the sender name for Ireland.** ComReg's SMS Sender ID Registry is free: register the organisation and the name `Gaff` at [comreg.ie/senderid](https://www.comreg.ie/senderid), and name Sinch (Sinch Sweden AB) as the provider. Since 3 July 2025 a text from an unregistered name reads "Likely Scam"; blocking them outright has been announced and deferred, so check the date there. Ask Sinch's support whether they need anything more to carry the name, then set `SINCH_FROM=Gaff` and redeploy.
   - **Limit where texts go and what they can cost.** At Sinch, allow only the countries in `diallingCodes` (`src/domain/auth/mobile.ts`) and set a monthly spend cap. Gaff's own cap is `SIGN_IN_TEXTS_PER_HOUR` (300 unless set).
   - **Sign Sinch's data processing agreement** and keep a copy (rule 10). The privacy notice already names Sinch.
   - **Send one real sign-in text to an iPhone and to an Android phone**, and check the code is offered above the keyboard.

What changes on the test copy once it's on: sign-in offers a mobile number; the code to book a viewing is texted, no longer shown on the screen; and the 2-hour viewing reminder is a real text. Texts go only to a number someone typed themselves and, for reminders, confirmed with a code. A made-up number would text a stranger, which is why the banner changes.

To turn it off again: set `SMS_PROVIDER=fake` and redeploy. Sign-in goes back to "Email", and nobody loses their account: a mobile number is only ever a second way in.

## Good to know

- **Who can open what.** The test copy has a public address, and Vercel's sign-in (Vercel Authentication) doesn't cover it: in **Settings**, **Deployment Protection**, it covers **preview deployments only**, so testers can use the test copy on any device and previews (which share its database) stay private. What keeps the test copy safe is Gaff itself:
  - Everything under `/dev` that shows or changes anything (the Outbox, the test inbox, the stand-in checks) is for Gaff's own team only (`STAFF_EMAILS`) wherever email is really sent. Anyone else, signed in or not, gets "not found". `/dev/ui` stays open: it shows components with made-up words, and nothing from the database. The one exception is a tester's own stand-in check, opened through its own link (see [The ID check](#the-id-check-stripe-identity)).
  - The Google and Apple stand-in exists only in local development and tests, never on staging or in production, so nobody can sign in as somebody else. Without real keys, those buttons aren't shown.
  - "Add test enquiries", in a live letting's menu, brings five made-up renters from Daft and MyHome, most with answers. Their mail goes to the Outbox.
  - Production, on Gaff's own domain, has the development tools off and no Outbox.
- **Google and Apple sign-in** send the browser on to `accounts.google.com` and `appleid.apple.com`. The page's security policy allows each one once its keys are set, and it's fixed when the app is built: redeploy after adding them.
- **Preview deployments** of other branches share the test database but never migrate it.
- **Search engines don't index the test copy.** Every page says `noindex`, and `robots.txt` disallows everything, unless `SEARCH_INDEXING=on`, which is set in production alone (UX-LS-11). Leave it unset here.
- **Settings left over from the earlier test copy** (`MARKETPLACE_PUBLIC`, `STORAGE_PROVIDER`) are ignored and can be deleted. `IDENTITY_PROVIDER=stripe` with `STRIPE_SECRET_KEY` and `STRIPE_IDENTITY_WEBHOOK_SECRET` is Stripe Identity again (see [The ID check](#the-id-check-stripe-identity)); the earlier copy's webhook endpoint must point at `/api/webhooks/stripe-identity`. Sign in with Apple takes `APPLE_CLIENT_ID` with the team ID, key ID and private key the earlier copy used (`APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`: Gaff makes the client secret from them, BA-8), or with a static `APPLE_CLIENT_SECRET`. With `APPLE_CLIENT_ID` alone, the app won't start.
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
  | SMS | the Sinch settings. With them, people can also sign in with a mobile number (ADR-0033); `SIGN_IN_TEXTS_PER_HOUR` caps those texts |
  | AI | `AI_PROVIDER=bedrock`, `AWS_REGION`, the AWS keys and `AI_MONTHLY_BUDGET_USD` (see [The AI](#the-ai)). Never `ANTHROPIC_API_KEY`: production refuses it |
  | `IDENTITY_PROVIDER`, `STRIPE_SECRET_KEY`, `STRIPE_IDENTITY_WEBHOOK_SECRET` | `stripe`, the live secret key and the live webhook's secret (see [The ID check](#the-id-check-stripe-identity)), or `none` until Stripe's DPA is signed |
  | `DOCUMENT_STORE`, `DOCUMENT_BUCKET` | `supabase`, and the bucket for chosen renters' work and income documents (`documents` unless set). Create it as **private**, in the same Ireland project, and never the photos' bucket (Gaff refuses that). Files are encrypted with `DATA_ENCRYPTION_KEY` before they're stored; nothing in the bucket is ever served to a browser; browsers send documents straight to it under `uploads/` with a signed upload, which Gaff reads, encrypts under a new key and deletes at once (BA-16, [ADR-0031](adr/0031-work-and-income-documents.md)). Production refuses `local`. Documents are read by the AI's `document` task: on Bedrock in the EU in production, and on the test copy with the Claude API, so the test copy takes made-up documents only. `INCOME_PROVIDER` is gone: remove it |
  | `PSRA_REGISTER_SOURCE`, `PSRA_REGISTER_URL` | `url`, and the address of the PSRA register's download, once its format has been checked (see "The PSRA register") |
  | `ADDRESS_SEARCH` | `off`: the address is typed into the manual fields. Autoaddress is added once its DPA is signed (Q40) |
  | `ADVERT_READER` | `on` (the default): a pasted advert is read with the AI provider above, Claude on Bedrock in the EU, unless `AI_TASKS_OFF` names `advert`. `off`: adding a letting offers only "Fill it in myself". Nothing is ever fetched from a link (Q31) |
  | `PHOTO_STORE`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PHOTO_BUCKET` | `supabase`, the project's address (`https://<ref>.supabase.co`), its service-role key, and the bucket for homes' photos (`homes` unless set). Create the bucket as **private** in the Ireland project: browsers load photos from Gaff's own address, which reads them from the bucket. Browsers send new photos straight to the bucket under `uploads/` with a signed upload, so the content policy names the project's address in `connect-src`: redeploy after setting these (ADR-0023). Photos of homes only, never anything personal |
  | `SEARCH_INDEXING` | `on`, in production only: search engines may index live homes' public pages and the pages of places with homes (`/to-rent/…`), `robots.txt` points at `/sitemap.xml`, and the sitemap lists them (UX-LS-11, M111, BA-12). With it off, the sitemap is empty. Leave it unset (`off`) on staging and preview deployments, so a test copy is never found. It is read at build time too, so redeploy after changing it |
  | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from a Google OAuth client (web application), with the redirect URI `https://<domain>/api/auth/callback/google`. Without both, "Continue with Google" isn't shown |
  | `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | Apple's Services ID, with the return URL `https://<domain>/api/auth/callback/apple`, and what its client secret is made from: the team ID, the Sign in with Apple key's ID and the key itself (the `.p8` file's text; line breaks may be written as `\n`). Gaff makes the secret on the server and renews it itself (BA-8, [ADR-0019](adr/0017-sign-in-hardened.md)). A static `APPLE_CLIENT_SECRET` still works in place of the three. Without them, "Continue with Apple" isn't shown |

  Production refuses to start with a stand-in or without the encryption key. Sign-in by email code and by passkey needs no setting ([ADR-0015](adr/0015-sign-in-google-apple-codes-passkeys.md)); sign-in by mobile number needs Sinch ([ADR-0033](adr/0033-mobile-sign-in-and-one-person-across-methods.md)). Limits on signing in are counted in the database by network address, from Vercel's `x-forwarded-for`, and need no setting either ([ADR-0019](adr/0017-sign-in-hardened.md)). In production, Gaff's team open `/internal` only on a passkey sign-in: each adds a passkey on Profile before launch. A passkey belongs to the domain in `APP_URL`, so settle the domain before people add them.
- **Apple:** register the sending domain (`MAIL_FROM_DOMAIN`) with "Sign in with Apple", so "Hide My Email" addresses can be reached.
- **Resend:**
  - Add the sending domain in region `eu-west-1`, with open and click tracking off, and add its SPF and DKIM records.
  - Turn on receiving for the inbound subdomain and add its MX record.
  - Add a webhook for `email.received` pointing at `https://<domain>/api/inbound/resend`, and copy its signing secret.
- **Supabase:** turn on **Enforce SSL**.
- **DPAs:** sign them with Vercel, Supabase and Resend (Q26).
