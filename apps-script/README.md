# Google Sheet দিয়ে Aurora’s Cake-এর content ও COD orders চালানো

এই folder-এর `Code.gs`, `SeedData.gs` ও `StaffOperations.gs` একই Apps Script project-এ বসাতে হবে। Public website data GET দিয়ে আসে; checkout-এর cash-on-delivery order POST দিয়ে একই Sheet-এর private `orders` ও `order_items` tabs-এ জমা হয়। নতুন code **save করলেই setup বা deployment update হয় না**। নিচের Run ও Deploy ধাপ দুটো সম্পন্ন করুন।

## একবারের setup / পুরোনো deployment update

1. সঠিক Google account দিয়ে database Sheet খুলুন। **Extensions → Apps Script** খুলুন। বিদ্যমান script থাকলে backup নিন; একই project-এ পুরোনো `doGet`/`doPost` handler-এর duplicate রাখবেন না।
2. `Code.gs`, `SeedData.gs` ও `StaffOperations.gs` নামে তিন ফাইলের code বসান এবং Save করুন। Combined installer ব্যবহার করলে সেটির সব code একটি `Code.gs`-এ রাখতে পারেন; তখন আলাদা duplicate `SeedData.gs` রাখবেন না। Password বা secret website source-এ যোগ করবেন না।
3. `AURORA_SPREADSHEET_ID`-এ দেওয়া Sheet ID যাচাই করুন। অন্য Sheet ব্যবহার করলে ID বদলান, অথবা **Project Settings → Script Properties**-এ `AURORA_SPREADSHEET_ID` দিন। Script Properties-এর ID-কে অগ্রাধিকার দেওয়া হয়। Sheet-bound project-এর active Sheet ব্যবহার করতে constant ও property দুটোই খালি রাখুন।
4. editor-এর function dropdown থেকে **setupSheetDatabase** নির্বাচন করে **Run** করুন। সঠিক account দিয়ে নিজের Google authorization সম্পন্ন করুন। Function শুধু missing বা পুরোপুরি empty public tabs-এ starter data বসায় এবং private `orders`/`order_items`-এ headers তৈরি করে। Existing rows/headers বা `Sheet1` মুছে বা বদলে দেয় না। Existing header-only public tabs-এ নতুন demo rows ঢোকানো হয় না। Private tabs-এ customer starter rows কখনও বসে না।
5. **Deploy → New deployment → Web app**: **Execute as: Me** ও **Who has access: Anyone** নির্বাচন করুন, যদি account policy-তে available থাকে। Existing deployment update করতে **Manage deployments → Edit → New version → Deploy** ব্যবহার করুন, যাতে একই `/exec` URL নতুন `doPost` code পায়। Sheet-এর নিজের sharing private রাখুন।
6. সঠিক `/exec` URL website-এর **Studio → Google Sheets content**-এ দিন। Environment দিয়ে configure করতে `VITE_GOOGLE_SHEETS_URL` সেট করে app rebuild করুন।
7. Incognito browser-এ `YOUR_EXEC_URL?action=public` খুলুন। Google login page নয়, `{"ok":true,"schema_version":1,"data":...}` JSON দেখা প্রয়োজন। নতুন code-এ `data.order_submission_enabled` হবে `true`; এই flag Sheet setting দিয়ে চালু করা যায় না। পুরোনো deployment-এ flag না থাকলে নতুন version deploy করুন। Public data সফল হওয়া একাই private order write permission-এর পরীক্ষা নয়।

## কোথায় কী বদলাবেন

| Tab | Content |
| --- | --- |
| settings | shop_name, logo/profile image, phone, WhatsApp, email, address, opening hours, social links, accepting_orders, delivery_enabled, metadata |
| content | Hero, catalogue, custom cake, story, social section, FAQ এবং footer-এর editable লেখা ও image URLs |
| hero_slides | ছবিসহ hero slides; product_id দিয়ে optional cake relation |
| highlights | promise, occasion, custom_step ও social_gallery rows |
| faqs | প্রশ্ন ও উত্তর |
| links | অতিরিক্ত social/footer/navigation links |
| categories | Cake categories |
| products | Cake information, main image ও allowed flavour/add-on IDs |
| product_variants | প্রতিটি cake-এর size/weight/price |
| flavors | Flavours |
| product_addons | Candles, toppers ও অন্য add-ons |
| banners | Mobile app banners |
| delivery_zones | Delivery areas ও fees |
| delivery_slots | Delivery times |
| coupons | Active coupon rules; checkout server minimum, percentage/fixed value ও cap যাচাই করে |
| reviews | শুধু status=approved review website response-এ যায় |
| orders | **Private** order receipt, customer contact/address, server totals ও request deduplication |
| order_items | **Private** order lines ও selected add-on records |

- Header spelling ও stable `id` বদলাবেন না। `product_variants.product_id` অবশ্যই `products.id`-এর সঙ্গে মিলবে। Duplicate stable IDs রাখবেন না।
- `is_active`-এ TRUE/FALSE দিন। Blank active flag-কে active ধরা হয়। ছবি/লিংক/লেখা hide করতে optional value খালি রাখুন।
- Price/weight numeric রাখুন; currency symbol লিখবেন না। `sale_price=0` zero price, blank sale_price মানে regular price। Coupon `max_discount_amount` blank হলে cap নেই; zero হলে maximum discount zero।
- `gallery_images`, `allowed_flavor_ids`, `allowed_addon_ids` JSON list হতে পারে। IDs comma-separated-ও হতে পারে। Multiple image URLs JSON list বা আলাদা লাইনে দিন। Active allowed flavours থাকলে checkout-এ সেগুলোর একটি বাছতে হবে।
- `content`/settings-এর অনুমোদিত keys starter data ও Code.gs-এ নির্দিষ্ট। নতুন key শুধু Sheet-এ যোগ করলে নতুন website feature তৈরি হবে না।
- Public tabs-এ business contact ছাড়া customer phone/address, private payment বা staff তথ্য রাখবেন না। Private tabs-সহ পুরো database Sheet publish/share-to-anyone করবেন না।
- Public HTTPS image URL দিন। Google Drive share image link website thumbnail URL-এ convert করে; image file visitors-এর কাছে viewable হতে হবে। Local `/images/...` starter preview-তে কাজ করে।

