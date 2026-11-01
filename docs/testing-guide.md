# Testing Gaff end to end

This walks one home from the first enquiry to a signed tenancy, and the letting closed. You play everyone: the operator (on a laptop), the renters and the landlord (on your phone), and a referee. It takes about 45 minutes.

**Use made-up details only.** The test copy shows every email on one page, so nothing real should go in.

## 1. Get a test copy running

### Option A: the test copy on Vercel and Supabase (recommended)

It's already running at **https://gaff-test.vercel.app**:
- the app is on Vercel, in Dublin;
- the database is on Supabase, in Ireland.

**Vercel's sign-in protects it.** The first time you open it on your laptop and on your phone, sign in with your Vercel account. After that it's just the app.

**Background jobs run on their own:** straight after each action, and every minute for timers.

To set up another copy, follow [deploy.md](deploy.md).

### Option B: on your own computer

You need Node 22, pnpm and Docker. The commands are in `CLAUDE.md` under Commands:

```bash
cp .env.example .env            # then set AUTH_SECRET to 32 or more random characters
docker compose up -d
pnpm install && pnpm db:migrate
pnpm dev                         # http://localhost:3000
pnpm worker                      # in a second window: sends the emails and runs the timers
```

## 2. What's real and what's a stand-in

- **Real:** every screen, rule, decision, message, timer, deletion date and record.
- **Stand-ins:**
  - **Emails and texts** aren't sent. They appear on the **Outbox** page (`/dev/outbox`), with working links. Keep it open on your laptop and your phone.
  - **Daft and MyHome enquiries** are pasted into the **test inbox** (`/dev/inbound`).
  - **The AI** is a simple stand-in that answers from the home's facts. The real one (Claude, in the EU) is switched on later.
  - **ID and income checks** go to a test page where you choose the result. Real providers need your approval.
  - **Signing** uses Gaff's own typed-name signature. The solicitor confirms whether that's enough (Q23).
- **Test tool:** the Attendance tab has a **Start the viewings now** button, so you don't wait for a real viewing time. It never appears in production.
- **Timing:** emails usually appear within a few seconds. Refresh the Outbox if one hasn't shown yet. Timed messages, such as reminders and deadlines, can take up to a minute longer than their time.

## 3. The walk-through

### Set up (stage 1)

1. Open the copy and **sign in** with any made-up email, for example `ann@halcyon.test`. Open the sign-in link from the Outbox.
2. Set up the workspace as **an agency**, with PSRA licence `001234`.
3. In **Settings**:
   - check the income rule (2.5 times the rent by default);
   - set your usual times, for example 6 hours a letting and 30 days to let;
   - set **Where tenants pay**: any name, and the test IBAN `IE29 AIBK 9311 5212 3456 78`.
4. **Add a letting:**
   - address `12 Ranelagh Road`, area `Ranelagh, Dublin 6`, rent `1850`;
   - available a month from now; a 2-bed furnished apartment;
   - Daft advert `https://www.daft.ie/for-rent/apartment-12-ranelagh-road-ranelagh-dublin-6/123456`.
5. Add a viewing time for **tomorrow, 6pm to 7pm**, with 15-minute slots.
6. Set the criteria (for example up to 3 people, no pets), check the rent, then **Start taking enquiries**.

### Enquiries and the shortlist (stages 2 and 3)

7. Copy your Gaff address from **Settings**. In the test inbox, send these three enquiries, changing only the parts shown. Use From `Daft.ie <noreply@daft.ie>` for each.

   | Renter | Reply-To | Subject | Body |
   | --- | --- | --- | --- |
   | 1 | `Aoife Byrne <aoife@example.ie>` | `New enquiry: 12 Ranelagh Road, Ranelagh, Dublin 6` | the Daft body below |
   | 2 | `Ciarán Ó Súilleabháin <ciaran@example.ie>` | the same | the same body, with the name, email and phone changed |
   | 3 | `Nora Walsh <nora@example.ie>` | the same | the same body, with the name, email and phone changed |

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

8. **Check the replies:**
   - The Outbox shows a first reply to each renter, saying it's an AI assistant.
   - **Approvals** has the AI's answer about parking for you to approve.
   - **Questions** has anything only you can answer.
9. **Answer as a renter:** on your phone, open each renter's first reply from the Outbox and answer the questions.
10. **Decide who views:** on **Shortlist**, invite renters 1 and 2, with renter 3 on the waiting list. Send.

### Viewings (stage 4)

11. **Book:** on your phone, open each "Book a viewing" email and book a time, adding a mobile number for a text reminder.
12. **Free a place:** cancel one booking and book again, and watch renter 3 get "A viewing place has opened up".
13. **Mark who came:** on **Attendance**, press **Start the viewings now**, then mark renters 1 and 2 as **Came**.

### Applications, checks and the offer (stages 5 to 7)

14. **Apply:** each gets an "Apply for 12 Ranelagh Road" email. Apply on your phone with a take-home income, for example 5,200 and 4,800.
15. **Choose:** on **Applications**, compare them side by side, then choose a preferred applicant and a backup.
16. **Checks:** as the preferred renter, open the checks email.
    - Do the ID check and the income check; the test page lets you choose the result. Try a failure once to see how it's worded.
    - Name a last landlord, for example `mary@example.ie`.
17. **Reference:** as the referee, open the reference request from the Outbox and answer it.
18. **Landlord approval:** on **Applications**, add the landlord's name and email, then ask them to approve. As the landlord, open the summary on your phone and approve both.
19. **Offer:** make the offer, and tick to offer it to the backup if it isn't accepted. As the renter, accept it on your phone. The others get an outcome email straight away.

### Tenancy and closing (stages 8 and 9)

20. **Agreement:** on the **Tenancy** tab, send the agreement. As the tenant, read and sign it on your phone, then sign it yourself. You can also try **Signing on paper instead?**.
21. **Payment:** ask the tenant to pay. As the tenant, see the bank details, then press **It's in our account**.
22. **RTB:** as the tenant, give a PPS number (try `1234567T`). Open the **RTB registration pack** and the **rent-setting pack**, then mark the tenancy as registered.
23. **Moving in:** tick the keys, add an inventory item with a photo from your phone, and share it. As the tenant, confirm it's a fair record.
24. **Finish:** finish and close the letting. Your dashboard shows **let in N days** against your usual time.
25. **The record:** look over the **Timeline**: every step, with no personal details. Share the landlord's read-only link and open it.

## 4. Feedback

For anything that's wrong, unclear or slow, note four things:
- the step number;
- the screen;
- what you expected;
- what you saw.

Words matter too: if a sentence doesn't sound like you, say so. I'll turn each note into a change, and we'll go round again.
