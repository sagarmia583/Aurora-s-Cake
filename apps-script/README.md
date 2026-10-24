# Google Sheet দিয়ে Aurora’s Cake-এর public content চালানো

এই folder-এর `Code.gs` ও `SeedData.gs` Apps Script project-এ বসাতে হবে। Website connector প্রস্তুত; live deployment থেকে JSON পাওয়া না গেলে connection status-এ setup প্রয়োজন দেখাবে। আগের sign-in page-কে সফল connection বলা হবে না।

## একবারের setup

1. সঠিক Google account দিয়ে আপনার database Sheet খুলুন। **Extensions → Apps Script** খুলুন। বিদ্যমান script থাকলে আগে backup নিন; পুরোনো `doGet`/`doPost`-এর সঙ্গে এই handler-এর conflict রাখবেন না।
2. `Code.gs` ও `SeedData.gs` নামে এই দুই ফাইলের code বসান। কোনো password বা secret website source-এ যোগ করবেন না।
3. `AURORA_SPREADSHEET_ID`-এ দেওয়া Sheet ID যাচাই করুন। অন্য Sheet ব্যবহার করলে ID বদলান, অথবা **Project Settings → Script Properties**-এ `AURORA_SPREADSHEET_ID` দিন। Script Properties-এর ID-কে অগ্রাধিকার দেওয়া হয়। Sheet-bound project-এর active Sheet ব্যবহার করতে constant ও property দুটোই খালি রাখুন।
4. editor থেকে **setupSheetDatabase** একবার Run করুন। আপনার নিজের Google authorization প্রয়োজন হলে নিজে সম্পন্ন করুন। এই function শুধু missing বা পুরোপুরি empty public tabs তৈরি করে starter data বসায়। Existing rows/headers মুছে বা বদলে দেয় না। Header-only existing tabs empty হিসেবেই থাকে।
5. **Deploy → New deployment → Web app**: public website data পরিবেশনের জন্য **Execute as: Me** ও **Who has access: Anyone** নির্বাচন করুন, যদি account policy-তে available থাকে। Sheet-এর নিজের sharing private রাখা যায়; এই code কেবল নিচের public tables/columns পড়ে। Existing deployment update করলে **Manage deployments → Edit → New version → Deploy** ব্যবহার করুন।
6. সঠিক `/exec` URL website-এর **Studio → Google Sheets content**-এ দিন। Environment দিয়ে configure করতে `VITE_GOOGLE_SHEETS_URL` সেট করে app rebuild করুন।
7. Incognito browser-এ `YOUR_EXEC_URL?action=public` খুলে যাচাই করুন। Google login page নয়, `{"ok":true,"schema_version":1,"data":...}` JSON দেখা প্রয়োজন।

## কোথায় কী বদলাবেন

| Tab | Content |
| --- | --- |
| settings | shop_name, logo/profile image, phone, WhatsApp, email, address, opening hours, social links, website metadata |
| content | Hero, catalogue, custom cake, story, social section, FAQ এবং footer-এর editable লেখা ও section image URLs |
| hero_slides | ছবিসহ hero slides; product_id দিয়ে optional cake relation |
| highlights | promise, occasion, custom_step ও social_gallery rows |
| faqs | প্রশ্ন ও উত্তর |
| links | অতিরিক্ত social/footer/navigation links |
| categories | Cake categories |
| products | Cake information, main image ও allowed flavour/add-on IDs |
| product_variants | প্রতিটি cake-এর size/weight/price |
| flavors | Flavours |
| product_addons | Candles, toppers ও other add-ons |
| banners | Mobile app banners |
| delivery_zones | Delivery areas ও fees |
| delivery_slots | Delivery times |
| coupons | Public demo offers |
| reviews | শুধু status=approved review website response-এ যাবে |

- Header spelling ও stable `id` বদলাবেন না। `product_variants.product_id` অবশ্যই `products.id`-এর সঙ্গে মিলবে।
- `is_active`-এ TRUE/FALSE দিন। Blank active flag-কে active ধরা হয়। ছবি/লিংক/লেখা hide করতে optional value খালি রাখুন।
- Price/weight numeric রাখুন; currency symbol value-এর মধ্যে লিখবেন না। `sale_price=0` zero price, blank sale_price মানে regular price।
- `gallery_images`, `allowed_flavor_ids`, `allowed_addon_ids` JSON list হতে পারে। IDs comma-separated-ও হতে পারে। Multiple image URLs JSON list বা আলাদা লাইনে দিন।
- `content`/settings-এর অনুমোদিত keys starter data ও Code.gs-এ নির্দিষ্ট। নতুন key শুধু Sheet-এ যোগ করলে নতুন website feature তৈরি হবে না।
- নাম, ফোন ও business email কেবল public business contact হিসেবে দিন। ব্যক্তিগত customer তথ্য এই tabs-এ রাখবেন না।
- Public image URL দিন। Google Drive share image link website thumbnail URL-এ convert করে; image file নিজে visitors-এর কাছে viewable হতে হবে। পুরো database Sheet public করা প্রয়োজন নেই।
- Local `/images/...` paths starter preview-তে কাজ করে। নিজের ছবি ব্যবহার করলে public HTTPS image URL দিন।

## Data refresh ও fallback

API public JSON response সর্বোচ্চ 20 seconds cache করতে পারে। Website-এর পরবর্তী content refresh বা reload-এ নতুন data আসে। Sheet response invalid/unavailable হলে website আগের validated snapshot দেখাতে পারে; Studio-তে connection status দেখুন। Intentional empty table-কে পুরোনো demo rows দিয়ে পূরণ করা হয় না।

## Public data boundary

এই API-তে কোনো write route নেই। Orders, customer profiles, customer phone/address, payments, delivery OTPs, staff, audit logs এবং custom requests পড়া বা ফেরত দেওয়া হয় না। Website checkout এখনও আলাদা local demo flow; এই public CMS connection real order/payment backend তৈরি করে না।

Apps Script JSONP compatibility route শুধু public action ও strict `auroraSheets_...` callback সমর্থন করে। Arbitrary callback code গ্রহণ করে না।

Google-এর reference: [Web apps](https://developers.google.com/apps-script/guides/web), [Content Service](https://developers.google.com/apps-script/guides/content)।

