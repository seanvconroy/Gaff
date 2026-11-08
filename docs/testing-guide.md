# Testing Gaff end to end

This is for the two of you to test Gaff together: one of you as a **letter** (a landlord or an agent), the other as a **renter**, then swap. Everything works as it will for real: you sign in with your own email, the emails arrive in your own inbox, and the links in them open the real pages.

It takes about an hour for the whole journey, or 15 minutes for a first look.

## 1. Open the test copy

**https://gaff-test.vercel.app**, on your laptop or your phone. No Vercel sign-in, nothing to install.

A banner at the top of every page says it's the **test copy**. It has made-up homes from three made-up letters, so there's something to search from the start:
- **Halcyon Lettings**, an agency in Dublin: Ranelagh, Rathmines, Drumcondra and Portobello;
- **Wren & Weir Lettings**, an agency in Galway: Salthill, the city centre and Knocknacarra;
- **Siobhán**, a private landlord in Cork: Ballintemple and the city centre.

Search engines never see it, but anyone with the address can open it, so **use made-up names and phone numbers**. Use your real email address: that's where Gaff sends things.

## 2. What's real and what's a stand-in

- **Real:** every screen, rule and decision; every email to you; timers, reminders and deletion dates; the record of each letting.
- **Emails** come from `avondale-square.com`, a domain borrowed until Gaff has its own. Check your spam folder the first time, and mark them as not spam.
- **Replying to an email doesn't reach Gaff yet.** To write back, use the link in the email, or sign in and open **Your homes**. Each email says so at the bottom.
- **Texts aren't sent yet.** When Gaff would text you a code, it shows the code on the screen instead.
- **The AI** is a simple stand-in that answers only from the home's facts. The real one (Claude, in the EU) comes later.
- **ID and income checks** open a test page where you choose the result. Try a failure once to see how it's worded.
- **Signing** uses Gaff's typed-name signature.
- **Money:** Gaff never takes any. It shows the letter's bank details; you press a button to say the money arrived.
- **Made-up people** (the seeded letters, test enquiries, a referee or landlord at `example.ie`) get their email in the **outbox** instead, a page only testers can open.

## 3. Become testers (2 minutes, once)

Testers can open the outbox, the test inbox, and Gaff's own staff pages (licence checks and reports).

1. **Sean:** sign in at https://gaff-test.vercel.app/sign-in with your own email. You're a tester from the first sign-in.
2. **Your partner:** sign in once too, with the email they'll test with.
3. **Sean:** open https://gaff-test.vercel.app/staff/testers, enter your partner's email and press **Add tester**.

If you want a second renter account, use a "+" address, like `you+renter@gmail.com`: Gmail delivers it to the same inbox, and Gaff treats it as a different person.

## 4. A first look as a renter (15 minutes, on a phone)

1. Open https://gaff-test.vercel.app. You land on **homes to rent**. Search for `Dublin 6`, `Galway` or `Cork`.
2. Try the filters (rent, bedrooms, pets) and the order (cheapest, newest). Open a home: photos, facts, the map area, who's letting it and what Gaff has checked about them.
3. **Save** a home, and press **Get alerts for this search**. You'll need to sign in: Gaff emails you a link.
4. **Enquire** about a home: your name and email, then the 6-digit code Gaff emails you, then the letter's questions and a message. Ask something the facts answer, like "Is there parking?" or "When are the bins collected?".
5. Within a minute, the AI's first reply arrives **by email** and in **Your homes**. It says it's an AI assistant and how to reach a person.
6. Look at **Your homes**, **Saved**, **Alerts** and **Who has my details**. Withdraw an enquiry if you like.

The made-up letters don't answer beyond the AI, so for the full journey, enquire about each other's homes (section 6).

## 5. Listing a home as a letter (20 minutes, on a laptop)

1. **Sign in** with your own email and choose **Set up a letting workspace**.
2. Choose **Ourselves: we are landlords letting our own homes** (the quickest way), or **Other people: we are a letting agency** to try the agency checks (section 7).
3. **Get checked:** **Settings**, then **Checks** under "Your account".
   - Enter a made-up mobile, like `087 555 0123`, and press **Text me a code**. The code shows on the screen.
   - Press **Check my identity**, then **The ID and selfie match** on the test page.
