# Testing Gaff end to end

This walks one home from the first enquiry to a signed tenancy and a closed letting. You play everyone:
- the operator, on your laptop;
- three renters, a referee and the landlord, on your phone.

It takes about 45 minutes. **Use made-up details only**: the test copy shows every email on one page.

## 1. Open the test copy

It's running at **https://gaff-test.vercel.app**:
- the app is on Vercel, in Dublin;
- the database is on Supabase, in Ireland.

**Vercel's sign-in protects it.** The first time you open it on your laptop and on your phone, sign in with your Vercel account. After that it's just the app. Only you can open it.

To run it on your own computer instead, see [Running it locally](#running-it-locally) at the end.

## 2. How the renter side works

Renters, referees and landlords never sign in and never download anything. Gaff emails each person a **private link**, and everything they do happens on the page behind it:
- answering the pre-viewing questions;
- booking, moving or cancelling a viewing;
- applying;
- doing the checks;
- accepting the offer;
- signing the agreement;
- seeing the payment details;
- giving a PPS number;
- confirming the inventory.

In the test copy, nothing is really sent. Every email and text appears on the **Outbox** page instead: **https://gaff-test.vercel.app/dev/outbox**.

To be a renter:
1. Open the Outbox **on your phone**.
2. Find the newest email addressed to that renter (each shows who it's to).
3. Tap its link.

That page is exactly what the renter would see. Refresh the Outbox to see new emails.

## 3. What's real and what's a stand-in

- **Real:** every screen, rule, decision, message, timer, deletion date and record.
- **Stand-ins:**
  - **Emails and texts** go to the Outbox instead of being sent.
  - **Daft and MyHome enquiries** are pasted into the **test inbox**: https://gaff-test.vercel.app/dev/inbound.
  - **The AI** is a simple stand-in that answers from the home's facts. The real one (Claude, in the EU) comes later.
  - **ID and income checks** go to a test page where you choose the result. Real providers need your approval.
  - **Signing** uses Gaff's own typed-name signature. The solicitor confirms whether that's enough (Q23).
- **Test tool:** the Attendance tab has a **Start the viewings now** button, so you don't have to wait for the real viewing time. It never appears in production.
- **Timing:** emails usually appear within a few seconds. Timed messages, such as reminders and deadlines, can arrive up to a minute after their time.

## 4. The walk-through

Each step says where to do it: 💻 for your laptop, as the operator; 📱 for your phone, as whoever the step names.

### Set up (stage 1)

1. 💻 Open https://gaff-test.vercel.app and **sign in** with any made-up email, for example `ann@halcyon.test`. Open the sign-in link from the Outbox.
2. 💻 Set up the workspace as **an agency**, with PSRA licence `001234`.
3. 💻 In **Settings**:
   - check the income rule (2.5 times the rent by default);
   - set your usual times, for example 6 hours a letting and 30 days to let;
   - set **Where tenants pay**: any name, and the test IBAN `IE29 AIBK 9311 5212 3456 78`.
4. 💻 **Add a letting:**
   - address `12 Ranelagh Road`, area `Ranelagh, Dublin 6`, rent `1850`;
   - available a month from now; a 2-bed furnished apartment;
   - Daft advert `https://www.daft.ie/for-rent/apartment-12-ranelagh-road-ranelagh-dublin-6/123456`.
5. 💻 Add a viewing time for **tomorrow, 6pm to 7pm**, with 15-minute slots.
6. 💻 Set the criteria (for example up to 3 people, no pets), check the rent, then **Start taking enquiries**.

### Enquiries and the shortlist (stages 2 and 3)

7. 💻 **Send three enquiries.** Copy your Gaff address from **Settings**. Open the test inbox and send each enquiry below. For each one:
   - **To:** your Gaff address;
   - **From:** leave it as `Daft.ie <noreply@daft.ie>`;
   - **Subject:** `New enquiry: 12 Ranelagh Road, Ranelagh, Dublin 6`;
   - **Reply-To** and **Body:** as below.

   **Renter 1.** Reply-To: `Aoife Byrne <aoife@example.ie>`

   ```text
   You have a new enquiry about your ad.

   Property: 12 Ranelagh Road, Ranelagh, Dublin 6
   Ad: https://www.daft.ie/for-rent/apartment-12-ranelagh-road-ranelagh-dublin-6/123456

   Name: Aoife Byrne
   Email: aoife@example.ie
   Phone: 087 123 4567

   Message:
   Hi, is the apartment still available? Is there parking?
   ```

   **Renter 2.** Reply-To: `Ciarán Ó Súilleabháin <ciaran@example.ie>`

   ```text
   You have a new enquiry about your ad.

   Property: 12 Ranelagh Road, Ranelagh, Dublin 6
   Ad: https://www.daft.ie/for-rent/apartment-12-ranelagh-road-ranelagh-dublin-6/123456

   Name: Ciarán Ó Súilleabháin
   Email: ciaran@example.ie
   Phone: 086 765 4321

   Message:
   Hello, could I view it this week?
   ```

   **Renter 3.** Reply-To: `Nora Walsh <nora@example.ie>`

   ```text
   You have a new enquiry about your ad.

   Property: 12 Ranelagh Road, Ranelagh, Dublin 6
   Ad: https://www.daft.ie/for-rent/apartment-12-ranelagh-road-ranelagh-dublin-6/123456

   Name: Nora Walsh
   Email: nora@example.ie
   Phone: 085 555 0199

   Message:
   Hi, is it still available? When could I move in?
   ```

8. 💻 **Check the replies:**
   - The Outbox shows a first reply to each renter, saying it's an AI assistant.
   - **Approvals** has the AI's answer about parking, for you to approve.
   - **Questions** has anything only you can answer.
9. 📱 **As each renter:** open their first reply in the Outbox ("Your enquiry about 12 Ranelagh Road"), tap the link and answer the questions.
10. 💻 **Decide who views:** on **Shortlist**, invite renters 1 and 2, with renter 3 on the waiting list, then send.

### Viewings (stage 4)

11. 📱 **As renters 1 and 2:** open each "Book a viewing" email and book a time. Add a mobile number for a text reminder; the text appears in the Outbox too.
12. 📱 **As renter 1:** cancel the booking. Then **as renter 3**, look for "A viewing place has opened up" in the Outbox and take the place. Renter 1 can book again.
13. 💻 **Mark who came:** on **Attendance**, press **Start the viewings now**, then mark the renters who booked as **Came**.

### Applications, checks and the offer (stages 5 to 7)

14. 📱 **As each renter who came:** open the "Apply for 12 Ranelagh Road" email and apply, with a take-home income, for example 5,200 and 4,800 a month.
15. 💻 **Choose:** on **Applications**, compare them side by side, then choose a preferred applicant and a backup.
16. 📱 **As the preferred renter:** open the checks email.
    - Do the ID check and the income check. The test page lets you choose the result; try a failure once to see how it's worded.
    - Name a last landlord as a referee, for example `mary@example.ie`.
17. 📱 **As the referee:** open the reference request in the Outbox and answer it.
18. **Landlord approval:**
    - 💻 on **Applications**, add the landlord's name and email (for example `landlord@example.ie`), then ask them to approve;
    - 📱 as the landlord, open the summary from the Outbox and approve both.
19. **Offer:**
    - 💻 make the offer, and tick the box to offer it to the backup if it isn't accepted;
    - 📱 as the preferred renter, open the offer email and accept it.

    Everyone else gets an outcome email straight away.

### Tenancy and closing (stages 8 and 9)

20. **Agreement:**
    - 💻 on the **Tenancy** tab, send the agreement;
    - 📱 as the tenant, read and sign it;
    - 💻 then sign it yourself, for the landlord.

    You can also try **Signing on paper instead?**.
21. **Payment:**
    - 💻 on the **Tenancy** tab, ask the tenant to pay;
    - 📱 as the tenant, open the payment email and see your bank details and the amounts;
    - 💻 back on the Tenancy tab, press **It's in our account**, as if the money has arrived.
22. **RTB registration:**
    - 📱 as the tenant, open any of their emails and give a PPS number on the page (try `1234567T`);
    - 💻 open the **RTB registration pack** and the **rent-setting pack**, then mark the tenancy as registered.

    The PPS number is deleted then.
23. **Moving in:**
    - 💻 tick off the keys, add an inventory item with a photo, and share the inventory;
    - 📱 as the tenant, confirm it's a fair record.

    If you sign in on your phone too, you can take the photo with its camera.
24. 💻 **Finish:** finish and close the letting. Your dashboard shows **let in N days** against your usual time.
25. 💻 **The record:** look over the **Timeline**, which has every step and no personal details. Press **Share with the landlord**, then open the landlord's link.

## 5. Feedback

For anything that's wrong, unclear or slow, note four things:
- the step number;
- the screen;
- what you expected;
- what you saw.

Words matter too: if a sentence doesn't sound like you, say so. I'll turn each note into a change, and every change goes live on the test copy on its own.

## Running it locally

You need Node 22, pnpm and Docker. The commands are in `CLAUDE.md` under Commands:

```bash
cp .env.example .env            # then set AUTH_SECRET to 32 or more random characters
docker compose up -d
pnpm install && pnpm db:migrate
pnpm dev                         # http://localhost:3000
pnpm worker                      # in a second window: sends the emails and runs the timers
```
