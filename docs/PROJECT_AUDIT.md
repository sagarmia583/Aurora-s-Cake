# 🍰 Cake Shop System Architecture & Project Audit

## 1. Executive Summary & Architecture Overview
This document outlines the complete production-grade architecture for the Cake Shop e-commerce and multi-role operations suite, designed with:
- **Customer Storefront (Web & Responsive Mobile)**: Next.js / React with Tailwind CSS, OTP authentication flow, real-time order tracking, custom cake builder, and zero hardcoded shop information.
- **Operations & Staff Hub (Expo / React Native & Responsive Web)**: Granular permission-based access control (Super Admin, Admin, Order Manager, Kitchen Manager, Delivery Manager, Accountant, Delivery Rider).
- **Backend & Database**: Supabase (PostgreSQL 15+, Row Level Security, Edge Functions, RPC, Realtime subscriptions, and Storage).
- **High-Performance Multi-Tier Caching Engine**: SWR (Stale-While-Revalidate) in-memory and persistent cache layer to minimize database egress, sub-10ms response times, and automated cache invalidation upon admin edits.

---

## 2. Core Entities & Database Structure
The database enforces referential integrity, historical data preservation via price snapshotting, and soft deactivation:

1. `shop_settings`: Key-value or single-row dynamic store configuration (Shop name, logo, phone, WhatsApp, opening/closing hours, currency, order toggles, social links).
2. `categories`: Hierarchical bakery categories with sort order and visual assets.
3. `products`: Base bakery item with slug, description, category foreign key, and active/featured flags.
4. `product_images`: Multi-image gallery with sort order and public Supabase Storage CDN URLs.
5. `product_variants`: Size/weight options (e.g., 500g, 1kg, 1.5kg, 2kg) with specific base prices and sale prices.
6. `flavors` & `product_flavors`: Flavor selections (Vanilla, Dark Chocolate, Red Velvet, Black Forest, etc.) mapped per product.
7. `product_addons` & `product_addon_map`: Birthday candles, gift cards, luxury cake toppers, flowers, chocolates.
8. `banners`: Promotional hero banners and seasonal campaign sliders.
9. `customers` & `customer_addresses`: Mobile-verified user records with multiple saved addresses (House, Street, Area, Landmark).
10. `delivery_zones`: Fixed zones with independent delivery fees and minimum order thresholds.
11. `delivery_slots`: Configurable daily delivery windows (e.g., 10:00 AM - 12:00 PM, 04:00 PM - 06:00 PM).
12. `staff`, `roles`, `staff_roles`, `permissions`, `role_permissions`: Strict permission-based RBAC.
13. `orders`, `order_items`, `order_item_addons`, `order_status_history`: Orders with full item price snapshots at time of purchase.
14. `deliveries`: Assigned rider, dispatch timestamp, 4-digit verification OTP, COD status, proof image, and delivery notes.
15. `payments`: Payment method (`cod`, `bkash`, `nagad`, `card`), gateway transaction ID, verification state, and amount.
16. `coupons` & `coupon_usage`: Discount rules (percentage/flat, min order, usage caps).
17. `reviews`: Customer ratings & photos moderated by admin approval before publishing.
18. `custom_cake_requests`: Custom design quote submissions with reference pictures and admin pricing quotes.
19. `audit_logs`: Immutable tracking of admin and staff actions.

---

## 3. High-Performance Caching Strategy
To ensure ultra-fast load times and minimal server load:
- **Stale-While-Revalidate (SWR)**: Client serves instantaneous cached data while asynchronously fetching fresh data from the server.
- **Cache Invalidation Tags**: Whenever products, categories, or settings are modified in the Admin panel, specific cache keys (`shop_settings`, `categories`, `products_list`) are invalidated immediately.
- **Optimistic UI Updates**: Cart mutations, order status toggles, and review approvals reflect instantaneously in UI before server round-trips.

---

## 4. Security & Zero-Trust Client Model
1. **No Client-Calculated Prices**: Prices submitted from the browser are never trusted. All totals, variant pricing, add-on additions, and discounts are computed inside the atomic PostgreSQL RPC function `create_secure_order`.
2. **Strict RLS**: Direct tables like `orders`, `payments`, `deliveries`, and `staff` have zero public write access. Customers can only view their own records; riders can only view their assigned deliveries.
3. **Storage Isolation**: Public buckets (`product-images`, `shop-assets`, `banner-images`) are CDN-cached. Private buckets (`delivery-proofs`, `custom-cake-images`) require signed tokens or staff role authorization.
