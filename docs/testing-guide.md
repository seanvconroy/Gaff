# Testing Gaff end to end

This is for the two of you, testing Gaff on its test copy: as an agency, as a private landlord and as a renter. Everything works as it will for real. You sign in with your own email, real emails arrive in your own inbox, and their links open the real pages.

A first look takes 15 minutes. The whole journey, from an enquiry to a signed tenancy, takes about an hour.

## 1. Open the test copy

Open **https://gaff-test.vercel.app** on your laptop or your phone. There's no Vercel sign-in and nothing to install.

- It looks as the real Gaff will: nothing on the page says it's the **test copy**. The address is how you tell.
- Anyone with the address can open it, though search engines never see it. So **use made-up names, phone numbers and homes**.
- **Use your real email address.** That's where Gaff sends your codes and emails.

## 2. What's real and what's a stand-in

- **Real:** every screen, rule and decision; every email to a real address; timers, reminders and deletion dates; the record of each letting.
- **Made-up people** get their email in the **Outbox** instead: the made-up accounts below, test enquiries, and any referee or landlord at `example.ie`. Only the two of you can open it.
- **Texts aren't sent.** When Gaff would text you a code, such as the one to book a viewing, it shows it on the screen.
- **Replying to an email doesn't reach Gaff yet.** Use the link in the email instead. Each email says so.
- **ID checks** use Stripe's test mode, with its test documents, or a test page where you pick the result. Try a failure once, to see how it's worded.
- **Signing** uses Gaff's typed-name signature. **Money** never goes through Gaff: it shows the bank details, and you press a button to say the money arrived.

## 3. The made-up homes and accounts

The test copy always has nine made-up homes, so there is something to search from the start:

| Who | What | Their homes |
| --- | --- | --- |
| **Liffey Quay** | An agency in Dublin. Ann Power is its admin: `ann@liffey-quay.test` | Ranelagh, Rathmines, Drumcondra and Portobello |
| **Corrib Homes Limited** | An agency in Galway. Cian Moran is its admin: `cian@corrib-homes.test` | Salthill, the city centre and Knocknacarra |
| **Siobhán** | A private landlord in Cork, who has confirmed it's her: `siobhan.daly@example.ie` | Ballintemple and the city centre |

