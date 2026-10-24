import assert from 'node:assert/strict';
import test from 'node:test';
import { mockDb } from '../src/services/mockDatabase';
import type { CartItem } from '../src/types';

async function cake(quantity: number): Promise<CartItem> {
 const products = await mockDb.getProducts();
 const product = products.find(p => p.id === 'prod-1')!;
 const variant = product.variants.find(v => v.id === 'var-1-2')!;
 const addon = mockDb.getAddons().find(a => a.id === 'addon-1')!;
 const unitPrice = (variant.sale_price ?? variant.price) + addon.price;
 return {cart_item_id:'test-cart',product,selected_variant:variant,selected_addons:[addon],writing_message:'Test',quantity,unit_price:unitPrice,total_price:unitPrice*quantity};
}
const order = async (item:CartItem,coupon_code?:string) => mockDb.createSecureOrder({
 customer_name:'Preview Test',customer_phone:'01700000000',delivery_address:'Demo address',
 delivery_zone_id:'zone-1',delivery_slot:mockDb.getDeliverySlots()[0].slot_label,
 delivery_date:'2026-10-24',cart_items:[item],payment_method:'card',coupon_code,
});
test('multi-cake orders charge each add-on for every cake and never mark demo cards paid',async()=>{
 const item=await cake(2); const result=await order(item);
 assert.equal(result.success,true);
 assert.equal(result.order.subtotal,2540);
 assert.equal(result.order.total_amount,2600);
 assert.equal(result.order.items[0].addons[0].quantity,2);
 assert.equal(result.order.items[0].addons[0].subtotal,240);
 assert.equal(result.order.payment_status,'pending');
});
test('fixed coupon is applied after all cake and add-on quantities',async()=>{
 const result=await order(await cake(2),'WELCOME100');
 assert.equal(result.order.discount_amount,100);
 assert.equal(result.order.total_amount,2500);
});
test('percentage coupon respects its maximum discount',async()=>{
 const result=await order(await cake(5),'BIRTHDAY10');
 assert.equal(result.order.subtotal,6350);
 assert.equal(result.order.discount_amount,300);
 assert.equal(result.order.total_amount,6110);
});
