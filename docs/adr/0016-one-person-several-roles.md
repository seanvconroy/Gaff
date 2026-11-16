# ADR-0016: One person, several roles; a silent organisation for a private landlord; profiles outside every organisation

- Status: Accepted (Sean, 14 November 2026, open questions Q28, Q32 and Q39). Extends [ADR-0004](0004-tenant-isolation-row-level-security.md): tenant isolation is unchanged, and a second kind of isolation is added beside it.
- Date: 2026-11-16

## Context

- Until now an "operator" was the only kind of account. Signing in led to one card, "Set up your workspace", which asked for a name, agency or landlord, a business name and a typed PSRA licence number. A person belonged to exactly one organisation.
- The UX redesign ([section 2](../ux-redesign/02-accounts-and-sign-in.md), UX-AC-1 to UX-AC-14, UX-AG-1 to UX-AG-7) makes the person the account. One person can work at an agency, let a home of their own and look for a home to rent, with nothing chosen at sign-up blocking anything later (Q28).
- Every tenant table has `organisation_id` and a row-level security policy (ADR-0004). That is what keeps one operator's applicants from another, and it must not be loosened.
- A typed licence number proves nothing. Nor does picking an agency from the PSRA's public register: it proves the agency exists, not that the person who picked it works there (Q32). Without that, a stranger could message renters in an agency's name and put their own bank account on a deposit request.
- What a person keeps about themselves is Gaff's to control, not any operator's (Q25, Q35). It must be out of every operator's reach, by construction and not by care.

## Decision

### One person, several contexts

A person is one row in `users` (Better Auth), however they sign in (ADR-0015). What they can do depends on what they hold:

| They hold | It is | On the letting or the renting side |
| --- | --- | --- |
| A membership of an agency | That agency, by its name | Letting |
| A membership of a landlord's team (`landlord`) | That team, by its name | Letting |
| A membership of their own silent organisation (`private_landlord`) | "My own homes" | Letting |
| `renting_since` on their profile | "Renting" | Renting |