4. **Add a letting**, in three short steps: the home (a made-up street in a real area, so search finds it, like `Terenure, Dublin 6W`, `Salthill, Galway city` or `Douglas, Cork city`, and the rent), its key facts, then any advert links.
5. Add a **viewing time** in the next few days, set the **criteria** (how many people, pets), **check the rent**, and **Start taking enquiries**.
6. Open **Listing**: the home's details, the deposit, a description and at least three photos. Photos from your phone's camera roll are fine.
7. Tick the declaration and press **Publish this listing**. It's live: search for its area as a renter and it's there. Anyone with an alert for that area gets an email.

## 6. The whole journey, together (40 minutes)

One of you is the letter (💻), the other the renter (📱).

### Enquiries and the shortlist

1. 📱 Find the letter's home and **enquire**, as in section 4.
2. 💻 Open the letting. The enquiry is on **Enquiries**, marked "Gaff". To have more than one renter to choose from, press **Add test enquiries**: five made-up renters enquire, as if from Daft and MyHome, and most answer the questions.
3. 💻 Check **Approvals** (AI answers waiting for you) and **Questions** (anything only a person can answer).
4. 💻 **Shortlist:** the renters ranked by the criteria and when they enquired. Tick the real renter and one or two made-up ones, and press **Send invitations**. The next few go on the waiting list.

### Viewings

5. 📱 Open the **Book a viewing** email and pick a time.
6. 💻 On **Attendance**, press **Start the viewings now** (so you don't have to wait), then mark who came.

### Applying, choosing and checks

7. 📱 Open the **Apply** email and apply, with a made-up take-home income, like 5,200 a month.
8. 💻 On **Applications**, compare the applicants side by side and choose a **preferred applicant** and a **backup**.
9. 📱 Open the checks email. Do the ID and income checks on the test page, and name a referee: use the other person's real email to see the reference request, or a made-up `example.ie` address (it goes to the outbox).
10. Agencies only: 💻 add the landlord's name and email and ask them to approve. A made-up landlord's email goes to the outbox.

### The offer and the tenancy

11. 💻 Make the **offer**. 📱 Open the offer email and accept it. Everyone else gets an outcome email.
12. 💻 On **Tenancy**, send the agreement. 📱 Read and sign it. 💻 Sign it for the landlord.
13. 💻 Ask the tenant to pay. 📱 See the bank details and amounts. 💻 Press **It's in our account**.
14. 📱 Give a made-up PPS number, like `1234567T`. 💻 Open the RTB registration pack and mark the tenancy registered. The PPS number is deleted then.
15. 💻 Tick off the keys, add an inventory item with a photo and share it. 📱 Confirm it's a fair record.
16. 💻 **Finish** and close the letting, then look over the **Timeline**: every step, and no personal details.

Then swap roles.

## 7. The agency route, and Gaff's own pages

- **Agencies** give a PSRA licence number for the agency, and each agent gives their own. Gaff staff check each one on the public register. As testers, you are Gaff staff: open https://gaff-test.vercel.app/staff/checks and press **Matches the register**. Use made-up numbers like `004321`.
- **Reports:** on any home, **Report this listing**. Then open https://gaff-test.vercel.app/staff/review to decide it. An appeal always goes to someone else, so the other tester decides it.
- **The outbox** (https://gaff-test.vercel.app/dev/outbox) shows the made-up people's emails and every text. Open a made-up renter's links there to play them: book their viewing, apply, accept.
- **The test inbox** (https://gaff-test.vercel.app/dev/inbound) sends an email to a letter's Gaff address, as Daft or MyHome would.
- **Signing in as a made-up letter:** sign in as `ann@halcyon-lettings.example`, `cian@wren-weir.example` or `siobhan@daly-homes.example`, then open the sign-in link from the outbox. You'll see their homes and any enquiries.

## 8. Good to know

- **On a phone**, the workspace's menu is a bar at the bottom. Developments open from **Listings**.
- **Timing:** emails arrive within seconds; timed things (reminders, deadlines, chasers) up to a minute after their time.
- **Limits:** the email account sends up to 100 emails a day. That's plenty for two testers, but if emails stop arriving, it's probably the limit; it resets at midnight.
- **The made-up homes** stay listed: each deploy tops up their viewing times. Your own homes and enquiries stay until you close them.
- **Sign-in links** work for 15 minutes, and codes for 10.

## 9. Feedback

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
pnpm db:seed                    # optional: the test copy's made-up letters and homes
pnpm dev                        # http://localhost:3000; every email lands in /dev/outbox
pnpm worker                     # in a second window: sends the emails and runs the timers
```
