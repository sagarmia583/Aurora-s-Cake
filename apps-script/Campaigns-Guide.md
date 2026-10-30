# Product launch emails

Customer profile information remains in the existing private account tables. Product-email preferences use a separate private `customer_subscriptions` tab. Saving an optional profile email does not subscribe anyone, and subscribing never changes a phone/password login identity.

## One-time owner setup

1. Use the generated **Code.AllInOne.gs** as the complete Apps Script `Code.gs`. Do not paste the bundle alongside the individual modules, which would duplicate functions.
2. Run `setupSheetDatabase()` to create missing private subscription/campaign tabs without clearing existing records.
3. Run `setupCampaignTools()` directly from the bakery owner's Apps Script editor. Approve the requested mail and trigger permissions. This records the owner and adds a Sheet-open menu trigger; it sends no email.
4. Deploy a **New version** of the existing web app: **Execute as: Me**, **Who has access: Anyone**. Keep the existing deployment URL.
5. Reopen the Google Sheet. The **Aurora’s Cake** menu should appear. Only the configured owner's interactive session can queue campaigns.

Standalone Apps Script projects are supported through an installable Sheet-open trigger. Running setup again preserves data and reuses the menu trigger. Do not change `AURORA_CAMPAIGN_OWNER_EMAIL` to give ordinary customers or staff sending access.

## Customer flow

A customer signs in with the existing mobile-number/password account, opens **New cakes in your inbox**, enters an email and checks the optional product-update consent box. **Send confirmation email** sends one confirmation link. Opening the link displays a confirmation page; only clicking **Confirm email updates** activates the subscription. Email scanners opening a GET link cannot subscribe or unsubscribe anyone.

The preference appears on every device after account sign-in. **Check confirmation status** refreshes it. Customers can stop emails in their account or through the unsubscribe link in any campaign. Unsubscribe turns off every matching normalized email address so a second phone account cannot keep the same address on the mailing list. Closed customer accounts are excluded from sending.

Email confirmation has a 24-hour expiry, 60-second cooldown, three requests per email and per account per day, and a global 50-per-day limit. The server also checks Google's remaining allowance. Interrupted confirmation sends count toward the limit and never activate a subscription automatically.

## Send an announcement

1. In the Sheet, choose **Aurora’s Cake → New email campaign draft**.
2. Fill only the new row's `subject`, `body` and optional HTTPS `product_url`.
3. Select that row, then choose **Review & send selected campaign**.
4. Review the exact subject, message and eligible recipient count. Click **Send campaign** once.

The announcement and recipient set are frozen when queued. Only active accounts with confirmed emails and current opt-in are included. Each recipient receives a separate message; other customer emails are never placed in CC or BCC. Every announcement has an unsubscribe link.

`email_campaigns` shows counts and progress. `email_deliveries` shows each private delivery result. Do not manually edit queued IDs, snapshots, recipient addresses or delivery statuses. Create a new draft for a different announcement.

## Allowances and recovery

The sender is the Google account that ran `setupCampaignTools()`. Google Apps Script mail has account-dependent daily limits; this is not unlimited bulk mailing. The worker sends at most 40 messages per run and reserves ten remaining messages for account confirmation. It runs every five minutes while work remains, waits an hour before retrying a quota pause, and removes its worker trigger when the queue is done. No recurring worker is installed until the owner sends a campaign.

The mail-service call runs outside the shared Sheet lock so customer checkout and unsubscribe operations can continue. Consent is checked again before each recipient is claimed.

A send is claimed durably before contacting MailApp. If delivery or the acknowledgement is interrupted, the row becomes `unknown`; it is never automatically resent because the first message might already have arrived. Inspect the sender account and delivery ledger before any manual follow-up. `needs_review` means the approved audience or snapshot is inconsistent. `preparing` after an interrupted queue operation requires inspection; do not change it to `queued` by hand.

**Resume queued campaigns** restarts an existing valid queue, respecting its quota pause and delivery claims. It does not resend completed or uncertain deliveries.

Official references: [MailApp](https://developers.google.com/apps-script/reference/mail/mail-app), [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas), [installable triggers](https://developers.google.com/apps-script/guides/triggers/installable).

## Development checks

Run `node scripts/build-apps-script.mjs` after changing any backend module. The generated bundle and separate sources must stay in sync. Unit tests mock MailApp, Google Sheets and timers; they send no live emails.
