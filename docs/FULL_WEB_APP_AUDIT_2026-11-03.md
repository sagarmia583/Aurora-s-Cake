# Aurora’s Cake ওয়েব ও স্টাফ অ্যাপ অডিট

৩ নভেম্বর ২০২৬ · লোকাল preview, production-এর read-only endpoint, source ও automated tests

## যাচাইয়ের ফল

| অংশ | কী যাচাই হয়েছে | পরের acceptance check |
| --- | --- | --- |
| Storefront ও checkout | লোকাল ওয়েবে catalog, Facebook link, চকলেট কেক cart-এ যোগ, delivery date ও পাঁচটি slot, coupon field এবং ৳440 COD total দেখা গেছে। Checkout পর্যন্ত browser-এ error log পাওয়া যায়নি। | Test Sheet-এ সব ১৩টি প্রদর্শিত কেকের size/offer, invalid zone, expired coupon এবং duplicate submit পরীক্ষা। |
| স্টাফ অ্যাপ | Browser demo-তে Today, Orders, Bake ও More আছে। Composer-এ একই কার্ডে Regular ৳850 ও Offer ৳790, এবং custom cake ৳1,200-তে bag-এ যোগ হয়েছে। More-এ catalog, sizes, offers, reviews, delivery areas/times, content, roles, customer directory, collections, costing, sound ও POS আছে। | Installed Android/iOS-এ role ধরে save, confirmation, kitchen, self-delivery, cash collection এবং customer link একবার চালানো। |
| Google Sheet sync | লোকাল ও public catalog API উভয়েই ২০০ JSON ও ১৪টি product record দিয়েছে। লোকাল web UI-তে ১৩টি catalog item দেখা গেছে। ওয়েব visible অবস্থায় ১২ সেকেন্ড অন্তর public data চায়। Native staff app সামনে থাকলে role অনুযায়ী ৮ বা ১২ সেকেন্ড অন্তর fetch করে এবং বদল পেলেই list/catalog state update করে। Sheet API-তে ২০ সেকেন্ডের cache আছে। | Test Sheet-এ product price, offer, logo, delivery zone ও content বদলে দুই client-এ প্রতিটির পৌঁছানোর সময় রেকর্ড করা। কেবল API schema-তে থাকা সক্রিয়/অনুমোদিত field sync হয়। |
| অর্ডার, sold ও review | Source-এ server-side COD total ও বর্তমান মূল্য যাচাই, staff action-এর role check, নতুন চার অঙ্কের order number এবং delivered receipt দিয়ে review eligibility আছে। | একই test order app, staff web, customer link ও Sheet-এ মিলিয়ে deliver করা। তারপর sold count এবং review approve করার পর review count পরীক্ষা। |
| POS ও branding | 80mm ওয়েব demo-তে English receipt labels, subtotal, delivery fee ও total দেখা গেছে। App-এর POS-এ customer memo, kitchen ticket ও box label template আছে। Native export-এ sound এবং বাংলা/English fonts রয়েছে। | 80mm USB/Wi-Fi printer-এ লম্বা কেকের নাম, বাংলা inscription, logo, margin, কাটিং ও reprint পরীক্ষা। |
| Build ও tests | Web TypeScript ও Vite build পাস। App TypeScript ও Android/iOS Hermes bundle export পাস। ৫২৫ test-এর মধ্যে ৫২০ পাস, ৫টি migration-related test skip। Apps Script single-file build check পাস। | APK/IPA install, ছোট ফোনে layout, screen reader, offline recovery, notification এবং actual printer acceptance। |

এই অডিটে live database-এ test order বা edit করা হয়নি। Browser demo, read-only live API এবং native bundle export পর্যন্ত যাচাই হয়েছে।

## সমস্যার তালিকা

### P0 · Preview ও live-এর version আলাদা

