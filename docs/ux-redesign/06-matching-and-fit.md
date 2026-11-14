# 6. Matching and fit

Part of the [UX redesign PRD](README.md). This file designs the feature the founder asked for from screen 05b: the person letting says what they're looking for, renters see it, and both sides save time. It sets out how far that can go under the Equal Status Acts, and where it stops.

Requirement IDs: `UX-MT`.

**Status: decided** (Q36 in [`docs/open-questions.md`](../open-questions.md)). The founder's steer was: keep it objective, not subjective; make it clear whether a person fits what was asked; never recommend a person. The design below follows that. The solicitor reviews it with the criteria list before real users ([section 11](11-compliance-and-vendors.md#before-real-users)); that review doesn't hold up the build.

## The idea, and the line

The intent is right: most of the waste in a letting is people enquiring about homes that were never going to work for them, and operators reading enquiries that were never going to fit.

The founder's two first examples can't be used.

| Example | Why not |
| --- | --- |
| "A working couple" | "Couple" is civil status and family status. "Working" isn't a protected ground itself, but as a condition it screens out people whose income is HAP or another payment, which is the housing assistance ground |
| "College students only" | It works as an age condition, and it excludes families |

The Equal Status Acts forbid treating someone less favourably on a protected ground, and section 12 forbids any advertisement that indicates an intention to discriminate or "might reasonably be understood" that way. In 2019 the Workplace Relations Commission upheld a challenge to adverts on Daft that said "suit family or professionals only", "would suit young professionals" and "rent allowance not accepted", and held the portal itself liable for carrying them. Gaff now shows homes to the public, so this line is Gaff's risk as well as the operator's.

That gives one rule for the whole feature:

> **Gaff matches on the home and the terms of the let. It never matches on who the renter is.**

A home has facts. A let has terms. A renter has needs. Matching a renter's needs to a home's facts and terms is the renter's own choice and discriminates against nobody. Describing a preferred kind of person is not allowed, however it's worded.

One consequence for the words on screen: nothing in Gaff is called "who it suits" or "would suit". Those are the exact words the law objects to in adverts. The block is called **Letting details**.

## What can be matched

| Kind | Items | Who sets it | Who it's used by |
| --- | --- | --- | --- |
| **Facts about the home** | Area, rent, bedrooms, bathrooms, type, furnished or not, BER, parking, outdoor space, heating, floor and lift, bills included or not | The operator, mostly by import | Renters, to search and to decide whether to enquire. Never used to rank people |
| **Letting details** (the four fixed criteria) | Available from; length of stay; most people; pets | The operator, from the fixed list | Renters, to see fit. Ranking, as today |
| **House rules** | No smoking indoors | The operator, from a fixed list | Renters, to decide. Never used to rank. A term of the tenancy, not a quality of a person |
| **The income rule** | Take-home income of 2, 2.5 or 3 times the rent, with HAP counting as income | The operator, once, for every home | Shown to renters before they apply. Never asked before a viewing. Never an automatic refusal |

**UX-MT-1.** The operator describes what they're looking for only through these four kinds. There is no free-text "ideal tenant", no "about the tenant we're looking for", and no field an operator could use for one. `[rule 3 · R2]`

**UX-MT-2.** Ranking reads only the answers to the four criteria and the time of enquiry, as today. Facts, house rules and the income rule never change anyone's position before applications. `[rule 3 · R10, ADR-0008]`

**UX-MT-3.** Gaff writes the Letting details line itself, from the criteria, in fixed wording. The operator can't edit it. Example: "From Sunday 13 December · A year or longer · Up to 3 people · No pets (assistance dogs always welcome)". `[rule 3, rule 7]`

### What the founder's examples become

| What an operator might want to say | The closest lawful version in Gaff |
| --- | --- |
| "A working couple" | "Up to 2 people." The income rule, the same for everyone, shown before applying |
| "College students only" | "From 1 September · 9 months." Students find it by its dates. Nobody else is excluded |
| "Professionals only", "references required" | Nothing. The income rule and the checks on the chosen applicant do the lawful part of this job |
| "No HAP", "no rent allowance" | Nothing. Gaff always answers that HAP is accepted and counts it as income |
| "A family home" | Facts: "3 bedrooms, a garden, 5 minutes' walk to a primary school". Describe the home |
| "Mature tenants", "over 25s" | Nothing |
| "Non-smokers" | A house rule: "No smoking indoors" |
| "No pets" | The pets criterion. Assistance dogs never count |
| "Long-term tenants" | "A year or longer" |
| "A quiet tenant" | Nothing |

**UX-MT-4.** When an operator types or imports wording from the "Nothing" rows, Gaff leaves it out, says so, and offers the lawful version where there is one ("Did you mean 'Up to 2 people'?"). This extends the check that exists today for facts and answers (Q7), and covers a home's public description. `[rule 3]`

### New criteria considered

Each was tested against one question: could it disadvantage a group the Acts protect, directly or by effect?

| Candidate | Verdict | Reason |
| --- | --- | --- |
| A budget or income band, before viewing | **No** | Income is staged data for applications. The rent is on the page; renters can judge for themselves |
| "Can provide a landlord reference" | **No** | Disadvantages first-time renters, the young and people new to Ireland. Wording like "references required" was part of the 2019 complaint |
| Employment status or type | **No** | A proxy for housing assistance, age and family status |
| Student or not | **No** | A proxy for age |
| "No smoking indoors" | **Yes, as a house rule** | A term about the home, applied to every tenant. Not used in ranking. Gaff never asks a renter whether they smoke |
| Bills included, furnished, parking, outdoor space | **Yes, as facts** | They describe the home |
| Step-free access, lift | **Yes, as facts, with care** | They describe the home. But a renter's search for them may reveal a disability, so Gaff never stores that search on a profile or shows it to an operator (UX-MT-12) |
| Number of bedrooms needed | **No, as a criterion** | The home's bedrooms are a fact. "Most people" already covers occupancy |

