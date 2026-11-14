# 7. AI in the experience

Part of the [UX redesign PRD](README.md). This file lists every place the redesign uses AI, the problem each solves, and how disclosure, grounding and human decisions are kept.

Requirement IDs: `UX-AI`.

## The rule

AI is used where it removes real work: reading, drafting, answering and summarising. A simple choice stays a tap. Nothing is put in a chat window because chat looks modern.

Three tests decide whether something is an AI pattern:

1. Is the input loose and the output structured (an advert into facts, a sentence into chips)? AI helps.
2. Is the output words a person would otherwise write (a reply)? AI helps.
3. Is it a choice among a few known options, or a calculation? Then it's a tap or plain code, and it isn't called AI.

## Every AI-led interaction

| # | Interaction | The problem it solves | What the user sees | Phase |
| --- | --- | --- | --- | --- |
| 1 | **First reply to an enquiry** | Most enquirers never hear back | A fixed message, sent within five minutes, that says it's from an AI assistant | Exists |
| 2 | **Answering renters' questions** | The same twenty questions, hundreds of times | A reply written from the home's facts. Sent, or waiting in Inbox as a draft, depending on the setting | Exists; moves into Inbox |
| 3 | **Reading an advert into a letting** | Retyping what's already on Daft | "Tell Gaff about the home": paste, describe or upload, then review | 1, new |
| 4 | **Suggesting facts to add** | The operator answers the same unknown question again and again | In Inbox: "5 people have asked about parking. Add it to the home's facts?" with a field | 1, new |
| 5 | **Summing up who's enquired** | Reading a list of 60 people to see the shape of it | One sentence on the letting's page, built from counts | 1, new |
| 6 | **Spotting wording the law doesn't allow** | An operator pastes "professionals only" without knowing the risk | The line is left out, with the reason and a lawful version if there is one | Exists for facts and answers; extended to import |
| 7 | **Reading payslips** | Typing figures from a document | The renter uploads; Gaff reads the monthly amount; a person sees the result | Exists as the fallback income check |
| 8 | **A renter saying what they want** | Filling in a search form | One sentence in, chips out, confirmed by the renter | 3 |
| 9 | **"Ask about this home"** | Emailing a question and waiting | A box on the renter's page, answered from the facts | 2 |

### What is not AI, and isn't labelled as AI

| Thing | What it is |
| --- | --- |
| Ranking enquirers | Plain code: criteria met, then time of enquiry (ADR-0008) |
| "While you were away" on Today | A fixed sentence filled with counts |
| Suggested viewing times | A rule: weekday evening and Saturday morning, adjusted by when renters have booked |
| Offers, invitations, outcomes, reminders, the agreement | Fixed, solicitor-reviewed wording with names, dates and amounts filled in |
| Finding the code in a forwarding confirmation email | A parser for known mail services |
| Finding an agency on the PSRA register | A search |

### Conversational set-up: the recommendation

