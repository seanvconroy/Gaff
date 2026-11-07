# Gaff marketplace: technical specification

Accepted, 7 November 2026 · CTO · goes with the [marketplace PRD](prd.md), approved for build the same day

## Summary

The marketplace is built inside the existing modular monolith: the same Next.js app on Vercel (Dublin), the same Postgres on Supabase (Ireland), and the same jobs, ports and adapters. It adds public pages for renters, renter accounts, a model of homes and listings, search, photos, checks on letters and moderation. Search, maps and measurement need no new service. One new use of a vendor, ID checks for private landlords with Stripe Identity, was approved by Sean on 7 November 2026.

Everything in [architecture.md](../architecture.md) and the ADRs still holds unless this document says otherwise.

## Decisions

| # | Decision | Choice | Why | ADR |
| --- | --- | --- | --- | --- |
| 1 | Where it lives | The same monolith, app and database. No new services | Two part-time founders, one deployable (ADR-0001). The marketplace and the workflow share homes, lettings and applications | 0015 |
| 2 | Accounts | Better Auth for everyone. Renter accounts are optional; private links stay | ADR-0013 ruled out renter accounts for the workflow. The marketplace needs saved homes, alerts and profiles | 0016, amends 0013 |
| 3 | Data zones | Organisation, renter, public and staff zones, each with its own row-level security and helper | Keeps tenant isolation (ADR-0004) and staged data (ADR-0005) provable as the data model grows | 0017 |
| 4 | Homes, lettings and listings | A home lasts, a letting is one let, and a listing is the letting's public advert | Relisting, developments and a safe public copy all need it | 0018 |
| 5 | Search and alerts | Postgres with pg_trgm, unaccent and full-text search. Locations are latitude and longitude with bounding-box indexes, and matching an area or a drawn shape is domain code | Fewer than 2,400 homes were advertised to rent nationally in August 2026. Postgres is ample, and adds no vendor (ADR-0003). PostGIS needs a superuser to install, which our migrations don't have, and this scale doesn't need it | 0019 |
| 6 | Maps | MapLibre with self-hosted OpenStreetMap tiles, and open data for places, transport and schools | No map vendor sees where renters look. The map re-skins from the design tokens | 0020 |
| 7 | Photos | Direct uploads to Supabase Storage. A job checks, cleans and resizes them. Fixed sizes are served from the CDN, with perceptual hashes | Predictable cost, no location data, and stolen-photo detection | 0021 |
| 8 | Checking letters | Weekly PSRA register import; Stripe Identity for private landlords; our own SMS codes through Sinch | Matches Q29, and keeps only results | 0022 |
| 9 | Moderation | Rules first, AI second, and a person decides every removal | Equal Status Acts and the Digital Services Act; the same principle as ADR-0007 | 0023 |
| 10 | Ranking | A deterministic best match. Payment isn't an input | Q30; explainable to renters | 0024 |
| 11 | Rendering | Server-rendered pages. Area, listing, development and agency pages are static and regenerated when they change | Speed on phones, and search engines | 0015 |
| 12 | Measurement | First-party counts and Vercel Web Analytics, both cookieless | No trackers (M103) | 0017 |

## The shape

```
 renters (phone, web app)          letters (laptop, phone)          Gaff staff
          │                                  │                           │
          ▼                                  ▼                           ▼
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │  Next.js on Vercel (Dublin)                                                  │
 │  (public) search, listings, areas  │ (renter) My homes │ (workspace) │ staff │
 │  api: uploads, webhooks, view beacon, map points, cron tick                  │
 └───────────────┬───────────────────────────────────────────┬──────────────────┘
                 │                                           │ signed uploads
       ┌─────────▼──────────────────────┐        ┌───────────▼────────────────┐
       │ Postgres (Supabase, Ireland)   │        │ Supabase Storage + CDN     │
       │ zones: organisation, renter,   │        │ photos (fixed sizes),      │
       │ public, staff; pg_trgm; events;│        │ map tiles (PMTiles)        │
       │ job queue; outbox              │        └────────────────────────────┘
       └─────────▲──────────────────────┘
                 │
       ┌─────────┴──────────────────────┐   Resend (email, two subdomains)
       │ Jobs (cron tick + after())     │──▶ Sinch (SMS codes, reminders)
       │ photos, publish checks, alerts,│──▶ Claude on Bedrock, EU (drafts, checks)
       │ freshness, PSRA import,        │◀── Stripe Identity (webhook)
       │ retention, workflow (as now)   │◀── psr.ie register file (weekly)
       └────────────────────────────────┘
```

