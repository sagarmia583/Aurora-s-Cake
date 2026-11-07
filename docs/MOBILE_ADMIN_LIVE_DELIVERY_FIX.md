# Aurora's Cake — Mobile Admin & Live Rider/Delivery Workflow

## Root causes
1. The legacy Admin Panel attempted to assign a hardcoded demo rider and optimistically changed local `mockDb` status. It swallowed backend failures, so a green local badge could disagree with the live Google Sheet.
2. Live Staff Portal replaced **Ready → Assign rider** with **Ready → Start delivery** for admins, although Apps Script rejects dispatch with no `rider_id`.
3. Several admin/Staff containers relied on min-content sizing on narrow devices, causing horizontal overflow.

## Safe fix, unchanged application structure
- Admin Panel retains existing sections, styling, and read-only report cards; its Delivery and Orders actions now open **the existing authenticated Staff Orders** workflow. A prominent Live Rider & Delivery entry works even if this browser has zero locally cached orders.
- Live Staff Orders performs **Ready → Assign registered rider → Pick Up → Start Delivery → Complete Delivery** and updates the UI only on a successful Apps Script response.
- Registered riders come from the verified `staff_session.riders` roster. No hardcoded demo email or client-supplied `rider_name`. When a new rider account is created, update available rider options immediately.
- Admin/super-admin can carry out authorized transitions. Rider permissions and COD cash confirmation remain server-enforced.
- On mobile, the existing admin and Staff Portal containers are bounded to viewport width, with horizontal scrolling left inside table/tab areas. No existing menu, section, color scheme, stylesheet architecture, or database schema is replaced.
- The source sits on top of pending PR #45 (checkout gifts) and #46 (phone and performance). No Apps Script version changes are necessary.

## How to operate
1. Open **Management Hub → Live Rider & Delivery** or **Delivery & Riders → Live Rider Assignment & Delivery**.
2. Sign into Staff Portal with an authorized admin account. The **Orders & delivery** tab opens.
3. For an order in `ready`, select a registered active rider then **Assign rider**.
4. Use **Pick up cake → Start delivery**. For delivered COD, confirm the actually received cash amount before **Confirm Delivery**.
5. If no active riders are present, create a delivery rider account under Team; return to the order to assign. Real order state is saved by Apps Script in the original Google Sheet, not browser mock data.

## Deployment and verification
- Run `npm run lint`, full tests and `npm run build`. Confirm 320px/375px/390px mobile viewport in a real browser.
- This change is code-only until a successful Netlify preview is published. Keep Auto Publishing locked. Do not claim production delivery was tested without actual authenticated staff and a controlled test order.
- No customer order, delivery or COD mutation is performed by this patch itself.
