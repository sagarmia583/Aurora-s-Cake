# 🍰 Cake Shop Security Audit & RLS Specification

## 1. Threat Modeling & Vulnerability Safeguards

| Threat Vector | Potential Vulnerability | Production Safeguard Implemented |
|---|---|---|
| **Price Tampering** | Customer modifies client JavaScript request body `amount: 1` | `create_secure_order` PostgreSQL RPC calculates totals using database prices of variant, flavor, and add-ons. Client prices are completely ignored. |
| **Privilege Escalation** | Low-privilege staff access admin routes | Granular permissions system via `staff_roles` & `role_permissions`. Supabase RLS enforces `has_permission(auth.uid(), 'module.action')`. |
| **Unauthorized Delivery Access** | Delivery rider reads competitor/other rider addresses | RLS on `deliveries` table restricts rows to `rider_id = auth.uid()` for non-managers. |
| **Secret Leaks** | Frontend bundle contains `service_role` key | Only public anon key is exposed to web clients; elevated actions occur exclusively within database functions or Edge Functions. |
| **Fake Delivery Proofs** | Unverified delivery completions | Delivery rider cannot mark status as `delivered` without supplying customer's matching 4-digit OTP. |
| **Insecure Image Uploads** | Malicious file types or tampering with private receipts | Supabase Storage RLS restricts bucket writes to verified roles with MIME type checking. |

---

## 2. Role-to-Permission Mapping
- **`super_admin`**: `*` (All permissions)
- **`admin`**: All operational modules, settings, staff view, coupons, reports
- **`order_manager`**: `dashboard.view`, `orders.view`, `orders.create`, `orders.update`, `customers.view`, `payments.view`
- **`kitchen_manager`**: `dashboard.view`, `kitchen.view`, `kitchen.update`, `orders.view`
- **`delivery_manager`**: `dashboard.view`, `orders.view`, `delivery.view`, `delivery.assign`, `delivery.update`
- **`accountant`**: `dashboard.view`, `payments.view`, `payments.update`, `reports.view`, `orders.view`
- **`delivery_man`**: `dashboard.view`, `delivery.view`, `delivery.update` (assigned rows only)
