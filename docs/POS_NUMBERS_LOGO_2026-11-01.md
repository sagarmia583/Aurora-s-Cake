# Local POS, short numbers and shared logo — 2026-11-01

The user selected an 80mm USB/Wi-Fi printer. These changes remain local for review; no website or backend deployment was performed, and no real order was created or modified.

## Ready locally

- All retired delivery-verification labels, badges and help text are removed from customer tracking, account/history pages, staff/admin details, native handover and the customer receipt page. Legacy compatibility fields remain internal and are not displayed or printed.
- New live checkout numbers are exactly four numeric characters (`0001`–`9999`), allocated inside the existing checkout lock after idempotent retry lookup. Retries retain the number and private UUID. Numbers unused anywhere in the ledger are preferred. Only after all 9,999 references have been used can completed/cancelled references be reused; currently active references are always skipped. If all references are active, checkout rejects rather than duplicates an active number.
- Historic long references display as stable numeric aliases, consistently in web/native/customer views. The original UUID and stored historic ledger references are retained. Search supports the short native alias. Long order identifiers are removed from visible receipt metadata and tooltips.
- Native order details now open a POS setup/preview sheet. Default paper is 80mm, with 58mm available. Cash memo, kitchen ticket and box label templates, 1/2 copies and larger text are available; device preferences are saved in SecureStore. The web staff POS also constrains its print portal to the selected paper width.
- Native print HTML embeds Roboto/Noto Sans Bengali and an inline copy of the public business logo. Items, extras, writing, delivery, coupon, discounts and payment amounts wrap within the receipt. Private access keys and internal delivery-verification fields are excluded. Kitchen tickets omit customer contact and financial information.
- The browser app preview prints the receipt iframe itself, avoiding Expo Print's web behavior of printing the whole app page. Installed phone builds open the native Android/iOS print dialog. Printer selection is performed by the OS. This is driver-based printing, not a proprietary direct USB/ESC-POS implementation.
- Text and controls wrap at narrow screen widths. Native labels no longer use line truncation; web POS template buttons wrap instead of extending into a horizontal scroller. The browser app preview has a bounded viewport with its header and bottom navigation visible; content scrolls inside the app rather than moving the entire browser page.
- The actual pink Aurora logo was downloaded from the public Drive image referenced by the current Sheet, without altering the artwork. `public/images/aurora-logo.png` and the native launcher icon contain identical PNG bytes. Native loading, login, header and receipts use this artwork as fallback and load current Sheet branding. Drive file/view links now resolve to the same thumbnail URL used by the website. The launcher icon changes with the rebuilt app; in-app branding continues to follow the Sheet.

## Preview and verification

- Web POS: http://localhost:3000/?pos-preview=1 (development only, labeled sample order, no live writes).
- Native app: http://localhost:8081/?preview=1 → open order `1046` → POS print.
- Customer receipt: http://localhost:3000/?order-preview=1.
- TypeScript checks pass for web and native; web production build and Android/iOS Hermes exports pass. Exports are bundles, not installed APK/IPA builds.
- Browser checks at 320px show no horizontal overflow or out-of-screen controls in native POS, web POS and customer receipt. The native receipt shows subtotal 580, delivery 60 and total 640 for the labeled sample; the inline logo loads at its original 1254×1254 dimensions. The customer preview shows reference `2603` with no retired verification wording.
- Full suite: 523 tests, 518 pass, 0 fail, 5 pre-existing skips. Tests cover numeric formatting parity, allocation exhaustion/reuse, idempotent checkout numbering, complete receipts, escaped writing, omission of private fields, inline branding and Drive media normalization. Existing financial, authentication and Sheet tests remain included.

## Hardware and publication still pending

Read-only Windows printer enumeration found OneNote, XPS, Print to PDF, Fax and AnyDesk drivers; no physical 80mm printer driver is installed. No physical print job was sent. The user has been asked for the model/name and, for Wi-Fi, its IP address. Install the matching official driver/print service, connect the printer, then select it in the print dialog. Use 80mm paper, scale 100%, margins None and headers/footers Off. Phone Wi-Fi printing requires a compatible Android print service or AirPrint support. [Expo Print documentation](https://docs.expo.dev/versions/latest/sdk/print/) describes the platform dialog behavior.

The prepared backend remains release `aurora-2026-11-01-share-delivery-r3`; live remains version 31/r2. Actual new four-digit Sheet numbers and updated customer receipt HTML require publishing the prepared backend after local review. Existing private IDs, account access and authoritative financial records are preserved.

Screenshots: `web-pos-80mm-2026-11-01.png`, `native-pos-80mm-2026-11-01.png`, `native-web-logo-2026-11-01.png` in this directory.
