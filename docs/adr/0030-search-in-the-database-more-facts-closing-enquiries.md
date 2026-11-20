# ADR-0030: Search answered by the database, more of a home's facts, and enquiries that close

- Status: Accepted (brought across from the live line's M39, M40, M44, M52, M58, M59, M61, M116 and M122 on 20 November 2026; Q51)
- Date: 2026-11-20

## Context

The redesign read every public home into memory and matched it in Gaff's own code (`searchHomes`, `src/domain/search/match.ts`): right for a pilot, wrong once there are thousands of homes. Its letting recorded bathrooms, furnishing, the BER and parking, and left everything else renters ask about to free text. "Stop taking enquiries" (UX-LP-5) was designed and never built. The live line had all three. Q51 bounds the work: the redesign's filters stay as they are, and so does its order.

## Decision

- **Search in SQL.** One query (`searchOnGaff`, `src/server/search/query.ts`) finds a search's homes with what each misses, over the public homes as the public query defines them (`onGaff`, `openToEnquiries`), and a second reads the cover photo of the homes found. Its rules are the domain's, as SQL twins:
  - where a home is: `placePlan` turns the search's place into plain values (a county, a district's routing key, the names an address writes it by, a centre or a street's line and a distance), matched against the address as search reads it (`gaff_address_words`, an immutable SQL function, the twin of `addressWordsOf`, read from the address lines as they are, so nothing is kept that could go stale) and the point renters see (`publicPoint`, the 150 m snap for a private landlord done in SQL);
  - what a home misses: `missesOf`, point by point, in its order; at most one miss is "Close to what you asked";
  - the order: fits first, then close, each newest first, then by reference.
  The map's pins (`fitsOnly`), the counts beside places and on place pages (`countHomesIn`: one grouped query for any number of areas), the sitemap and similar homes (`similarCandidates`, `isLike` in SQL) read through the same rows. No PostGIS: haversine and the flat projection of `distanceToLineMetres` in plain SQL.
- **The in-memory rule stays as the spec.** `tests/integration/ba14-search-sql.test.ts` makes hundreds of generated homes and searches (every kind of place, "near" with each "Within", map areas, every filter) inside a transaction that is rolled back, and holds the SQL to `searchHomes`, `placeHasHome` and `addressWordsOf` exactly; with 4,000 homes a search's median stays well under a second.
- **More facts (M39, M40, M44).** `lettings.more_facts` (jsonb, `moreFactsSchema`): en-suites, floor area, floor and lift, heating, outdoor space, washing machine, dryer and dishwasher, broadband, the BER's number, and a tour link out to YouTube, Vimeo or Matterport only (`isTourUrl`). Asked behind "More about the home" on the existing home step and its sheets; read from a pasted advert where it says them (a BER's labelled number survives the phone-number strip); shown as highlights on the home's page; each one a fact with an ID the AI answers from. None is a filter, and none is kept in a saved search (Q51, rule 3).
- **Enquiries that close (M52, UX-LP-5).** `lettings.enquiries_close_at`: now, or a date and time ahead. From then the page stays and says so without "Ask to view", the home is in no search, waiting enquiries made on Gaff are dropped, and a portal enquiry from someone new gets the fixed reply `enquiries_closed@1` (no application is made; its address and words are cleared on the unplaced-email schedule). People already in the letting carry on. The lister opens them again from the same menu. The public rule gains this one condition (`openToEnquiries`), marked as such.

## Consequences

- The fixed reply is new wording for the solicitor; its words are pinned in `src/copy/templates/enquiries-closed.test.ts`, and the existing templates' fingerprint is unchanged.
- The saved-search alerts job still reads every public home and matches in memory: it runs in the background, not on a request, and matches each new home against every saved search, for which the in-memory rule is the right shape.
- The public page doesn't say when enquiries will close: UX-LS-9 (nothing to hurry anyone) wins over M52's "the listing says when".

## Alternatives considered

- **Narrowing in SQL, then matching in memory (the live line's way).** It still reads every candidate in a county; the one-miss group needs the miss count anyway, which SQL gives directly.
- **A stored column of address words.** A write path could forget it, and a generated text column is one more free-text column on a letting (`tests/compliance/fit.test.ts` allows none); reading the function per row is fast enough at several thousand homes, and an expression index can come later.
- **PostGIS.** A new extension on the database for two distance formulas Gaff already has.