**For account set-up: no.** It is two to four answers, and taps are faster ([section 2](02-accounts-and-sign-in.md#should-set-up-be-a-conversation)).

**For adding a letting: yes, as one turn, not a chat.** "Tell Gaff about the home" takes whatever the user has, in any form, and returns a finished draft to review. That is the conversational idea doing the one thing it's best at. Follow-up is not a back-and-forth: missing answers become ordinary steps with ordinary controls, because "What's the rent?" is faster in a number field than in a chat.

## Requirements

**UX-AI-1. Say it's AI.** The first message to a renter says they're dealing with an AI assistant. Every private page says so in its top line. Anything the model wrote that a person is about to send carries the "Drafted by AI" label. `[rule 6]`

**UX-AI-2. A person is always reachable.** Every renter page and every message has a route to a person. A renter who asks for one is passed to the operator, and the AI stops answering in that conversation until the operator replies. `[rule 6 · R8]`

**UX-AI-3. Grounded or silent.** Replies to renters are written only from the home's facts, with the fact each sentence came from recorded. If the facts don't cover a question, the assistant says it will check and asks the operator. `[rule 7 · R8]`

**UX-AI-4. Show the source.** Anything AI filled in for an operator shows where it came from on tap: the words from the advert, or the fact used in a reply. `[rule 7; P10]`

**UX-AI-5. Never invent.** In import, a value the advert doesn't give is left empty and marked "Check this". The assistant doesn't guess a BER, a rent or a date. `[rule 7]`

**UX-AI-6. Suggest, never decide.** AI never ranks, scores, shortlists, rejects, invites, chooses or offers. It doesn't recommend a person. Every one of those is a person's decision, taken in a decision flow and recorded. `[rule 1]`

**UX-AI-7. Blind to protected grounds.** The model is never given, and never asked to infer, anything about who a renter is. It never comments on names, language or writing style. Renter text that mentions a protected ground is not stored as an attribute of the person. `[rule 3]`

**UX-AI-8. Strip personal details.** Names, phone numbers and email addresses are removed from text before it goes to the model. Uploaded adverts and brochures go to the model as the operator's own business material; the DPIA covers this. `[rule 7]`

**UX-AI-9. Untrusted input.** Enquiries, pasted adverts, uploaded files and renters' sentences are treated as information. Instructions inside them are ignored. `[rule 7]`

**UX-AI-10. Fixed wording where it matters.** First replies, invitations, reminders, offers, outcomes and check messages stay as fixed templates. The redesign changes how they're laid out, not what they say. Any change to their words goes to the solicitor. `[rule 7]`

**UX-AI-11. Drafts read like a person wrote them.** A drafted reply answers the question in a sentence ("Yes, it's furnished."), not as a field and a value ("Furnishing: Furnished."). It stays grounded in the same fact. `[P12 · R8]`

**UX-AI-12. There's always a way without it.** Every AI step has a manual route on the same screen: "Fill it in myself", "Write my own reply". If the model is slow or down, the manual route still works, and the screen says "Gaff couldn't read that just now" in plain words. `[P10]`

**UX-AI-13. Fast, and seen to be working.** An AI step shows its result's layout at once and fills it in. Import shows a draft in under ten seconds for a typical advert. A reply draft is ready before the operator opens the conversation. `[P14]`

**UX-AI-14. One switch.** "Check Gaff's answers before they go" is on for every new account and is the only AI setting. Turning it off lets grounded answers go straight out. Fixed messages always go out. `[P3 · R29]`

**UX-AI-15. The assistant is called Gaff to operators, and the agency's assistant to renters.** Operators read "Gaff answered 38 enquiries". Renters read "Halcyon Lettings' AI assistant". There is no persona, avatar or name beyond that. `[P4]`

## How each interaction keeps the rules

| # | Disclosed how | Grounded in | Who decides |
| --- | --- | --- | --- |
| 1 First reply | The message says so | Fixed wording | The operator approved the wording once. Sending it changes nobody's chances |
| 2 Answers | Top line of the message and page; "Drafted by AI" on drafts | The home's facts, by ID | The operator approves each draft, or has switched checking off |
| 3 Import | The review screen is titled "Here's what Gaff found" | The operator's own advert, shown on tap | The operator confirms the review and starts taking enquiries |
| 4 Suggested facts | "Gaff noticed" on the suggestion | Counts of questions asked | The operator writes the fact |
| 5 Pool summary | Sits under the figures it's built from | Counts of criteria answers | Nothing is decided by it |
| 6 Wording check | The reason is given | A fixed list of protected-ground wording, then the model for near misses | The operator can rewrite; Gaff won't send the original |
| 7 Payslips | Explained before upload | The renter's document | The operator reviews the result. A miss is never a refusal |
| 8 Renter's sentence | "Here's what Gaff understood" | The renter's own words | The renter confirms the chips |
| 9 Ask about this home | Top line of the page | The home's facts | As for answers |
