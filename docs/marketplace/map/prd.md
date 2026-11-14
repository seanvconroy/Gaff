# The live map: product requirements

Draft for the founders, 8 November 2026 · built on 13 and 14 November 2026, except the release: [where the gates stand](#where-the-gates-stand-14-november-2026), and what the build changed, are marked below · requirements M125 to M137, and amendments to M38, M117, M119 and M120 in the [marketplace PRD](../prd.md) · goes with the [technical specification](tech-spec.md) · builds on the [search redesign PRD](../search-redesign/prd.md) and [ADR-0027](../../adr/0027-places-index-on-google-maps.md)

## Summary

The search redesign built the map, but nobody has seen a real one yet. The test copy shows a stand-in, a plain grid marked "Test map: not Google Maps", and production shows no map at all. This document takes the map live: Google's map, every home at its real point, checked against the law, Google's terms and a budget, and polished until it feels like Gaff.

- **Why now:** renters judge a home by where it is before almost anything else, and the stand-in can't show them. Every home also sits at its area's centre today, because letters can't place a pin yet (M38). So the test copy's nine homes show as three piles on a blank grid ([where we are](#where-we-are)).
- **What "ready to go live" means:**
  1. **Real.** Google's map, with each home where it is, or within about 150 m when the letter hides the exact address.
  2. **Lawful.** The privacy notice, Gaff's terms and the DPIA cover Google Maps. Google's terms are kept. Whether the map needs a tap before it loads (S2) is settled.
  3. **Reliable and affordable.** When the map fails, for any reason, the list carries on and says so. Spending can't pass the budget. We can see how the map is used and how often it fails.
  4. **Polished.** The map moves only when it should. Pins are easy to tap and read. It looks like Gaff in light and dark, and everything works without a mouse and without dragging.
- **No new vendor:** Google Maps Platform, the Maps JavaScript API only, was approved on 8 November 2026 (Q58, rule 10).
- **What we need from the founders:** the monthly budget (S1) and who owns the Google Cloud account (S9). With the solicitor: whether the map needs a tap (S2), and the DPIA.
- **How it's built:** see the [technical specification](tech-spec.md). It starts with a week of spikes on a development key, because some answers can only come from Google's real script.

## Where we are

From the test copy (the screenshot shared on 8 November 2026), the code in `src/app/(public)/to-rent/map/`, and [status.md](../../status.md). "To confirm" means the code points to the problem, but only the real map can prove it.

**Built:** list and map side by side from 1128px, and a Map button on phones (M57). Price pins, clusters, a mini card, and pins and cards that light each other up (M117). Searching the map area, and drawing an outline. The map loads only when it's on screen (M119), and the list says so when Google's script can't load (M120). `MAP_PROVIDER` switches between Google and the stand-in. The search pages allow Google's hosts in their content security policy. "Map and place data" credits the sources.

**Missing or wrong:**

| # | Finding | Effect | How we know |
| --- | --- | --- | --- |
| 1 | No Google Cloud project, keys or Map IDs yet | The test copy shows the stand-in. Production shows no map, because `MAP_PROVIDER` defaults to `none` there | [deploy.md](../../deploy.md), step 6 |
| 2 | Homes sit at their area's centre (`approximateLocation` in `src/domain/places/locate.ts`). The letter's pin (M38) isn't built, and the test copy's made-up homes have no points of their own | On a real map, each area's homes would pile up on one spot, often in a park or the middle of a road | The screenshot: nine homes in three clusters; the code |
| 3 | Only a failure to load Google's script is caught. A wrong key, a blocked website, billing or the daily cap make Google draw its own grey error box | The renter sees Google's error instead of our sentence, and the cap (our cost control) would look like a broken site | The code (`APIProvider`'s `onError` only) |
| 4 | Every page sends `Referrer-Policy: no-referrer` (`next.config.ts`). The key's website restriction checks where requests come from | The real map may fail everywhere once the key is restricted, as the deploy guide says it must be | The code; to confirm in the spike |
| 5 | Google's script sends Google the page's address without its query: the place a renter searched, though not their filters. _Corrected in the build, which read and ran Google's script_ | Google could learn where a renter is looking for a home | Settled: Google is now told the site's address alone |
| 6 | The map refits to the search's starting box after every navigation, because it reacts to a new box object each time | Changing a filter throws away the renter's zoom. A map-area search refits to its own box, and can creep outwards | The code (`Camera` in `GoogleMap.tsx`); to confirm |
| 7 | Every move after the first counts as the renter's | Resizing the window, turning a tablet, or a phone's toolbar can switch the search to "Map area" | The code; to confirm |
| 8 | Hovering a card re-clusters every pin. The clusterer is never removed from a map that's reused | Jank with many pins, and leftover clusters after coming back to a search | The code; the leftovers to confirm |
| 9 | Homes at the same point stack, and the top pin hides the others. Developments (M32) put many homes at one point | Renters can't reach some homes from the map | The code |
| 10 | Pins are about 34px tall and edged in the decorative `border`. Focusing a pin with the keyboard doesn't light up its card. The stand-in gets both right | Hard to tap on a phone, and the two providers behave differently | `map.module.css`, `GoogleMap.tsx` |
| 11 | The pins don't follow the map's theme. (Gaff has no theme chooser of its own yet, so "dark" means the device's setting) | A light map with dark pins, or the reverse | Fixed in the build: the pins follow the map |
| 12 | Drawing needs a drag. The only ways to move the map are dragging and the keyboard | Fails WCAG 2.2's 2.5.7, Dragging Movements (AA) | The code |
| 13 | Google's zoom buttons keep their default corner, at the bottom right, where the phone's row of cards sits | The zoom buttons may be hidden on phones | The code; to confirm |
| 14 | On larger screens, Google's script starts as soon as the page's code has loaded and the map column is on screen, while the first photos may still be loading | It competes with the first photos, which decide LCP | The code |
| 15 | No test proves that nothing calls Google before the map shows, and no test run uses the real map | M119 and the content security policy are unproven with Google | `tests/`, CI |
| 16 | The map's counts (opened, failed, area searched, shape drawn, pin opened) aren't recorded | We can't check Google's bill or see failures | The code |
| 17 | The privacy notice doesn't name Google Maps, Gaff has no terms page yet, the DPIA isn't written, and S1 and S2 are open | Production can't switch the map on | [launch-checklist.md](../../launch-checklist.md) |

## Goals and measures

| Goal | Measure | Target |
| --- | --- | --- |
| Homes are where they are | Live homes pinned at an area's centre | None |
| The map works | Map opens that end with the map on screen (first-party counts, M133) | 99% or more, not counting renters' own blockers |
| Failures are calm | Failure kinds that show Gaff's sentence: blocked, offline, key, website, billing, the cap, too slow | All of them, each tested |
| Speed holds | p75 on phones with the map in use: LCP, INP, CLS | 2.5 s, 200 ms, 0.1 or less (unchanged) |
| Spending holds | Google Maps spend against the monthly budget (S1) | Never over; alerts at 50%, 80% and 100% |
| Accessible | WCAG 2.2 AA: axe in every map state, plus VoiceOver on iOS and NVDA on Windows | No failures |
| Renters use it | Searches with the map opened; map-area searches; pins opened | Tracked from launch; targets once there's a baseline |
| The founders are happy with it | A walkthrough on a phone, a tablet and a laptop | Signed off |

## Principles

1. **The list leads; the map helps.** Every home on the map is in the list, and the list never waits for the map.
2. **Real or not at all.** A pin is where the home is, or as close as the letter allows. A home without a real point isn't pinned.
3. **Calm when it fails.** One plain sentence and the list. Never Google's error box.
4. **Google gets the least.** Only while a map is on screen, only what drawing it needs, and only on the pages that show it.
5. **Capped by design.** A daily cap and a budget, not good intentions.
6. **Gaff's look on Google's map.** Our pins, colours and words. Google's logo and terms are never covered.

## Scope

**In this release:**

- the search map on Google, on phones, tablets and laptops, in each environment;
- the letter's map pin in the listing editor (M38), and realistic points for the test copy's made-up homes;
- the polish and fixes in [where we are](#where-we-are);
- what Google needs set up: projects, billing, keys, Map IDs, styles, budget alerts and daily caps;
- what the law needs: the privacy notice, Gaff's terms, the DPIA and S2;
- how we know it works: spikes, a test run with the real map, a manual check list, and counts.

**Next, on the same map:** the listing page's map, with nearby transport and schools (M71).

**Not now:** satellite or Street View inside Gaff (the listing page's "Open the area in Google Maps" link stays), any other Google API (Places, Geocoding, Routes), "near me", commute times (M63), and clustering on the server.

## The experience

As in the [search redesign](../search-redesign/prd.md#the-map-m57-m117-m119-m120), except where this section says otherwise.

### Loading (M119, M131)

- **On a laptop,** the map column holds its space from the start, in `surface-2`, with no spinner. Google's script starts once the results and their first photos have shown, not at first paint.
- **The map fades in** once Google has drawn it, so its unstyled first frame never flashes. With reduced motion, it simply appears.
- **On phones,** the map loads when the renter taps Map, as today.
- **Search-engine robots** get the list alone. Robots that browse like a laptop would otherwise cost a map load each.

### Pins (M117)

```
 default          hovered or focused   chosen              same point          cluster
 ( €2,250 )       ( €2,250 )           [ €2,250 ]          ( 3 homes )         ( 12 )
 white pill,      navy edge, raised    navy, nav-ink       one pin for homes   navy ring
 border-strong    above the others     text, on top        at one point        and a count
```

- **Default:** a white pill (`surface-1`) with the rent in `ink`, edged in `border-strong`, which is 3:1 against the map's land, with `shadow-overlay`.
- **Hovered or focused:** hovering or focusing the home's card, or the pin itself, raises the pin with a navy edge. A home inside a cluster gets a raised pin above the cluster, and the cluster doesn't break apart.
- **Chosen:** navy with `nav-ink` text, on top of everything. Its mini card opens on a laptop; on a phone, its card scrolls into the row.
- **Visited:** a quieter tint, for this visit only.
- **Same point (M117):** homes at one point (an apartment block, a development, or approximate points that land together) share one pin, "3 homes". Choosing it lists them in the mini card on a laptop, or in the row of cards on a phone.
- **Size:** at least 44px tall to tap, even where the pill looks smaller. The text is 16px.
- **Keyboard:** pins are buttons named for their home ("€2,250 a month, 2 bed apartment in Ranelagh, Dublin 6"), with Gaff's focus ring. Focusing one lights up its card. "Skip the map" jumps past them all.
- **Clusters** show a count, are named "12 homes here: zoom in", and zoom in when chosen. A cluster that zooming can't split, because its homes share one point, becomes a same-point pin.

### How the map moves (M127)

- **The map moves by itself only when the search area changes:** a new place, a new distance, a drawn shape, or "Remove shape". It fits the area, as today.
- **Changing a filter, the sort or the page keeps the renter's view.** The pins change; the map stays where it is.
- **Only the renter's own move searches the map area:** dragging, pinching, scrolling to zoom, the pan and zoom buttons, or the keyboard. Resizing the window, turning a phone or tablet, a phone's toolbar appearing, or the mini card opening never do.
- **After a map-area search,** the map stays exactly where the renter left it.
- **With reduced motion,** the map jumps instead of gliding.

### Without dragging (M128)

- **Pan and zoom buttons** at the top right: Google's camera control, with arrows and zoom, so the map can be moved with taps alone (S8). Keyboard users also have Google's arrow keys, + and −.
- **Draw by tapping:** the drawing note says "Draw round the area with your finger or mouse, or tap its corners and choose Done." Each tap adds a corner, joined as it goes. "Done", or tapping the first corner again, finishes the shape. "Undo" removes the last corner.
- **Keyboard users** move the map with the keyboard instead of drawing, and the map-area search follows.

### Look (M129, M130)

- **Style:** taken from Gaff's tokens, in a Map ID styled in Google's console:
  - land in `surface-2`, water in `sky` (a quiet Atlantic tint), roads in `border`, and labels in `ink-muted`;
  - businesses and other points of interest hidden, so homes stand out; transport lines and stations kept;
  - signed off by design on a phone and a laptop, in both themes.
- **Dark (M130):** when a renter's device is set to dark, the map is dark too (and it will follow Gaff's own theme setting when there is one), and pins and clusters use the dark tokens. If the dark style isn't ready for launch (S7), the map stays light in both themes, and its pins stay light with it.
- **One accent:** the searched area's outline stays the screen's Atlantic accent.
- **Controls:** Draw at the top left, pan and zoom at the top right, and Google's logo and terms along the bottom, never covered. On the phone's map view, the row of cards stays clear of Google's logo and terms.
- **Credits (M137):** when the map shows a street or area outline from Gaff's place index, a small "Places © OpenStreetMap" credit sits beside Google's, without covering it.

### When the map can't load (M120)

| Cause | What the renter sees |
| --- | --- |
| A blocker, the network or the content security policy stops Google's script | "The map isn't available right now. Every home is still in the list." where the map would be |
| A problem with the key, the allowed websites or billing | The same |
| The day's cap on map loads is reached | The same, until the cap resets at about 8am Irish time |
| Google's map hasn't appeared after 10 seconds | The same |
| On a phone, after tapping Map | The same sentence, with the List button to go back |

Gaff's sentence replaces Google's grey error box in every case, and each failure is counted by its kind (M133).

### A tap before the map, only if S2 needs it (M134)

If the DPIA finds that Google's script reads or stores something on the renter's device that showing the map doesn't need, the map on larger screens waits for one tap:

```
┌──────────────────────────────────┐
│                                  │
│     The map is from Google.      │
│   Showing it sends Google your   │
│   device's internet address and  │
│   the area on screen.            │
│                                  │
│        ( Show the map )          │
│   About the map and its data     │
│                                  │
└──────────────────────────────────┘
```

- **The choice is remembered** for the visit, or on the account of a signed-in renter. It can be undone on "Map and place data". It's never kept in a cookie.
- **On phones,** tapping Map is already that request, so there's no second tap.

### Privacy (M119)

While a map is on screen, Google receives the device's internet address, browser details, the map's area and zoom, and the site's own address without the page (for example `https://app.gaff.ie`). It never receives the page's address, the search's filters or words, the renter's account, or which homes they open. The build confirmed this on Google's real script, and a nightly test checks every request. Google's script runs only on the search pages and the listing editor: going to or from them is a full page load, so the script is never loaded on a page where someone enters personal details ([technical specification](tech-spec.md#privacy-what-google-receives)).

### Counts (M133)

Counted by day: the map opened (on a phone or a larger screen), shown, failed (by kind), searched by its area, a shape drawn, a pin opened, and a same-point list opened. Nothing about the renter, their device, the area or what they searched for. The founders see them each month beside Google's billed map loads.

## The letter's map pin (M38)

The map is only as real as its points. Today a home sits at its area's centre until the letter places a pin, and there's nowhere to place one.

```
┌──────────────────────────────────────────────────┐
│ Where is the home?                               │
│ Drag the pin to the front door, or tap the map.  │
│ ┌──────────────────────────────────────────────┐ │
│ │                                     [<][>]   │ │
│ │        map, on Highfield Road       [+][-]   │ │
│ │                 (pin)                        │ │
│ │                                              │ │
│ └──────────────────────────────────────────────┘ │
│ The pin is on Highfield Road, Rathgar, Dublin 6. │
│ ( Save the location )                            │
└──────────────────────────────────────────────────┘
```

- **Where it starts:** on the address's street, found in Gaff's own place index, which holds every street's line, in the home's area. If the street isn't found, at the area's centre, zoomed in.
- **Moving it:** drag the pin, tap the map where the home is, or focus the pin and use the arrow keys. A line under the map names the street or area the pin is in, so a screen-reader user knows where it is.
- **A check (M126):** if the pin is outside the area in the address, Gaff asks: "This pin is in Rathgar, but the address says Rathmines. Is that right?" The letter can keep it.
- **No address services:** no geocoding and no Eircode lookup. Google's geocoding results can't be stored or shown with a map under its EEA terms, and Autoaddress isn't approved.
- **Privacy:** the point is the letter's own data. Renters see it exactly only if the letter chose to show the full address. Otherwise they see a point within about 150 m, as today. The point never goes into an event or a log.
- **Before a listing goes live,** it needs a placed pin. Homes listed before M38 get a task on the dashboard, "Place the pin for 14 Rathmines Road", and stay off the map until it's done (M125).
- **The test copy's made-up homes** get points on real streets in their areas, with made-up house numbers. Some hide the exact address, so approximate points get tested too.

## Release gates

The map reaches production only when every gate is passed. The test copy gets the real map as soon as gates 1, 4 (for the test copy) and 5 are done, so the founders can try it early.

| # | Gate | Proof | Who |
| --- | --- | --- | --- |
| 1 | The spikes are done and written up: what Google's script sends, stores and fetches; the referrer policy; the content security policy; dark styling; how the cap shows | Findings in the [technical specification](tech-spec.md#findings) | CTO |
| 2 | S2 is decided with the DPIA, and M134 is built if it's needed | The DPIA's section on Google Maps, signed | Solicitor, founders |
| 3 | The privacy notice names Google Maps: an independent controller, no EU region, transfers under the EU–US Data Privacy Framework. Gaff's terms carry Google's notice (EEA Terms of Service 3.2.2) | Pages live; the solicitor's sign-off (Q36) | Solicitor |
| 4 | The budget is set (S1). Budget alerts and a daily cap in each environment; separate restricted keys; previews use the stand-in | Entries in the runbook | Founders, CTO |
| 5 | The map's style comes from the tokens, light and (S7) dark, and is signed off | Screenshots on a phone and a laptop | Design |
| 6 | M38 is built. Every live home has a placed pin, and none sits at an area's centre | The runbook's check returns none | CTO |
| 7 | Every failure kind shows M120's sentence | The real-map test run | CTO |
| 8 | Nothing calls Google before the map shows, and each page sends the right headers | End-to-end and compliance tests | CTO |
| 9 | The speed budgets hold with the real map | Measured on a mid-range Android phone over 4G, and on a laptop | CTO |
| 10 | Accessibility: axe in every map state; VoiceOver on iOS and NVDA on Windows; M128 | Written results | Design, CTO |
| 11 | The devices and browsers check list passes | The check list in the technical specification | Founders, CTO |
| 12 | The runbook covers turning the map off, the cap, rotating a key, and a key used by someone else | [deploy.md](../../deploy.md) | CTO |
| 13 | The founders' walkthrough on a phone, a tablet and a laptop, with the real map | Sign-off | Founders |

## Requirements

The marketplace PRD's sections F and G carry these, as amended, since the build (14 November 2026).

### Amended

| ID | Requirement | Priority |
| --- | --- | --- |
| M38 | The letter places the home's pin on Google's map in the listing editor. It starts on the address's street, from Gaff's place index, or at the area's centre; the letter drags it, taps the map, or moves it with the arrow keys. No address or geocoding service is used. The letter chooses whether renters see the exact address or only the street and area. The Eircode is never shown | Must |
| M117 | Map pins show the rent. A card and its pin light each other up, by hover or by keyboard focus. Clusters show a count. A pin opens a mini card. Homes at one point share a pin ("3 homes") that lists them. Every pin is at least 44px tall to tap | Must |
| M119 | Google's map loads only when it's on screen, after the results, and never for search-engine robots. Renters' devices don't call Google otherwise. Google receives only what drawing the map needs, never what the renter searched for or typed, or who they are. Google's script runs only on pages that show the map, and goes when the renter leaves them. Google's attribution is always visible | Must |
| M120 | When the map can't load, for any reason (a blocker, the network, the key, billing, the daily cap, no map within 10 seconds, or an error in the map's own code), the list still works and says so in Gaff's words, never with Google's error box | Must |

### New

| ID | Requirement | Priority |
| --- | --- | --- |
| M125 | Every pin is at the home's real point: the letter's pin, or a point within about 150 m when the letter shows only the street and area. No home is pinned at an area's centre. A home without a placed pin is in the list, but not on the map | Must |
| M126 | If the letter's pin is outside the area in the home's address, Gaff asks them to check it before the listing goes live. It never stops them | Should |
| M127 | The map moves by itself only when the search area changes. Changing a filter, the sort or the page keeps the renter's view. Resizing the window, turning a phone or tablet, or a phone's toolbar never counts as the renter moving the map | Must |
| M128 | Everything done by dragging on the map can be done without dragging (WCAG 2.2, 2.5.7): pan and zoom buttons, and drawing an area by tapping its corners | Must |
| M129 | The map's style comes from Gaff's tokens. Businesses are hidden and transport stays. Pins and clusters always suit the map beneath them | Must |
| M130 | The map is dark when the renter uses Gaff in dark: from their device's setting today, and from Gaff's own when it has one | Should |
| M131 | While the map loads, its space is held, and it appears once it's drawn, so nothing jumps and the unstyled map never flashes | Should |
| M132 | Spending on Google Maps is capped: a monthly budget with alerts at 50%, 80% and 100%, a daily cap on map loads in each environment, one map reused across a visit's searches, and no map for robots or preview copies | Must |
| M133 | Gaff counts by day, with nothing about the renter or their device, how often the map opens, appears, fails (and why), searches its area, has a shape drawn, and has a pin opened, beside Google's billed map loads | Must |
| M134 | If the DPIA finds that Google's script reads or stores anything on the device that showing the map doesn't need, the map on larger screens waits for one tap, remembered for the visit or on the account. On phones, tapping Map is that tap | Must, if S2 needs it |
| M135 | The founders can turn the map off, leaving the list, within minutes and without a code change. The daily cap turns it off by itself until the next day | Must |
| M136 | The real map is tested every night and before each release, in a production build: it appears, shows pins and Google's attribution, keeps the content security policy, calls Google only once it's on screen, and falls back as M120 says | Must |
| M137 | When the map shows a street or area outline from Gaff's place index, it credits OpenStreetMap, without covering Google's attribution | Should |

## Release plan

1. **Week one:** the spikes, on a development key. The fixes that need no decision start at once: failure detection, the camera, the clusterer and the pins.
2. **The build,** in the [technical specification's](tech-spec.md#delivery-plan) order. The test copy switches to Google as soon as its key, cap and style are ready.
3. **The founders try it** on the test copy, on their own phones and laptops. Meanwhile the solicitor and the founders settle S2, the privacy notice, the terms and the DPIA.
4. **Production** gets its own project, key, Map ID, budget and cap, then `MAP_PROVIDER=google`, with the marketplace's launch or before it.
5. **For the first two weeks,** someone looks every day at spending, map loads against visits, and failures; after that, every week. The cap is reset from real traffic at the end of the two weeks.

### Where the gates stand (14 November 2026)

| Gate | Stands | What's left |
| --- | --- | --- |
| 1 | Partly | Done without a key: what Google's script sends, stores and fetches; the referrer; how failures show. Left: a tighter content security policy, dark styling in one Map ID, a project over its cap, and other browsers |
| 2, 3 | Open | The solicitor and the founders. The findings are ready for the DPIA |
| 4 | Open | S1, then the projects, keys and caps in the runbook |
| 5 | Open | The styles are specified from the tokens; they're made in Google's console |
| 6 | Built | The runbook's check, on each copy, once pins are placed |
| 7 | Passed on Google's real script | Every failure kind, every night. The cap and billing-off rest on Google's documentation until tried with a key |
| 8 | Passed | Nightly, and in the compliance tests |
| 9 | Open | Needs the real map on a phone, and S11 |
| 10 | Partly | axe passes on the map's states, on the stand-in and on Google's real script. VoiceOver and NVDA are left |
| 11, 13 | Open | Need the real map on the test copy |
| 12 | Passed | [deploy.md](../../deploy.md), step 6 |

## Open questions

| # | Question | Proposal | Who |
| --- | --- | --- | --- |
| S1 | The monthly budget for Google Maps (still open) | €300 a month, with a daily cap of 1,500 map loads in production. A month at the cap is 45,000 loads: 10,000 free, then about $7 per 1,000, about $245 in all. Most phone visits never load the map, so most loads come from laptops | Founders |
| S2 | Does the map need a "Show the map" tap first? (still open) | On phones, no: tapping Map is the request. On larger screens, decide after spike A and the DPIA. M134 is designed and small | Solicitor, CTO |
| S5 | Homes without a placed pin: leave them off the map, or show them at their area? | Leave them off (M125). In production every listing has a pin before it goes live | Founders |
| S6 | If Google's script sends Google the page's address, do we keep the search out of it? | Answered in the build: yes, and without the frame. Google's script has a setting to send the site's address alone, and Gaff uses it | CTO |
| S7 | A dark map at launch? | Yes, with a second Map ID for the dark style, which is how it's built. One Map ID carrying both styles is still to try in Google's console. Design signs off both | Design |
| S8 | Google's camera control (pan arrows and zoom) on every screen size? | Yes, at the top right. It's the simplest way to meet 2.5.7, and it replaces the zoom buttons. Built this way | Design |
| S9 | Who owns the Google Cloud projects and the billing account? | Gaff's company billing account. Both founders as owners and the CTO as an editor, so no one person's account is the only way in | Founders |
| S10 | A pin outside its address's area: warn the letter only, or hold the listing for a person at Gaff? | Warn only (M126). If pins turn out to be unreliable, the check can hold the listing for a person at Gaff, as the wording check does (M97) | Founders |
| S11 | Opening a home from the search, and going back, are now full page loads, so that Google's script stays on the map's pages alone. Keep it that way? (new, from the build) | Yes for launch: it's simple and it can't leak. Measure how it feels on a phone at gate 9. If it's slow, the map moves into a frame, which keeps Google to the map and brings in-place navigation back, for about a week's work | Founders, CTO |

## Sources

Google's pages were read through search results on 8 November 2026; the week-one spikes check them against Google's live script.

- [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing): Dynamic Maps, 10,000 free map loads a month, then $7.00 per 1,000 up to 100,000, less at higher volumes
- [Maps JavaScript API error messages](https://developers.google.com/maps/documentation/javascript/error-messages): `gm_authFailure` for key problems; `OverQuotaMapError` and the darkened map
- [Map color scheme](https://developers.google.com/maps/documentation/javascript/mapcolorscheme): light, dark or the device's choice, set when the map is created
- [Content security policy guide](https://developers.google.com/maps/documentation/javascript/content-security-policy)
- [Google Maps Platform EEA Terms of Service](https://cloud.google.com/terms/maps-platform/eea): section 3.2.2, notices; section 4.5, the Controller-Controller Data Protection Terms
- [WCAG 2.2, Understanding 2.5.7 Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)
- [Data Protection Commission: guidance note on cookies and other tracking technologies](https://www.dataprotection.ie/en/dpc-guidance/guidance-note-cookies-and-other-tracking-technologies)
- [Airbnb](../../competitors/airbnb/search.md) and [Zillow](../../competitors/zillow/rent-search.md) teardowns: white price pins, zoom at the top right, Draw, and Google's attribution left clear
