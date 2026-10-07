# 🍰 Cake Shop Implementation Roadmap

- [x] **Phase 0: Project Architecture & Foundations**
  - [x] Environment configuration (`.env.example`, Supabase variables)
  - [x] Responsive layout with Tailwind CSS
  - [x] Modular project structure separating Storefront, Operations, and Schema layers
  - [x] Client-side & In-memory High-Speed Caching Engine (SWR + Tagged Invalidation)

- [x] **Phase 1: Database Architecture & PostgreSQL Schema**
  - [x] Migration SQL for all 28 core tables
  - [x] Audit log schema and updated_at triggers
  - [x] Foreign keys, unique constraints, and search indexes

- [x] **Phase 2: Security & Row Level Security (RLS)**
  - [x] Permission-based RBAC helper functions (`has_permission`, `is_staff`, `is_super_admin`)
  - [x] RLS policies for customers, kitchen staff, delivery riders, and administrators
  - [x] Storage bucket security rules (Public vs Private)

- [x] **Phase 3: Secure Order Transaction Engine (RPC)**
  - [x] Server-side price recalculation function `create_secure_order`
  - [x] Coupon validation and discount enforcement
  - [x] Snapshotting product variants and add-on costs

- [x] **Phase 4: Store Identity & Dynamic Shop Settings**
  - [x] Dynamic brand name, contact numbers, hours, social links, currency, order toggles
  - [x] Promotional banner manager

- [x] **Phase 5: Catalog Management (Categories, Products, Flavors, Add-ons)**
  - [x] Multi-weight variants (500g, 1kg, 1.5kg, 2kg)
  - [x] Flavor mapping per product
  - [x] Bakery add-ons (Candles, Greeting Cards, Toppers, Flowers)
  - [x] Soft deactivation & featured cakes toggle

- [x] **Phase 6: Customer Web Storefront**
  - [x] Responsive mobile & desktop navigation
  - [x] Hero carousel & category filter chips
  - [x] Interactive product detail modal with instant live price calculation
  - [x] Custom cake dedication message input

- [x] **Phase 7: Cart, Delivery Slots & Tamper-Proof Checkout**
  - [x] Real-time cart drawer with variant & add-on breakdowns
  - [x] Delivery zone selector (Tangail Town, Nearby Area, Outside Town)
  - [x] Delivery time slot picker
  - [x] Payment selection (COD, bKash, Nagad, Card)
  - [x] Instant order placement with simulated atomic server validation

- [x] **Phase 8: Real-Time Order Tracking & Customer History**
  - [x] 8-stage visual progress timeline:
    `Pending` ➔ `Confirmed` ➔ `Preparing` ➔ `Ready` ➔ `Assigned` ➔ `Picked Up` ➔ `Out for Delivery` ➔ `Delivered`
  - [x] Customer order details & reorder action
  - [x] Delivery OTP display for customer verification

- [x] **Phase 9: Kitchen Display System (KDS)**
  - [x] Dedicated view for Kitchen Manager
  - [x] Live ticket columns: Confirmed, Preparing, Ready
  - [x] Cake dedication text & flavor/weight highlighting
  - [x] One-click status transitions with timestamp tracking

- [x] **Phase 10: Delivery Rider Portal**
  - [x] Dedicated view for Delivery Riders
  - [x] View assigned deliveries only
  - [x] Customer contact action & address routing
  - [x] 4-digit Delivery OTP modal verification
  - [x] COD cash collection verification toggle

- [x] **Phase 11: Admin Operations & Analytics**
  - [x] Daily sales, order volume, payment breakdown
  - [x] Interactive Role Switcher for seamless testing across all personas
  - [x] Order management with timeline history
  - [x] Coupon manager & Custom cake quote management
  - [x] Live Audit Logs

- [x] **Phase 12: High-Speed Caching & Performance Verification**
  - [x] Cache stats inspection (Cache hit ratio, Latency reduction, Memory consumption)
  - [x] Cache flush and benchmark simulation
