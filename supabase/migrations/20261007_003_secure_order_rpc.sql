-- ============================================================
-- 🍰 CAKE SHOP SECURE ORDER TRANSACTION RPC MIGRATION 003
-- ============================================================

CREATE OR REPLACE FUNCTION create_secure_order(
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_delivery_address TEXT,
    p_delivery_zone_id UUID,
    p_delivery_slot TEXT,
    p_delivery_date DATE,
    p_items JSONB, -- Array of [{ product_id, variant_id, flavor_id, writing_message, quantity, addons: [addon_id] }]
    p_coupon_code TEXT DEFAULT NULL,
    p_order_note TEXT DEFAULT NULL,
    p_payment_method TEXT DEFAULT 'cod'
)
RETURNS JSONB AS $$
DECLARE
    v_order_id UUID;
    v_order_number TEXT;
    v_item JSONB;
    v_addon_id UUID;
    v_variant RECORD;
    v_product RECORD;
    v_addon RECORD;
    v_zone RECORD;
    v_coupon RECORD;
    v_calculated_subtotal NUMERIC(10, 2) := 0;
    v_item_subtotal NUMERIC(10, 2) := 0;
    v_delivery_fee NUMERIC(10, 2) := 0;
    v_discount NUMERIC(10, 2) := 0;
    v_final_total NUMERIC(10, 2) := 0;
    v_delivery_otp VARCHAR(6);
    v_order_item_id UUID;
    v_flavor_name TEXT;
BEGIN
    -- 1. Validate delivery zone
    SELECT * INTO v_zone FROM delivery_zones WHERE id = p_delivery_zone_id AND is_active = true;
    IF FOUND THEN
        v_delivery_fee := v_zone.delivery_fee;
    ELSE
        v_delivery_fee := 60.00; -- default local fee
    END IF;

    -- Generate random 4-digit OTP for rider delivery verification
    v_delivery_otp := LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- Generate human-friendly order number: CAKE-YYMMDD-XXXX
    v_order_number := 'CAKE-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 90000 + 10000)::TEXT, 5, '0');

    -- 2. Verify all items and calculate subtotal using AUTHORITATIVE DATABASE PRICES
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        SELECT * INTO v_variant FROM product_variants WHERE id = (v_item->>'variant_id')::UUID AND is_active = true;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Variant % is inactive or does not exist', (v_item->>'variant_id');
        END IF;

        SELECT * INTO v_product FROM products WHERE id = v_variant.product_id AND is_active = true;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % is unavailable', v_variant.product_id;
        END IF;

        -- Base price calculation from variant
        v_item_subtotal := COALESCE(v_variant.sale_price, v_variant.price) * (v_item->>'quantity')::INT;

        -- Add-on calculation
        IF v_item ? 'addons' AND jsonb_array_length(v_item->'addons') > 0 THEN
            FOR v_addon_id IN SELECT (jsonb_array_elements_text(v_item->'addons'))::UUID
            LOOP
                SELECT * INTO v_addon FROM product_addons WHERE id = v_addon_id AND is_active = true;
                IF FOUND THEN
                    v_item_subtotal := v_item_subtotal + v_addon.price;
                END IF;
            END LOOP;
        END IF;

        v_calculated_subtotal := v_calculated_subtotal + v_item_subtotal;
    END LOOP;

    -- 3. Validate & apply coupon if provided
    IF p_coupon_code IS NOT NULL AND TRIM(p_coupon_code) <> '' THEN
        SELECT * INTO v_coupon FROM coupons 
        WHERE code = UPPER(TRIM(p_coupon_code))
          AND is_active = true
          AND NOW() BETWEEN start_date AND end_date
          AND (usage_limit IS NULL OR usage_count < usage_limit);

        IF FOUND AND v_calculated_subtotal >= v_coupon.min_order_amount THEN
            IF v_coupon.discount_type = 'percentage' THEN
                v_discount := ROUND((v_calculated_subtotal * (v_coupon.discount_value / 100.0)), 2);
                IF v_coupon.max_discount_amount IS NOT NULL AND v_discount > v_coupon.max_discount_amount THEN
                    v_discount := v_coupon.max_discount_amount;
                END IF;
            ELSE
                v_discount := v_coupon.discount_value;
            END IF;

            -- Increment coupon usage
            UPDATE coupons SET usage_count = usage_count + 1 WHERE id = v_coupon.id;
        END IF;
    END IF;

    -- Final calculation
    v_final_total := GREATEST(0, (v_calculated_subtotal - v_discount) + v_delivery_fee);

    -- 4. Insert authoritative order
    INSERT INTO orders (
        order_number, customer_name, customer_phone, delivery_address,
        delivery_zone_id, delivery_slot, delivery_date, status,
        subtotal, delivery_fee, discount_amount, total_amount,
        coupon_id, order_note
    ) VALUES (
        v_order_number, p_customer_name, p_customer_phone, p_delivery_address,
        p_delivery_zone_id, p_delivery_slot, p_delivery_date, 'pending',
        v_calculated_subtotal, v_delivery_fee, v_discount, v_final_total,
        v_coupon.id, p_order_note
    ) RETURNING id INTO v_order_id;

    -- 5. Insert order items & add-on snapshots
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        SELECT * INTO v_variant FROM product_variants WHERE id = (v_item->>'variant_id')::UUID;
        SELECT * INTO v_product FROM products WHERE id = v_variant.product_id;

        SELECT name INTO v_flavor_name FROM flavors WHERE id = (v_item->>'flavor_id')::UUID;

        INSERT INTO order_items (
            order_id, product_id, product_name, variant_name, flavor_name,
            writing_message, unit_price, quantity, subtotal
        ) VALUES (
            v_order_id, v_product.id, v_product.name, v_variant.name, v_flavor_name,
            v_item->>'writing_message', COALESCE(v_variant.sale_price, v_variant.price),
            (v_item->>'quantity')::INT,
            COALESCE(v_variant.sale_price, v_variant.price) * (v_item->>'quantity')::INT
        ) RETURNING id INTO v_order_item_id;

        -- Record add-ons
        IF v_item ? 'addons' AND jsonb_array_length(v_item->'addons') > 0 THEN
            FOR v_addon_id IN SELECT (jsonb_array_elements_text(v_item->'addons'))::UUID
            LOOP
                SELECT * INTO v_addon FROM product_addons WHERE id = v_addon_id;
                IF FOUND THEN
                    INSERT INTO order_item_addons (order_item_id, addon_id, addon_name, unit_price, quantity, subtotal)
                    VALUES (v_order_item_id, v_addon.id, v_addon.name, v_addon.price, 1, v_addon.price);
                END IF;
            END LOOP;
        END IF;
    END LOOP;

    -- 6. Insert Order Status History
    INSERT INTO order_status_history (order_id, status, notes)
    VALUES (v_order_id, 'pending', 'Order placed by customer via web storefront');

    -- 7. Insert Payment record
    INSERT INTO payments (order_id, payment_method, amount, status)
    VALUES (v_order_id, p_payment_method, v_final_total, CASE WHEN p_payment_method = 'cod' THEN 'pending' ELSE 'paid' END);

    -- 8. Insert Delivery record with OTP
    INSERT INTO deliveries (order_id, delivery_otp, cod_amount, cod_collected, status)
    VALUES (v_order_id, v_delivery_otp, CASE WHEN p_payment_method = 'cod' THEN v_final_total ELSE 0 END, false, 'unassigned');

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'subtotal', v_calculated_subtotal,
        'delivery_fee', v_delivery_fee,
        'discount', v_discount,
        'total', v_final_total,
        'delivery_otp', v_delivery_otp
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