## Orders কীভাবে জমা হয়

Website `text/plain` JSON POST করে `action:create_order` পাঠায়। প্রয়োজনীয় fields: `request_id` UUID, `customer_name`, `customer_phone` (text), `delivery_address`, `delivery_zone_id`, `delivery_slot` (current slot label), `delivery_date` (YYYY-MM-DD), `payment_method:'cod'`, এবং `cart_items`। প্রতি line-এ `product_id`, `variant_id`, optional `flavor_id`, `addon_ids` list, optional `writing_message`, integer `quantity` থাকে। `coupon_code`, `order_note` ও numeric `expected_total` optional। `expected_total` শুধু customer-এর দেখা estimate-এর সঙ্গে তুলনার জন্য; authoritative total-এর সঙ্গে 0.01-এর বেশি পার্থক্য হলে কোনো order না লিখে `price_changed` rejection আসে। Website refresh করে নতুন total দেখে আবার order দিন।

Server বর্তমান Sheet-এর active product, variant, allowed flavour/add-ons, area, delivery slot ও coupon যাচাই করে। Unit price, quantity অনুযায়ী add-on charges, delivery fee, discount ও final total server হিসাব করে। Browser থেকে পাঠানো price, paid status বা total বিশ্বাস করা হয় না। Phone-এ 7–15 digits, প্রতি line quantity 1–50, order-এ 1–25 lines, delivery date Bangladesh time অনুযায়ী আজ বা ভবিষ্যতের তারিখ হতে হবে। এখন শুধু COD, `status:pending` ও `payment_status:pending` দিয়ে নতুন order তৈরি হয়; online payment collection এই code করে না।

Confirmed response: `{"success":true,"persisted":true,"order":{...}}`। Receipt-এর `persistence` হলো `google_sheets`। Validation reject হলে `success:false,persisted:false,code,error` আসে। Network failure বা uncertain write হলে response-এ `persisted:false` নাও থাকতে পারে: **একই request_id ও একই form data দিয়ে retry করুন**। নতুন request ID দিলে আলাদা order হতে পারে। একই UUID-তে অন্য order data পাঠালে conflict হয়। Server ScriptLock ব্যবহার করে; আগে পুরো receipt save করে, পরে order_items index লিখে। Index লেখার মাঝখানে interruption হলে একই request-এর retry missing item rows ঠিক করে, duplicate order তৈরি করে না।

Private `orders` headers:

```text
id,order_number,request_id,request_hash,created_at,updated_at,customer_name,customer_phone,delivery_address,delivery_zone_id,delivery_zone_name,delivery_fee,delivery_slot,delivery_date,status,subtotal,discount_amount,total_amount,coupon_code,order_note,payment_method,payment_status,receipt_json
```

Private `order_items` headers:

```text
id,order_id,product_id,product_name,variant_id,variant_name,flavor_id,flavor_name,writing_message,unit_price,quantity,addons_json,subtotal
```

`request_id`, `request_hash`, `receipt_json` ও item IDs অক্ষত রাখুন: retry-তে original receipt ফেরত দেওয়ার জন্য এগুলো প্রয়োজন। প্রতিটি Sheet cell-এ formula হিসেবে চালু হওয়ার মতো string literal text হিসেবে লেখা হয়। `receipt_json` হলো original submitted order-এর authoritative acknowledgement; এটি edit করে order status management করবেন না। এখন authenticated `StaffOperations.gs` POST-এর মাধ্যমে private order list, stage update, rider assignment এবং OTP/COD confirmation করে। Public GET-এ এসব route নেই। বিস্তারিত setup: [Live Operations Setup](../docs/LIVE_OPERATIONS_SETUP.md)। পুরোনো deployment-এ এসব route থাকবে না; নতুন version deploy করতে হবে। Developer Studio-এর local demo controls এখনো আলাদা।

## Data refresh ও public boundary

API public JSON response সর্বোচ্চ 20 seconds cache করতে পারে। Website-এর পরবর্তী refresh বা reload-এ নতুন content আসে। Invalid/unavailable response হলে website আগের validated snapshot দেখাতে পারে; Studio connection status দেখুন। Intentional empty table-তে পুরোনো demo rows ফেরে না। Order submission সবসময় current Sheet prices যাচাই করে; public content cache-এর price ব্যবহার করে save হয় না।

`doGet` শুধু `public` ও `health` read action নেয়। Public response কেবল 16টি explicit public tabs/columns থেকে তৈরি হয়; private `orders`, `order_items`, profiles, payments, OTPs, staff বা audit logs পড়া বা প্রকাশ করে না। GET URL দিয়ে order তৈরি করা যায় না। JSONP compatibility শুধু এই read actions ও strict `auroraSheets_...` callback নেয়। Private POST JSONP সমর্থন করে না।

Google reference: [Web apps](https://developers.google.com/apps-script/guides/web), [Content Service](https://developers.google.com/apps-script/guides/content), [Lock Service](https://developers.google.com/apps-script/reference/lock/lock-service)।