**UX-MT-5.** The fixed list of criteria stays at four. The redesign adds one house rule, "No smoking indoors". `[rule 3 · Q36]`

## The operator's side

| Moment | What the operator sees | Where |
| --- | --- | --- |
| Adding a letting | Letting details: the four criteria as rows to switch on, and a preview of the line renters will see | [Section 4](04-operator-flows.md#adding-a-letting), step 7 |
| Enquiries arriving | Three figures: enquiries, answered, "meet everything you asked" | The letting's page |
| Looking at the pool | One sentence that sums up the answers: "Of 31 people who've answered, 23 meet everything. The most common miss is the move-in date: 6 need later than 13 December." | The letting's page, under What's happening |
| Looking at one person | "Meets 3 of 4", and each criterion with their answer in words | The person's sheet in People |
| Asking in words | "Who can move in before Christmas?" becomes filter chips on the four answers | People ([UX-LP-15](04-operator-flows.md#people)) |
| Choosing who views | The ranked list, top people ticked | The decision flow |

**UX-MT-6.** Fit is always shown as a count with words ("Meets 3 of 4") and the detail one tap away. It is never a score, a percentage, a colour on its own or a star rating. `[P10 · Q36]`

**UX-MT-7.** The pool summary is written from counts of criteria answers only. It names criteria and never people. `[P13 · rule 3]`

**UX-MT-8.** Gaff never hides, removes or rejects anyone for not fitting. Everyone who enquired stays on the list. A person decides who views. `[rule 1 · R11]`

**UX-MT-9.** Criteria lock when invitations go out, as today. Before that, the pool summary lets an operator see what a criterion is costing them and change it for everyone. A change re-ranks everyone the same way and is recorded. `[P5 · R2]`

**UX-MT-17.** Gaff never recommends a person. It doesn't say who is best, most suitable or most likely to be a good tenant, in a list, a label, a summary or an answer to a question. It says who meets what was asked, and a person chooses. `[rule 1 · Q36]`

**UX-MT-18.** When an operator asks about people in plain words, the answer is always a filter on the four answers and the time of enquiry. Asked for anything else ("who seems nicest?", "any families?"), Gaff says what it can sort by and offers that. `[rule 3, P13 · Q36, Q37]`

## The renter's side

Renters reach a home two ways: from Daft or MyHome, or by searching Gaff. Fit shows up in the same places either way.

**UX-MT-10.** A home's page shows its Letting details and its facts before anything is asked. A renter who can see "No pets" can save themselves the time. `[P7 · RJ1]`

**UX-MT-11.** After answering, the "Thanks" page shows the renter's answers beside the letting details, in plain words and without judgement:

> You said: 4 people. This home is for up to 3.
> Your answers are with Halcyon Lettings, who decide who views. You'll hear by Friday 14 November either way.

It never says they don't qualify, and it never stops them. `[rule 1, P10]`

### Saying what you're looking for

This is the founder's renter example: "two-bed flat in Ranelagh for me and my partner, 12 months, no pets". It is how search works ([section 5](05-renter-owner-referee-flows.md#search)).

| # | Screen | What happens |
| --- | --- | --- |
| 1 | **Search** | One box. The renter types in their own words |
| 2 | **What Gaff understood** | Chips under the box, each one editable: "Ranelagh · 2 bedrooms · 2 people · A year · No pets · Up to €2,400 a month" |
| 3 | **Homes** | Homes that fit first. Then homes that are close, each saying what differs in words |

**UX-MT-12.** Gaff turns the renter's words into these fields only: area, bedrooms, most rent, move-in date, length of stay, number of people, pets, and home facts (furnished, parking, outdoor space, type). Everything else in what they wrote is discarded and never stored. "Me and my partner" becomes "2 people". "I'm a nurse", "we have a baby", "I'm on HAP" become nothing. Searches for step-free access or a lift are used for that search and not saved. `[rule 3, P13]`

**UX-MT-13.** What's saved on a profile is the chips, never the sentence, and only when the renter saves the search or has a profile. `[rule 3, rule 9]`

**UX-MT-14.** A renter's preferences are theirs. An operator never sees them. An operator sees a renter's answers to that home's criteria only when the renter enquires about that home, as today. `[rule 2 · principle 6 of the PRD]`

**UX-MT-15.** Preferences are used to show homes to the renter. They are never used to show renters to operators, and no operator can search renters. `[rule 1, rule 3]`

**UX-MT-16.** A renter with a saved search is told about new homes that fit it. Operators don't choose who is told, and can't pay to reach them. `[rule 1]`

## How far AI goes here

| AI does | AI doesn't |
| --- | --- |
| Turn an advert into facts and suggest which of the four criteria it implies ("The advert says 'no pets'. Switch that on?") | Add a criterion, or write the Letting details line |
| Turn a renter's sentence into chips they can see and change | Keep the sentence, or infer anything about who they are |
| Turn an operator's question into a filter on the four answers | Answer a question about anything else, or name a best person |
| Write the one-sentence pool summary from counts | Rank, score, shortlist, reject or recommend a person |
| Spot unlawful wording and offer the lawful version | Decide anything |

Ranking stays plain code, the same for everyone, as ADR-0008 requires.