## Code layout

New and changed modules. Dependencies still point inwards (app and jobs → server → domain).

```
src/
├── app/
│   ├── (public)/        home, to-rent/[...place], home/[listing], developments/[slug],
│   │                    agencies/[slug], report, how-results-are-ordered
│   ├── (renter)/my/     homes, messages, saved, alerts, profile, who-has-my-details
│   ├── (workspace)/     as now, plus listings, developments, team, checks
│   ├── staff/           check queue, review queue, cases, accounts
│   └── api/             uploads, webhooks/stripe-identity, v (view beacon), map-points, cron
├── domain/
│   ├── homes/           homes, developments, unit types, facts and their rules
│   ├── listings/        lifecycle, publishing checks, freshness, enquiry limits
│   ├── search/          filters, URL codec, best match, alert matching rules
│   ├── places/          gazetteer rules, routing keys, slugs
│   ├── moderation/      trigger terms, contact and money detection, risk signals
│   ├── verification/    check states, PSRA name matching, badge wording
│   ├── profiles/        renter profile groups and the stage at which each may be shared
│   └── media/           photo rules (count, sizes, CGI label)
├── server/              accounts, agencies, verification, homes, listings, media, search,
│                        profiles, alerts, moderation, reports; enquiries extended
├── jobs/                media.process, listings.freshness, alerts.match, alerts.send,
│                        alerts.daily, psra.import, verification.recheck,
│                        moderation.classify, stats.rollup, places.refresh
└── db/                  schema per zone, RLS policies, withRenter(), withPublic(),
                         withStaff(), withEnquiry()
```

## How the product rules apply