লোকাল health check `aurora-2026-11-01-share-delivery-r3` আশা করে। Public Worker `aurora-2026-10-30-supabase-store-r3` আশা করে। দুই endpoint-এই Apps Script `aurora-2026-11-01-native-workspace-r2`, backend `google_sheets`, এবং `up_to_date: false` ফিরিয়েছে। তাই preview-তে যে customer link, delivery flow ও custom order দেখা যাচ্ছে সেগুলোর production rollout আলাদা করে যাচাই করতে হবে। Web, backend ও installed app-এ একই release শনাক্ত করা এবং test database-এ smoke test এই কাজের প্রথম ধাপ।

### P1 · ১০০টি নতুন অর্ডারের আড়ালে পুরোনো active order হারায়

Apps Script সমস্ত receipt পড়লেও role filter-এর পর নতুন থেকে পুরোনো সাজিয়ে ১০০টিতে কাটে। Memory fixture-এ ১০১টি valid row-তে ১০০টি ফেরত এসেছে, `complete: true` ছিল এবং সবচেয়ে পুরোনো Baking order বাদ গেছে। একটি invalid receipt যোগ করলে `complete: false` হয়। Native client সেই snapshot প্রত্যাখ্যান করে। Active queue-তে সব অসম্পূর্ণ order ফেরত দিন। History-তে date/search ও cursor pagination দিন। Financial totals-এর জন্য page থেকে হিসাবের বদলে নির্দিষ্ট date range-এর server aggregate দরকার। Invalid row-এর জন্য diagnosis দিন যাতে একটি row পুরো app refresh আটকে না রাখে। [StaffOperations.gs](../apps-script/StaffOperations.gs#L177) · [Native client](../apps/staff-mobile/src/native/client.ts#L203)

### P1 · লক থাকা ফোনে দ্রুত নতুন অর্ডারের alert নিশ্চিত নয়

Foreground chime আছে। Background worker ১৫ মিনিট minimum interval-এ নিবন্ধিত এবং fetch-এর পর local notification schedule করে। OS execution সময় ঠিক করে এবং app force-stop করলে polling থেমে যেতে পারে। নতুন order সফলভাবে save হওয়ার পর role অনুযায়ী remote push, sound channel ও notification থেকে order খোলার ব্যবস্থা যোগ করুন। Foreground fetch এবং app resume refresh রাখুন। Android lock screen, iOS, Do Not Disturb ও missed-alert badge পরীক্ষা করুন। [App background code](../apps/staff-mobile/src/native/background.ts#L30) · [Expo BackgroundTask](https://docs.expo.dev/versions/latest/sdk/background-task/) · [Expo notification behavior](https://docs.expo.dev/push-notifications/what-you-need-to-know/)

### P1 · একই দিনে অতীতের slot বা পূর্ণ capacity আটকানোর নিয়ম নেই

Backend delivery date অতীত কি না দেখে এবং নির্বাচিত slot active কি না দেখে। Slot-এর সময় ইতিমধ্যে পেরিয়েছে কি না, নির্দিষ্ট দিনের kitchen capacity, blackout date বা কেকের প্রস্তুতির সময় এখানে যাচাই হয় না। Checkout-এ invalid slot সরান এবং order save করার সময় একই নিয়ম server-side enforce করুন। দুই customer একসঙ্গে শেষ slot নিলে একটি save হবে, অন্যটি পরের available slot দেখবে। [Checkout validation](../apps-script/Code.gs#L346)

### P1 · Customer receipt link-এ ব্যক্তিগত তথ্য অনির্দিষ্ট সময় ধরে দেখা যায়

বর্তমান local implementation আলাদা bearer token যাচাই করে এবং link regenerate করতে দেয়। ফোন ও ঠিকানা view-তে আসে। Token তৈরির সময় লেখা হয়, কিন্তু receipt read-এ মেয়াদ চেক হয় না। Delivered/cancelled হওয়ার পর নির্দিষ্ট সময় পর্যন্ত full details, তারপর masked summary বা expiry দিন। Staff-এর জন্য স্পষ্ট revoke action এবং old link invalidation test রাখুন। [OrderLinks.gs](../apps-script/OrderLinks.gs#L17)

### P2 · Google indexing ও cake sharing-এর ভিত্তি অসম্পূর্ণ

লোকাল এবং public Worker-এ `/robots.txt` ও `/sitemap.xml` উভয়ই ২০০ সহ HTML হোমপেজ দেয়। লোকাল storefront DOM-এ canonical URL এবং Product structured data পাওয়া যায়নি। Cake slug URL, নাম-ছবি-দামসহ share card, canonical, sitemap এবং valid Product/Offer markup দিন। Private order link-এর noindex বজায় রাখুন। [Google sitemap guide](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) · [Google Product markup](https://developers.google.com/search/docs/appearance/structured-data/product)

### P2 · Coupon ticker-এ একই button বারবার focus পায়

Storefront-এ তিনটি coupon code ছয়বার করে ১৮টি button হিসেবে accessibility tree-তে দেখা গেছে। প্রতি code-এ একটি keyboard/screen-reader action দিন। Animation-এর visual duplicates focus এবং accessibility tree থেকে বাদ দিন। Checkout-এ keyboard focus এবং ছোট পর্দায় button spacing মাপুন। [CustomerStorefront.tsx](../src/components/CustomerStorefront.tsx#L103) · [WCAG target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)

### P2 · দুর্বল নেটওয়ার্কে প্রথমবার load পরিমাপ দরকার

Web build-এ main JS প্রায় 533 kB minified বা 150 kB gzip। আলাদা staff Sheet panel chunk প্রায় 2.09 MB minified বা 1.33 MB gzip। দ্বিতীয় সংখ্যাটি storefront-এর initial load নয়। ধীর mobile connection-এ storefront ও staff panel আলাদা করে মেপে image sizes, initial JS এবং embedded setup assets অপ্টিমাইজ করুন। Android/iOS Hermes bundle যথাক্রমে 3.9 ও 3.8 MB। এগুলো build size, বাস্তব loading time নয়। [Core Web Vitals](https://web.dev/articles/defining-core-web-vitals-thresholds)

## গবেষণা থেকে ফিচার প্রস্তাব

| ক্রম | কী যোগ করা যায় | কীভাবে কাজে দেবে |
| --- | --- | --- |
| ১ | **Delivery promise ও kitchen capacity** | Product/cart থেকেই এলাকা বাছলে fee, earliest delivery, সময়সীমা ও পরের available slot দেখা যাবে। বিদ্যমান zone ও slot-এর ওপর date-specific capacity এবং কেকভেদে lead time যোগ হবে। [Shopify local delivery](https://help.shopify.com/en/manual/fulfillment/setup/delivery-methods/local-delivery) |
| ২ | **Custom quote থেকে এক ট্যাপে অর্ডার** | বিদ্যমান customer request ও staff quote-এর সঙ্গে reference photo upload, customer approval এবং order conversion জুড়ুন। একই ছবি, লেখা, পরিমাণ ও সম্মত দাম অর্ডারে যাবে। |
| ৩ | **আজকের kitchen board ও printer profiles** | বর্তমান Bake screen-এ deadline অনুযায়ী batch, cake inscription, change/cancel highlight এবং print history দিন। বর্তমান customer memo থেকে kitchen ticket আলাদা রাখুন। Hardware test-এর পর optional auto-print ও duplicate-safe reprint যোগ করুন। [Square kitchen tickets](https://squareup.com/help/us/en/article/5194-print-order-tickets) |
| ৪ | **Gift delivery** | ক্রেতা ও প্রাপকের নাম/নম্বর আলাদা রাখা, gift note, এবং প্রাপকের copy-তে মূল্য লুকানোর option। Staff copy-তে COD সংগ্রহের তথ্য স্পষ্ট থাকবে। |
| ৫ | **Reorder ও verified reviews** | আগের অর্ডার থেকে bag বানান। বন্ধ পণ্য, নতুন দাম ও পরিবর্তিত slot review করতে দিন। Delivered customer-এর বিদ্যমান review flow-তে ছবি ও size/flavour context যোগ করা যায়। |
| ৬ | **দোকানের কাজের সূচক** | ব্যক্তিগত তথ্য ছাড়াই checkout failure কারণ, সময়মতো delivery, unacknowledged order ও quote-to-order conversion মাপুন। এ থেকে কোন কাজের প্রভাব বেশি বোঝা যাবে। |

## Release acceptance-এর ন্যূনতম ধাপ

1. Test Sheet-এ catalog, logo, offer ও zone edit করে web ও app দুই জায়গায় দেখা এবং sync delay লেখা।
2. ওয়েবের guest COD এবং app-এর custom order, দুটোতেই amount, four-digit display number, customer link ও Sheet-এর স্থায়ী order ID মেলানো।
3. Active order ১০০-এর বেশি, পুরোনো Baking order, malformed row, duplicate submit ও একসঙ্গে শেষ delivery slot নেওয়ার পরীক্ষা।
4. Admin দিয়ে create → confirm → bake → ready → delivery → collected চালানো। Kitchen ও rider-এর অননুমোদিত action বন্ধ, sold count একবার বৃদ্ধি এবং delivered customer-এর review moderation যাচাই।
5. Installed Android/iOS-এ locked screen push ও sound, app reopen-এ silent refresh, ছোট screen ও দীর্ঘ Bangla text, এবং বাস্তব 80mm print যাচাই।

## লোকাল fix ও release প্রস্তুতি

- `aurora-2026-11-03-order-reliability-r4` Apps Script bundle এবং health proxy একই release ID ব্যবহার করে। Existing Apps Script deployment-এ পুরো `Code.AllInOne.gs` দিয়ে নতুন version প্রকাশ করার পর health API-তে `up_to_date: true` মিলতে হবে। Existing Sheet বা Script Properties reset করার প্রয়োজন নেই।
- সব active order ফেরত আসে। Delivered ও cancelled অর্ডারের তালিকায় সর্বশেষ ১০০টি থাকে। পুরোনো history pagination ও আলাদা reporting aggregate বাকি। Corrupt receipt ধরা পড়লে আগের নিরাপদ snapshot রাখার guard সক্রিয়।
- একই দিনের slot শুরু হলে নতুন checkout নেওয়া বন্ধ হয়। Same-day slot label সময় দিয়ে শুরু করুন, যেমন `10:00 AM - 12:00 PM`। Existing Sheet-এ capacity চাইলে `delivery_slots` tab-এ `max_orders_per_day` header যোগ করে প্রতি slot-এ পূর্ণসংখ্যা দিন। ফাঁকা বা `0` মানে সীমা নেই। প্রতিদিনের প্রতি slot-এ non-cancelled order গোনা হয়। পূর্ণ slot save-এর সময় ধরা পড়ে।
- Customer link তৈরির সময় থেকে ৩০ দিন চলে। Staff ওয়েব ও native app থেকে link বাতিল করতে পারে। নতুন link-এর মেয়াদ নতুন করে শুরু হয়।
- Remote push চালুর জন্য EAS project ID দিয়ে `EXPO_PUBLIC_EAS_PROJECT_ID` সেট করুন, Android FCM এবং iOS APNs credentials কনফিগার করুন এবং Expo enhanced push security access token Apps Script-এর `AURORA_EXPO_PUSH_ACCESS_TOKEN` Script Property-তে রাখুন। তারপর installed build-এ password staff account দিয়ে login করে sound ও locked-screen notification পরীক্ষা করুন। Push best-effort, এবং local background polling fallback আছে। [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)