Each is a **context**. The rules are pure functions in `src/domain/navigation/context.ts`: `contextsFor`, `currentContext` (the one that's open), `lettingContext` (the organisation a workspace page works for), `switcherFor` and `addableContexts`. The account menu is `accountMenuFor`.

- A person with one context sees no switcher. With just letting and renting, the menu reads "Switch to renting" or "Switch to letting". With more, each is listed by name.
- The context that is open is the one used last. The person's profile remembers the side (`last_side`) and the organisation they let for last (`last_organisation_id`). It changes when they switch, when they add a context, and as they use the workspace.
- A workspace page is on the letting side whatever was open last. `requireMember()` gives the person as a `Member` of the organisation they let for last. A `Member` is still one person in one organisation, and is still the only thing a decision can be made with (ADR-0007).
- Contexts are added from the account menu, and each starts at the step it needs: "Find a home to rent" (nothing), "Let a home I own" (nothing), "Join or set up an agency" (finding the agency).

### A private landlord's organisation is silent

`organisation_kind` gains `private_landlord`. The existing `landlord` is a landlord's team (UX-AG-10).

- It is made by `ensureOwnHomes` the first time it's needed: when someone chooses "I'm letting a home I own" or "Let a home I own", or saves their first home. Nothing is asked: no business name, no licence. A person has at most one.
- Its name, which renters see, is the person's first name for now (UX-AC-9). Its Gaff address is `home-` and eight random characters: the address is in reply-tos and in the web address of the privacy notice, so it never holds a person's name (rule 8).
- It is an ordinary organisation in every other way. Its lettings carry its `organisation_id`, behind the same policy as an agency's. Nothing in ADR-0004 changes, and its tests still pass.
- The tenancy agreement names the landlord in full, from the one member's name.

### A profile lives outside every organisation

`profiles` is keyed by the person, has no `organisation_id`, and has its own row-level security policy, `person_only` (`personPolicy()` in `src/db/schema/columns.ts`):

```sql
user_id = nullif(current_setting('app.person_id', true), '') or current_setting('app.rls_bypass', true) = 'on'
```

- `withPerson(userId, …)` sets `app.person_id` for one transaction. It is called with the signed-in person's own ID, from `src/server/accounts` only.
- `withOrg()`, the only path an operator's query has, never sets it. So inside it a query on `profiles` returns nothing, whatever it asks for, even for a member of that organisation. An integration test holds this (`tests/integration/ux-ac-accounts.test.ts`, "UX-AC-5").
- `withSystem()` can see profiles, for retention.
- What a renter keeps (WP-14) and a verified identity (WP-24) get tables of their own beside `profiles`, with `personPolicy()`.

Today the profile holds only what the account model needs: whether the person is renting, the context they used last, and where they are in first run. The name, email and sign-in methods stay in Better Auth's tables.

A use case the person starts themselves that also makes or joins an organisation (first run) sets both scopes in its one transaction, with `scopeToPerson` and `scopeToOrg`. Nothing else does.

### First run

One question per screen in `FlowShell`, never more than four, at `/welcome`:

1. "What's your name?", skipped when sign-in supplied it.
2. "What brings you to Gaff?", skipped when where the person was going already says (`purposeFromNext`): "List a home" is someone letting a home they own; Saved and Enquiries are someone renting.
3. Agency only: "Which agency?", a search over Gaff's copy of the PSRA register. Or its licence number, or "We're applying for a licence".
4. Agency only: "Is this your agency?"

Which screen opens is worked out on every visit from what is known (`nextStep`), so a person can leave at any step and come back to it. Their profile remembers that they said "agency". Choosing fixes nothing: the other roles stay in the account menu.

### An agency is found on the register, and confirmed by a person at Gaff

- **The register.** `psra_register` is Gaff's weekly copy of the PSRA's register (Q39): businesses licensed to let, category C, and nothing else. An employee's, a principal officer's or an independent contractor's own licence is dropped as the file is read and never stored. The PSRA is credited where the register is shown.
- **Refreshing it.** The job `psra_register_refresh` runs weekly. The source is behind a port (`src/ports/register.ts`): a made-up sample locally and in tests, the PSRA's download in production (`PSRA_REGISTER_SOURCE`, `PSRA_REGISTER_URL`). Production refuses the sample. A file that isn't the expected format, or that has lost more than half its businesses, fails loudly and leaves the copy as it was.
- **Being confirmed.** An agency made at first run has `confirmed_at` null. `goLiveGate` (`src/domain/organisations/go-live-gate.ts`) is the one rule: the admin can do everything except put a letting live. Their decision to go live is recorded as theirs, the letting is held, and it goes live when the agency is confirmed.
- **Confirming.** Someone on Gaff's own team (`Staff`, from `requireStaff()`) presses Confirm on `/internal/agencies`, once per agency. A founder can also set a pilot agency up already confirmed and invite its first admin by email: the invitation is the confirmation. Staff confirm agencies and do nothing else: they open no letting, send no message and make no decision (Q13). The record shows their one act with the actor `staff`.
- **A claim nobody has confirmed holds nothing.** Only a confirmed agency is "already on Gaff". Two people can each claim the same register entry; staff confirm the right one, and a unique index allows one confirmed agency per entry. Otherwise a stranger's claim would collect the real agents' requests to join.
- **The weekly re-check.** After each refresh every agency is checked against the copy. A licence gone from the register marks the agency lapsed and emails its admins. Live lettings carry on; no new one goes live until it's back.
- **What renters see.** The licence number on pages, in emails and in the agreement is the confirmed agency's, from its register entry (`licenceToShow`). An unconfirmed agency shows none.

### Invitations and requests to join

Both are pending memberships, and both are tenant tables: `organisation_invites` and `join_requests` carry `organisation_id` and the tenant policy.

- An invite is matched to the **verified** email of whoever signs in. It is accepted as sign-in finishes, works once, lasts seven days, and is deleted when accepted or by the retention job once expired. Looking one up by address crosses organisations, so it runs as the system, for that one address.
- A request to join is the agency's to answer. The person who made it can read their own row through a second policy, `own_row`. Showing and answering requests, and colleagues' invites, are work package WP-19.

### Nobody works on their own application

A member whose verified sign-in address enquired about a home their organisation lets can't open that letting in the workspace, and `recordDecision` refuses any decision on it from them (UX-AC-14, rule 1). An admin is told by email. Today the match is the email address, because an application isn't tied to a profile yet; WP-14 makes it the person.

## Consequences

- `findMember(userId)` no longer means "the one organisation": it is the organisation the person lets for now. Code that needs a specific organisation passes its ID.
- Every organisation kind is one of three. Code that asked `kind === 'landlord'` to mean "lets their own homes" asks `letsOwnHomes(kind)`.
- A typed licence number is gone, and with it the old set-up form and its test that an agency must give one. The rule it stood for (only a licensed agent lets for others, rule 5) is now held by `goLiveGate` and its tests: no licence on the register, nothing goes live.
- An agency set up before this has a typed licence number that nobody checked, and no register entry. The migration clears the typed number, so the agency reads as having no licence found yet: its lettings that are live carry on, its admin finds the agency on the register from the go-live step ("Find our licence"), and someone at Gaff confirms it. Only test data is in this state today.
- Production needs `PSRA_REGISTER_SOURCE=url` and `PSRA_REGISTER_URL`, and the parser's expected format must be checked against the real download first ([deploy.md](../deploy.md)).
- The copy of the register holds sole traders' names, which are personal data. Only what the lookup needs is kept. It is added to the DPIA ([launch-checklist.md](../launch-checklist.md)).
- A person's first run counts once in the funnel, whichever role they start with. A renter's finish is a funnel step of its own, since no organisation is made for the record to hold.
- Two row-level security scopes exist now. A table with `organisation_id` gets `tenantPolicy()`; a table that belongs to a person gets `personPolicy()`. A table that needs both readers gets the tenant policy and `ownRowPolicy()`.

## Alternatives considered

- **A profile as a column or two on `users`.** Simplest, but `users` is read wherever a name is shown, by every organisation. Anything on it is in every operator's reach. A separate table with its own policy keeps a person's own details out of reach by construction, and gives the renter's profile and the verified identity a pattern to follow.
- **No organisation for a private landlord: lettings owned by a person.** It would mean a second owner column on every tenant table and a second policy on each, and every query that says "this organisation's" would need an "or this person's". An organisation of one keeps ADR-0004 exactly as it is.
- **Keep one organisation per person, and a second account for a second role.** That is what Daft does for agents. It is the thing Q28 rules out.
- **Trust the register pick.** It is public, so it proves nothing about the person.
- **Confirm by the agency's email domain.** Many small agencies use Gmail or Outlook addresses, and a domain can be anyone's. A person at Gaff looking at the agency's own website, once, is a minute's work and is what Q32 decides. Joining by email domain is left for later (UX-AG-14).
- **Better Auth's organisation plugin.** It supports organisations, invitations and roles. Gaff already has `organisations` and `memberships`, with row-level security and an event record built on them; adopting the plugin's tables would mean moving both. The small pieces needed here are written against the existing tables.
- **Storing the open context in a cookie.** It would differ from one device to the next, and "Gaff reopens the context they used last" is about the person. It is on the profile.