**To be one of them**, sign in with their email, then open the **Outbox** (https://gaff-test.vercel.app/dev/outbox) in another tab and copy the six-digit code from their newest email. You see their homes as they do.

Each deploy keeps these homes going: it adds viewing times when they're running low, and puts back anything missing. It never changes what you did: your photos, pins, enquiries and closed lettings stay as you left them.

## 4. A first look as a renter (15 minutes, on a phone)

1. Open the test copy, signed out. You land on **Search**.
2. Type a town, an area or a street, such as `Salthill`, `Dublin 6` or `Ballintemple`, and choose a suggestion. Try **Filters** for rent, bedrooms and pets, and the map.
3. Open a home: its photos, facts, letting details, and who lets it. Siobhán's homes show "Identity verified", and sit within about 150 metres of their pin on the map.
4. Press **Ask to view**. Give a name and your real email, then open the link Gaff emails you, to confirm it's you.
5. Within a minute, the first reply arrives by email. It says it's from an AI assistant, and how to reach a person.
6. Look at **Saved** (press the heart on a home) and **Enquiries**.

The made-up listers don't answer beyond the AI. For the whole journey, one of you lets a home and the other asks to view it (section 7).

## 5. As an agency (20 minutes, on a laptop)

**Use a made-up agency.** Sign in as Ann at Liffey Quay (section 3). **Today** shows what needs doing. Open a home from **Lettings**, then:
- in the home's menu, press **Add test enquiries**: five made-up renters enquire, as if from Daft and MyHome, and most answer the questions;
- choose who views, and send the invitations;
- see the viewings on **Calendar**, and the messages on **Inbox**.

**Or set up your own.** Sign in with your own email and say **I work at a letting agency**. Find an agency on the made-up register, such as `Halcyon Lettings` or `Rowan & Byrne`, and press **Yes, that's us**. It is "being confirmed" until one of you presses **Confirm** on https://gaff-test.vercel.app/internal. Until then you can add homes, but none goes live.

## 6. As a private landlord (15 minutes, on a phone or laptop)

1. Sign in with your own email (or a "+" address, like `you+landlord@gmail.com`) and say **I'm letting a home I own**.
2. **Add your home**, one question a screen: a made-up street in a real area, so search finds it (like `Terenure, Dublin 6W`, `Salthill, Galway city` or `Douglas, Cork city`), the rent and the home. Place its pin, add a few photos from your phone, and set the letting details.
3. Add a viewing time in the next few days, and check the rent.
4. At **Ready to go live**, you **confirm it's you** once, with an ID check. Then the home is live: search for its area as a renter and it's there.

You can also sign in as Siobhán, whose two homes are already live.

## 7. The whole journey, together (40 minutes)

One of you lets the home (💻), the other rents (📱).

1. 📱 Find the home and **ask to view** (section 4).
2. 💻 Open the home. The enquiry is on its page. Press **Add test enquiries** for more people to choose from. Check **Inbox** for anything the AI drafted that waits for you.
3. 💻 Choose who views, with the real renter among them, and send the invitations.
4. 📱 Open the invitation and book a time. Give a mobile: the code to confirm it shows on the screen.
5. 💻 On **Attendance**, press **Start the viewings now** (so you don't wait), and mark who came.
6. 📱 Apply, with a made-up take-home income, like 5,200 a month.
7. 💻 Compare the applicants and choose a preferred applicant and a backup.
8. 📱 Do the checks: the ID check, and a referee (the other person's real email, or a made-up `example.ie` one, which goes to the Outbox).
9. 💻 For an agency, ask the landlord to approve; a made-up landlord's email goes to the Outbox. Then make the **offer**. 📱 Accept it. Everyone else hears straight away.
10. 💻 Send the agreement. 📱 Sign it. 💻 Sign it for the landlord.
11. 💻 Ask the tenant to pay. 📱 See the bank details. 💻 Press **It's in our account**.
12. 📱 Give a made-up PPS number, like `1234567T`. 💻 Mark the tenancy registered with the RTB. The PPS number is deleted then.
13. 💻 Tick off the keys and share the inventory. 📱 Confirm it's a fair record.
14. 💻 Close the letting and look over its **Timeline**: every step, and no personal details.

Then swap.

## 8. Gaff's own pages

Only the two of you can open these (your emails are on the staff list):
- **https://gaff-test.vercel.app/internal**: agencies waiting to be confirmed, reported homes, and the funnels;
- **https://gaff-test.vercel.app/internal/agencies**: set up a pilot agency, already confirmed, and invite its first admin;
- **https://gaff-test.vercel.app/dev/outbox**: made-up people's emails, and every text. Open a made-up renter's links there to play them;
- **https://gaff-test.vercel.app/dev/inbound**: send an email to a lister's Gaff address, as Daft or MyHome would.

## 9. Good to know

- **On a phone**, the navigation is a bar at the foot of the screen; your account menu is on your initials.
- **Timing:** emails arrive within seconds; reminders and deadlines up to a minute after their time.
- **Codes** work for 10 minutes.
- **Your own homes and enquiries** stay until you close them.

## 10. Feedback

For anything that's wrong, unclear or slow, note four things:
- where you were (the step, or the page);
- what you did;
- what you expected;
- what you saw.

Words matter too: if a sentence doesn't sound right, say so. Each note becomes a change, and changes go live on the test copy when they're deployed.

## Running it locally

You need Node 22, pnpm and Docker. The commands are in `CLAUDE.md` under Commands:

```bash
cp .env.example .env            # then set AUTH_SECRET to 32 or more random characters
docker compose up -d
pnpm install && pnpm db:migrate
pnpm places:load                # the towns and streets search suggests
pnpm db:seed                    # the made-up agencies, landlord and homes
pnpm dev                        # http://localhost:3000; every email lands in /dev/outbox
pnpm worker                     # in a second window: sends the emails and runs the timers
```