| Rule | In the marketplace | Proven by |
| --- | --- | --- |
| 1. People make every decision | A person removes a listing (M98); AI only flags. Enquiry limits are set by the letter in advance and apply to everyone. The workflow's decisions are unchanged | Compliance tests; lint keeps AI code out of moderation actions |
| 2. Staged data | Each profile group is copied to a letter only at its stage, and `profile_shares` records every copy | Compliance tests (M11) |
| 3. No protected grounds | Profiles hold only the fixed criteria answers. Listings can't publish protected-ground wording. Filters describe homes, not people. "How many people", never adults and children | Compliance tests (M46, M99); AI evals |
| 4. Renters never pay | No payment fields or flows on any renter page, and no paid renter features | Compliance tests |
| 5. Gaff never holds money | Listing is free and there's no payment integration at launch. R23 is unchanged | Architecture review |
| 6. AI disclosure | The first reply is unchanged, and the listing says replies come from the letter's AI assistant (M69) | Compliance tests |
| 7. Grounded AI | Description drafts use only the facts entered, and the letter edits and publishes them. Moderation and photo checks only classify. Names and contact details are stripped before any text goes to the model | AI evals |
| 8. Logging without personal data | `events` as now, plus `platform_events` for the new zones, under the same enforcement | Existing tests, extended |
| 9. Retention by jobs | Every new kind of data has a deletion rule and a job (see [Privacy and retention](#privacy-and-retention)) | Integration tests |
| 10. Approved vendors | One new use (ID checks for landlords). Everything else runs on approved vendors or is self-hosted | Vendor table; launch checklist |

## Data model

### Zones

Every table belongs to one zone. A zone decides who can read and write its rows, enforced by row-level security, and each zone has a helper that sets the session variables its policies read.

| Zone | Read by | Written by | Policy | Helper |
| --- | --- | --- | --- | --- |
| Organisation | The organisation's members | The organisation's use cases and jobs | `organisation_id = app.org_id` (`tenantPolicy()`, as now) | `withOrg()` |
| Renter | The renter | The renter's use cases | `user_id = app.user_id` | `withRenter()`, new |
| Public | Anyone | The owning organisation's publishing use cases | Read: everyone. Write: `organisation_id = app.org_id` | `withPublic()` for reads, new |
| Staff | Gaff staff | Staff use cases | `app.role = 'staff'` | `withStaff()`, new |
| Cross-organisation jobs | Jobs only | Jobs only | Bypassed, as now | `withSystem()` |

Two narrow exceptions, each lint-restricted to the use cases that need them, like `PersonDecision` today:

- **`withEnquiry(orgId, userId)`** sets both the organisation and the renter, so an enquiry's application (organisation zone) and its `profile_shares` record (renter zone) are written in one transaction.
- **Renter reads of their own applications.** A second policy on `applications`, `messages` (renter-visible kinds), `bookings` and `offers` allows reads where `renter_user_id = app.user_id`. Renter queries live in one module, select explicit columns, and are tested so they never return operator-only fields, other renters, rankings or decisions.

### Organisation zone

| Table | Holds | Personal data? |
| --- | --- | --- |
| `organisations` (changed) | Kind (`agency` or `landlord`), legal and trading names, slug, logo, public phone and website, office address, PSRA licence number, check status | No |
| `memberships` (changed) | Role (`admin` or `negotiator`, shown to renters as an agent); the agent's public details: display name, photo, licence number, whether the phone is shown; branch (Should) | Agents' details, which they choose to publish |
| `homes` (new) | Development and unit type, address, Eircode and routing key, location (latitude and longitude), whether the exact address is shown, place, type, bedrooms, bathrooms, en-suites, floor area, floor and lift, BER (scale, rating, number, certificate date, exemption reason), heating, parking, outdoor space, accessibility features, appliances, broadband | A landlord's own address can be, so the Eircode is never public |
| `developments` (new) | Name, slug, location, place, description, amenities (a closed list), status | No |
| `unit_types` (new) | Development, label, bedrooms, bathrooms, size range | No |
| `lettings` (changed) | Keeps its copy of the home's facts as advertised (ADR-0018). Adds `home_id`, deposit in cents (a check constraint keeps it no higher than the rent), furnishing, pets policy, enquiry limit (a number, a closing time, or both) | No |
| `listings` (new) | Letting (unique), status, slug, description and how it was written (by the letter, or an AI draft they edited), address shown, assigned agent, published, confirmed and closed times, next confirmation due, current revision | No |
| `listing_revisions` (new) | A snapshot of the public content and its check results at each publish or edit | No |
| `listing_holds` (new) | Listing, reason codes, opened and resolved times | No |
| `media` (new) | Owner (home, development, organisation or agent), kind (photo, floor plan, logo, agent photo), storage keys per size, dimensions, perceptual hash, CGI flag, position, alt text, status | Agent photos only |
| `tour_links` (new) | Listing, provider, URL from an allow-listed host | No |
| `applications` (changed) | Adds `renter_user_id` (nullable), `source` (`gaff`, `daft` or `myhome`) and `listing_id` | Yes, as now |
| `messages` (changed) | Adds the `in_app` channel and a read time | Yes, as now |
| `letter_checks` (new; Better Auth already has a `verifications` table) | Subject (organisation, membership or user), method (`psra_register`, `id_document` or `sms`), status, verified name, provider reference, checked at, checked by, expiry | The verified name |
| `declarations` (new) | Who declared what (owner or authorised to let; RTB registration), the wording version and the time | No |
| `listing_daily_stats` (new) | Listing, day, views, unique visitors, saves, enquiries, alerts sent | No |

### Renter zone

| Table | Holds | Personal data? |
| --- | --- | --- |
| `renter_profiles` | Name, mobile and whether it's confirmed, "keep my details" with its consent time and wording version, keep-until date, last used | Yes |
| `renter_answers` | One row per criterion from the closed list, with a typed value | Yes |
| `renter_application_details` | How they mainly earn, and monthly take-home income in cents (the stage 5 group) | Yes |
| `renter_verified_results` | Kind (identity or affordability), result, verified name, checked and expiry dates (the stage 6 group) | Yes |
| `saved_homes` | Listing and a private note | Yes (the note) |
| `saved_searches` | Name, filters (indexable typed columns plus validated JSON), area (a place, or a drawn shape as GeoJSON with its bounding box), alert frequency, last sent | Linked to a person |
| `alert_deliveries` | Saved search, listing, sent time | No |
| `profile_shares` | Application, data group, shared time. Behind "Who has my details" | No (IDs only) |
| `follows` (Should) | Listing followed for viewing or enquiry news | Linked to a person |

### Public zone

`public_listings`, `public_developments`, `public_agencies` and `public_agents` are denormalised copies of exactly what renters see.

- **An allow-list of columns.** A test fails if any other column appears. There's no Eircode, no landlord client, no renter data and no internal notes.
- **`public_listings`:** listing and organisation IDs, slug, status, title, the address shown, place IDs, routing key, location (rounded to about 150 m when the letter hides the exact address), rent, deposit, bedrooms, bathrooms, type, furnishing, available from, BER, pets, features, criteria in words, photos (keys, sizes, alt text), floor plan, tour link, the letter card (kind, the names the letter chose to show, badges, licence numbers), development, published and confirmed times, when enquiries close, completeness score, and search text (`tsvector`).
- **Written in the same transaction** as the change it reflects, by the owning organisation's use case. A public page can never show something the letter didn't publish, or keep showing something they changed.

### Staff zone

| Table | Holds | Personal data? |
| --- | --- | --- |
| `staff_members` | User and role (reviewer or admin); a passkey is required | Staff |
| `moderation_cases` | Subject (listing, organisation, user or message), source (rule, AI, report or staff), reason codes, priority, status, due by, assignee, outcome | No |
| `moderation_signals` | Case, signal code, score, related IDs (for example the listing whose photo matched) | No |
| `moderation_actions` | Case, action (hold, remove, restore, pause account, suspend account), reason code, ground (law or policy), statement-of-reasons template and version, sent at, decided by, appeal of | No |
| `reports` | Listing or organisation, reason, details, the reporter's email if given, deletion date | Yes |
| `trigger_terms` | Pattern, ground, severity, source, version, active | No |
| `psra_register_entries` | Licence number, licensee name and address, licence type, status, register date | Public register data |
| `staff_access_log` | Which staff member looked at which organisation's data, for which case | Staff |

### Reference data (public, read-only)

| Table | Source | Refreshed |
| --- | --- | --- |
| `places`: county, town, area or Dublin postal district; name and Irish name; slug; parent; boundary (multipolygon) or centre and radius; aliases; search text | Tailte Éireann open data, OpenStreetMap, CSO boundaries | Quarterly |
| `transport_stops`: stop, name, mode, location | National Transport Authority GTFS | Monthly |
| `schools`: roll number, name, level, location, enrolment | Department of Education | Yearly |
| `place_rent_stats` (Later): place, bedrooms, median rent, count; published only with at least 10 homes | Gaff listings | Daily |

### Events

- Organisation events stay in `events` (ADR-0006).
- A new `platform_events` table takes events from the renter, public and staff zones, under the same rule: IDs, codes, numbers and dates only, enforced the same way.
- New types include `listing.published`, `listing.held`, `listing.confirmed`, `listing.paused`, `listing.closed`, `verification.passed`, `verification.failed`, `enquiry.received` (with its `source`), `profile.shared` (with the data group), `alert.sent` (a count), `report.received` and `moderation.action`.

## Key flows

### Publishing a listing

1. The letter publishes. `server/listings/publish` runs in `withOrg()`.
2. `domain/listings` checks the required facts (M39), the deposit cap, BER, at least 3 processed photos, the criteria and the letter's checks.
3. `domain/moderation` runs the rules on the description and facts:
   - protected-ground wording blocks publishing, and returns the words found and a suggested rewrite;
   - contact details and links block publishing;
   - risk signals (a rent far below similar homes, text copied from another letter, a new account listing quickly, a photo match recorded when the photos were processed) hold the listing.
4. The AI check (Claude on Bedrock, EU) reads the description, with names and contact details stripped, and classifies it for subtler protected-ground wording. It has a 4-second budget. On a timeout, the listing goes live on the rules alone and the check runs again in a job, which can still hold it.
5. **Clear:** in one transaction, the status becomes `live`, a revision is saved, `public_listings` is written and `listing.published` is logged. After commit, the listing and place pages are revalidated and `alerts.match` is queued.
6. **Held:** the status becomes `in_review` and a `listing_holds` row records the reason codes. A job opens the staff case. The letter sees why, and how long review takes.

### A search

1. The route `/to-rent/dublin/rathmines?beds=2&max=2600&pets=1` is parsed with Zod by `domain/search` (a codec between web addresses and filters).
2. The place resolves to a boundary, or to a routing key ("Dublin 6", "D6" and "D06" all mean routing key D06, so Dublin postal districts need no boundaries).
3. A query against `public_listings` in `withPublic()`: a partial index on live listings, the area's place or bounding box (a drawn shape is then checked point by point in domain code), the filters, best-match order and keyset pagination.
4. The map asks a separate endpoint for light points in view (ID, position, rent), at most 2,000, clustered in the browser.
5. Signed-in extras (saved hearts, "You enquired") load in a small client island after the page, so the page itself stays cacheable.

### An enquiry

1. The renter taps Enquire. If they aren't signed in, the sheet takes their name and email and sends a 6-digit code (Better Auth email OTP). Entering it creates the session.
2. `server/enquiries/submit-marketplace` checks that the listing is live and taking enquiries (with a row lock on the letting for the enquiry limit), and the fair-use limit (M82).
3. In `withEnquiry()`, it finds or creates the application: one per renter per letting (a unique index), merged with any Daft or MyHome enquiry from the same email (R6). `domain/profiles` decides which profile groups may be copied at this stage (contact details and criteria answers only).
4. It writes the application, a `profile_shares` row and `enquiry.received {source: "gaff"}` in one transaction, then queues the first reply (the existing job). The reply appears in the renter's thread and goes by email.

### Alerts

1. After a listing goes live, or its rent drops, `alerts.match` runs in `withSystem()`.
2. It finds saved searches whose typed filter columns match the listing and whose area contains it (by place, or by bounding box and then point-in-polygon in domain code), and inserts `alert_deliveries` rows. A unique key makes the job safe to repeat.
3. **Instant:** an `alerts.send` job per renter, keyed so several new homes within 2 minutes go in one email. **Daily:** one job at 8am Europe/Dublin.
4. Email goes through the email port (Resend) from the alerts subdomain, with `List-Unsubscribe` and one-click unsubscribe (RFC 8058). Bounces and complaints switch the alert off.
5. Target: within 5 minutes of a home going live (M87).

### Photos

1. **In the browser:** the letter picks files. A HEIC file that the browser can't read is converted by a WebAssembly decoder, loaded only when needed. Anything over 4,096 px is scaled down. Files upload straight to a private Supabase Storage bucket with signed, resumable uploads, several at a time. No photo passes through a Vercel function.
2. **`media.process` job:** checks the real type from the bytes and the size, decodes with sharp, turns the photo the right way up, removes all metadata (location, camera), converts to sRGB, writes fixed sizes (480, 960, 1440 and 2048 px wide in WebP, and a 1200 px JPEG for link previews) to the public bucket under unguessable keys, computes a 64-bit perceptual hash and a placeholder colour, then deletes the original.
3. **Stolen photos:** a `withSystem()` query looks for close hashes in other organisations' homes, and records a risk signal on the listing.
4. **AI photo check and alt text (Should, M54):** Claude on Bedrock (EU) sees only the image and returns schema-checked flags (people, documents, watermarks, contact details) and a draft alt text that the letter can edit.
5. **Serving:** `srcset` from the Supabase CDN with immutable caching. The first photo loads with high priority and the rest lazily.

### Checking letters

- **Agencies and agents:** `psra.import` downloads the register file from psr.ie each week and reloads `psra_register_entries`. An exact licence number plus a normalised name match passes automatically. Anything else goes to the check queue (M23). Each weekly import re-checks every licence: a lapsed or missing licence pauses the agency's listings, tells its admin and opens a case (M27).
- **Private landlords:** `server/verification/start-id-check` creates a Stripe Identity verification session (document and matching selfie), and the landlord completes it in Stripe's flow. A signed webhook (`/api/webhooks/stripe-identity`) records the outcome. Gaff reads only the verified first and last names: it never expands the date of birth or ID number. It stores the result, name and date, and asks Stripe to redact the session after 30 days.
- **Mobile numbers:** Gaff's own 6-digit codes, stored hashed, valid for 10 minutes with 5 tries, sent through the SMS port (Sinch).

### From a report to a statement of reasons

1. The report form needs no account. `server/reports/submit` is rate-limited, writes the report and its event, and opens a case or adds to an open one. The reporter sees an acknowledgement, and gets one by email if they gave an address.
2. A report plus strong risk signals pauses the listing automatically. A pause is reversible and isn't a removal, but the letter still gets a statement of reasons saying it was automatic.
3. A reviewer decides in the staff console. The action is recorded, and the statement of reasons comes from a versioned template in `src/copy/`, sent by email and shown in the workspace. The letter can appeal, and a different reviewer takes the appeal.
4. Every time staff open an organisation's data during a case, `staff_access_log` records it.

## Search and ranking

- **Indexes on `public_listings`:** a partial index on live listings; B-tree on latitude and longitude; B-tree on rent, bedrooms and available-from; GIN on features and search text.
- **Best match**, in `domain/search/ranking.ts`:
  - score = 100 × fit + 20 × freshness + 10 × completeness;
  - fit, from 0 to 1: how close availability is to the renter's date, headroom within their budget, and distance from a point they searched around;
  - freshness: exp(−days since the letter last confirmed ÷ 14);
  - completeness, from 0 to 1: 8 or more photos, a floor plan, the size, and a description of 400 characters or more;
  - ties: newest first.
- **No payment input.** The ranking function's input type has no field for payment, plan or letter size, and a compliance test fails if one is added (M59).
- **Place search:** `pg_trgm` and `unaccent` over names, Irish names and aliases, ordered by kind, then by the number of live homes.
- **Drawing an area:** a GeoJSON polygon from the map, validated to at most 100 points and 2,000 km².
- **Scale:** planned for 10,000 live listings and 200,000 saved searches; a search query under 100 ms at p95, load-tested on synthetic data at ten times that.

## Maps and places

- **MapLibre GL JS**, loaded only when the map opens or scrolls into view.
- **Base map:** an OpenStreetMap extract of the island of Ireland in Protomaps PMTiles format, stored in Supabase Storage and read with range requests. `pnpm tokens` will also generate the map style from the design tokens, so the map re-skins with everything else. Attribution: "© OpenStreetMap contributors".
- **No Google or Mapbox scripts.** "Open in Google Maps" is a plain link.
- **Address entry:** the Eircode's format is checked and the Eircode stored. The letter places the pin, and the place is found by point-in-polygon against `places`, in domain code. An Eircode lookup service (Autoaddress) could fill in the address and pin automatically; it's optional and needs approval (rule 10).
- **Places:** counties and towns from Tailte Éireann open data (CC BY 4.0). Areas come from OpenStreetMap suburb and neighbourhood boundaries where they exist, otherwise from Electoral Division boundaries grouped by hand for the most-searched areas. Aliases include Irish names, "Dublin 6" and common spellings.
- **Nearby:** transport stops from the NTA's GTFS feeds and schools from the Department of Education's lists. Walking distance is straight-line distance × 1.3 until a routing engine arrives.
- **Commute time (Should, M63)** needs a routing engine. OpenTripPlanner with GTFS and OpenStreetMap is self-hostable, but it needs a long-running server that Vercel and Supabase don't provide. That's a hosting decision for when we get there.

## Accounts, sessions and roles

- **Better Auth for everyone** (ADR-0013's library), with the email OTP and magic link plugins, and passkeys (M5, M6). Sessions are server-side, with `__Host-` cookies.
- **One person, several roles:** renter, member of one or more organisations, and Gaff staff. The interface switches between "Renting" and "Letting".
- **Private links stay** (ADR-0013) for renters from Daft and MyHome, and for landlords. "Save to my account" (M4) confirms the email by code and sets `applications.renter_user_id`.
- **Staff:** allow-listed accounts, a passkey required, 8-hour sessions, and every action logged.
- **Sensitive letter changes**, such as the payment account or the rent of a live listing, ask the letter to sign in again first.

## Notifications

- **Email:** Resend, from two subdomains, transactional (sign-in codes, messages, the workflow) and alerts. A spike in alert volume can't affect the delivery of sign-in codes. Bulk mail carries `List-Unsubscribe` with one-click unsubscribe. Open and click tracking stay off, as now.
- **SMS:** Sinch, for mobile confirmation codes and viewing reminders only.
- **In the app:** messages and status changes, with a count.
- **Browser notifications (Should):** Web Push with our own VAPID keys. Messages are encrypted end to end, but they pass through the browser makers' push services, so the DPIA covers them before they're switched on.

## Rendering, caching and SEO

| Page | Rendering | Regenerated when |
| --- | --- | --- |
| Home and area pages (`/to-rent/[county]/[area]`) | Static | A listing in the place changes (`place:{id}` tag), at most every 5 minutes |
| Filtered searches | Per request, shared cache for 30 seconds | Not needed |
| Listing (`/home/[slug]-[id]`) | Static | The listing changes (`listing:{id}`) |
| Development (`/developments/[slug]`) | Static | `development:{id}` |
| Agency (`/agencies/[slug]`) | Static | `agency:{id}` |
| My homes, the workspace, staff pages | Per request, private, never cached | Not needed |

- **Structured data:** JSON-LD on listings (`Apartment` or `House`, with an `Offer` for the monthly rent), area pages (`ItemList`), agencies (`RealEstateAgent`) and developments (`ApartmentComplex`).
- **Sitemaps** for listings, places, developments and agencies, regenerated hourly, with `lastmod` from the latest revision.
- **Link previews** made with `next/og`.
- **Indexing:** filtered searches are `noindex, follow` unless they match an area page. A let or withdrawn listing is marked as such and `noindex` for 90 days, then returns 410 Gone (M74).
- **Addresses in URLs** use only the address the letter chose to show: never the Eircode or anyone's name.

## Measurement

- **Listing views:** the page sends a beacon to `/api/v`, and the server counts it against the listing and the day. Unique visitors come from a hash of IP address and browser with a salt that changes daily and is never stored, so nobody can be followed across days. No cookies. Known bots aren't counted.
- **Vercel Web Analytics** (cookieless) for traffic and page speed.
- **Funnels** (search, listing, enquiry, viewing, let) are counted per day from events, without personal data.

## Security and abuse

| Threat | Defence |
| --- | --- |
| Bots signing up or sending mass enquiries | Postgres rate limits per action, IP hash and account (M82); Vercel Firewall rules for floods. Vercel BotID to evaluate: it uses a third-party engine, so its sub-processor needs checking first |
| Scam letters | Checks before the first listing (M22 to M27), risk holds (M29), warnings about money (M28) |
| A letter's account taken over | Passwordless sign-in, emails about new devices, passkeys (M6), and signing in again before payment-account or rent changes |
| Personal data leaking through public pages | Public tables are an allow-list, tested; no personal data in URLs or events |
| A renter reading someone else's application | Row-level security on `renter_user_id`; renter queries select explicit columns, tested |
| Staff seeing more than a case needs | Access only through a case, and logged |
| Harmful uploads | Signed uploads to a private bucket; type checked from the bytes; every photo re-encoded; originals deleted |
| Script injection in listing text | Plain text only, escaped. A strict Content Security Policy with no third-party scripts |
| Letters' tour links used to reach our servers | Allow-listed hosts; the server never fetches a letter's URL |
| Scraping listings | Listings are public by design; rate limits stop abuse; there's no personal data to scrape |

## Privacy and retention

| Data | Kept until | Deleted by |
| --- | --- | --- |
| A renter account without "keep my details" | Their last application is deleted and they have no saved homes or alerts | Retention job |
| A renter profile ("keep my details") | The renter deletes it, or 2 years after they last used it (Q25) | Retention job |
| Saved homes and saved searches | The renter deletes them, or the account goes | Renter, or the retention job |
| Alert deliveries | 90 days | Retention job |
| Profile shares (IDs only) | With the application's anonymous record (12 months, Q3) | Retention job |
| ID checks on landlords | Result, verified name and date while the account is active, plus 12 months. Stripe's session is redacted after 30 days | Retention job; Stripe redaction |
| Reports | 6 months after the case closes (proposed, Q36) | Retention job |
| Listing revisions | 12 months after the letting closes | Retention job |
| A let or withdrawn listing's public page | 90 days after it closes (M74) | Retention job |
| Visitor hashes behind the daily view counts | The end of the day (Irish time); only the counts stay | Retention job |
| The PSRA register | Replaced each week | Import job |
| Photos | While the home stays in the letter's account. Public copies go when the listing's page goes | Media job |
| Letters' copies (applications and the rest) | As now (Q3, Q25) | As now |

## Performance and scale

- **Supply:** fewer than 2,400 homes advertised to rent nationally (August 2026). Planned for 10,000 live listings.
- **Demand:** planned for 1 million visits a month in the first year, mostly served from the CDN.
- **Budgets:** search page JavaScript under 120 KB gzipped before the map loads; listing page under 100 KB; the first photo under 120 KB at 960 px.
- **Database:** the Supabase pooler in transaction mode, partial indexes on live listings, and load tests (k6) on synthetic data at ten times the plan.
- **Cost:** photo egress is the largest running cost. Fixed sizes and long CDN caching keep it down, and the media port lets photos move elsewhere without touching the rules.

## Testing

The approach stays as in ADR-0012: rule, then code, then screen, with synthetic data only.

**New compliance tests:**

- M59: ranking takes no payment, plan or letter-size input.
- M46, M99: blocked wording can't be published by any route (create, edit, AI draft, answers), checked against a golden set of discriminatory phrases and innocent ones that must pass, such as "family bathroom" and "professionally managed".
- M39: the deposit can't exceed one month's rent, and BER is required.
- M11: each profile group is copied to a letter only at its stage.
- Public tables contain only allow-listed columns.
- M103: no third-party scripts (a Content Security Policy test, and a build check of script sources).
- M98: every removal or restriction has a statement of reasons.
- M86: every alert email has a working one-click unsubscribe.

**Also:**

- **End to end (Playwright with axe):** journeys J1 to J7 from the PRD, renter pages at phone size, the map's list alternative, and the gallery by keyboard.
- **AI evals:** description drafts cite only the facts entered; a golden set for the moderation classifier; the photo checks.
- **Load:** search, map points and enquiry submission.

## Migration from today's schema

Every step is additive, with no downtime:

1. Add `homes`, backfill one per existing letting, and add `lettings.home_id`.
2. Add `listings` as drafts for existing lettings. Nothing becomes public.
3. Extend `organisations` and `memberships`, setting their kinds from today's data.
4. Add the renter zone and renter sign-in. Private links keep working.
5. Add the public tables, places and reference data.
6. A `MARKETPLACE_PUBLIC` flag keeps public pages and sign-ups dark until launch. For the letter beta, it's on for invited organisations only.

## Delivery plan

Each milestone follows rule, then code, then screen, with requirement IDs in commits and tests. L is about the size of workflow Slice 1, and M about half. Dates depend on the founders' hours.

| # | Milestone | Requirements | Size |
| --- | --- | --- | --- |
| 1 | Foundations: data zones and helpers, homes and listings, places, the maps spike, the photo pipeline | M31, M33, M38, M43 | L |
| 2 | Accounts and checks: renter and letter sign-up, agencies and agents, SMS codes, PSRA import, Stripe Identity, the check queue | M1 to M5, M15 to M19, M22 to M27, M30, M105 | L |
| 3 | Listing: create and publish, publishing checks, equality and risk rules, freshness, statuses, developments and bulk add, the letter's listings | M29, M32, M34, M35, M37, M39 to M52, M91 to M94 | L |
| 4 | Search and pages: search, filters, map, results, listing, development, agency and area pages, SEO, measurement | M56 to M62, M66 to M75, M109 to M112 | L |
| 5 | Enquiry to workflow: the enquiry sheet, renter profile and sharing, My homes, messages in the app, one list for letters | M8, M9, M11 to M13, M28, M76 to M83 | L |
| 6 | Saved homes and alerts | M10, M85 to M88 | M |
| 7 | Reports and review: the report form, review queue, statements of reasons, account actions, policies | M96 to M103, M106, M107 | M |
| 8 | Launch readiness: speed and load, a security review, the DPIA, legal wording, the letter beta | None new | M |

After launch, the Should items follow in this order: M53, M36, M63, M89, M54, M84, M64, M6, M20, M21, M95, M104, M108.

## Vendors and data sources

| Need | Choice | Status |
| --- | --- | --- |
| Hosting, database, storage and CDN | Vercel (Dublin) and Supabase (Ireland), including Supabase Storage | Approved (Q26) |
| Email | Resend | Approved |
| SMS | Sinch (EU) | Approved |
| AI: description drafts, moderation, photo checks, alt text | Claude on Amazon Bedrock (EU) | Approved |
| ID checks for private landlords | Stripe Identity | Approved by Sean on 7 November 2026 (Q29). Needs its DPA terms and the privacy notice before launch |
| Address and Eircode lookup | Autoaddress, optional | Needs approval. Launch works without it |
| Bot detection beyond rate limits | Vercel BotID, to evaluate | Check its sub-processor first |
| Browser notifications | Web Push through the browsers' push services | DPIA before switching on (Should) |
| Map data | OpenStreetMap (ODbL), self-hosted | Data licence and attribution |
| Boundaries | Tailte Éireann open data (CC BY 4.0) and the CSO | Data licence and attribution |
| Transport stops | National Transport Authority GTFS | Data licence |
| Schools | Department of Education | Data licence |
| Licence checks | The PSRA register, published weekly on psr.ie | Public register; the solicitor confirms our use (Q36) |
| Sign in with Apple or Google | Not at launch (M7) | Would need approval |

## Risks and spikes

| Risk | Spike or answer |
| --- | --- |
| Range requests and egress for map tiles from Supabase Storage | Spike in milestone 1, with Vercel Blob as the fallback |
| HEIC photos in browsers other than Safari | Spike: the WebAssembly decoder's size and speed on a mid-range phone |
| Boundaries for Dublin neighbourhoods | Spike: OpenStreetMap's coverage; Electoral Divisions grouped by hand for the top 200 areas |
| Stripe Identity with Irish documents (passport, driving licence) | Spike with test documents; watch pass rates in the beta |
| The PSRA register file changes format | The manual queue as a fallback, and a test against the last good file |
| Moderation flags that annoy letters | Rewrite suggestions, the golden set, and a weekly look at holds during the beta |
| Photo egress cost | Fixed sizes and long caching, monitored; the media port allows a move |
| Liability for discriminatory ads | Blocking checks from day one; the solicitor (Q36) |

## ADRs

- ADR-0015: The marketplace lives in the modular monolith
- ADR-0016: Renter accounts alongside private links (amends ADR-0013)
- ADR-0017: Data zones: organisation, renter, public and staff
- ADR-0018: Homes, lettings and listings
- ADR-0019: Search and alerts on Postgres
- ADR-0020: Self-hosted maps and open data
- ADR-0021: The photo pipeline
- ADR-0022: Checking letters
- ADR-0023: Moderation: rules first, AI second, people decide
- ADR-0024: Ranking that can't be bought
