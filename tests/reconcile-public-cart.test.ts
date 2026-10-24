import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_PUBLIC_SITE_DATA } from '../src/content/defaultSiteData';
import { reconcilePublicCart, reorderFromPublicOrder } from '../src/services/reconcilePublicCart';
import type { CartItem, Order } from '../src/types';

function fixture() {
  const data=structuredClone(DEFAULT_PUBLIC_SITE_DATA);
  const product=data.products[0];
  const variant=product.variants[0];
  const flavor=data.flavors.find(value=>product.allowed_flavor_ids.includes(value.id))!;
  const addon=data.addons.find(value=>product.allowed_addon_ids.includes(value.id))!;
  const unitPrice=(variant.sale_price??variant.price)+addon.price;
  const item:CartItem={
    cart_item_id:'saved-cart-line',product:structuredClone(product),selected_variant:structuredClone(variant),
    selected_flavor:structuredClone(flavor),selected_addons:[structuredClone(addon)],
    writing_message:'Keep my dedication',quantity:2,unit_price:unitPrice,total_price:unitPrice*2,
  };
  return {data,item,product,variant,flavor,addon};
}

test('current Sheet variant and add-on prices reprice every cake in the line',()=>{
  const {data,item,variant,addon}=fixture();
  variant.price=900;delete variant.sale_price;addon.price=150;
  const result=reconcilePublicCart([item],data);
  assert.equal(result.changed,true);
  assert.equal(result.removedCount,0);
  assert.equal(result.items[0].unit_price,1050);
  assert.equal(result.items[0].total_price,2100);
  assert.equal(result.items[0].cart_item_id,'saved-cart-line');
  assert.equal(result.items[0].writing_message,'Keep my dedication');
  assert.equal(item.quantity,2);
  assert.notEqual(item.unit_price,1050);
});

test('a removed selected variant removes the line rather than picking a different size',()=>{
  const {data,item,product,variant}=fixture();
  product.variants=product.variants.filter(value=>value.id!==variant.id);
  const result=reconcilePublicCart([item],data);
  assert.deepEqual(result.items,[]);
  assert.equal(result.changed,true);
  assert.equal(result.removedCount,1);
});

test('missing, inactive or newly disallowed selected flavour removes the line',()=>{
  for(const mode of ['missing','inactive','not-allowed']){
    const {data,item,product,flavor}=fixture();
    if(mode==='missing')data.flavors=data.flavors.filter(value=>value.id!==flavor.id);
    if(mode==='inactive')flavor.is_active=false;
    if(mode==='not-allowed')product.allowed_flavor_ids=[];
    const result=reconcilePublicCart([item],data);
    assert.deepEqual(result.items,[],mode);
    assert.equal(result.removedCount,1,mode);
  }
});

test('removed add-ons are dropped while keeping and repricing the selected cake',()=>{
  const {data,item,variant,addon}=fixture();
  data.addons=data.addons.filter(value=>value.id!==addon.id);
  const result=reconcilePublicCart([item],data);
  const expected=variant.sale_price??variant.price;
  assert.equal(result.items.length,1);
  assert.deepEqual(result.items[0].selected_addons,[]);
  assert.equal(result.items[0].unit_price,expected);
  assert.equal(result.items[0].total_price,expected*2);
  assert.equal(result.changed,true);
  assert.equal(result.removedCount,0);
});

test('an explicit zero sale price is preserved',()=>{
  const {data,item,variant}=fixture();
  item.selected_addons=[];
  variant.sale_price=0;
  const result=reconcilePublicCart([item],data);
  assert.equal(result.items[0].unit_price,0);
  assert.equal(result.items[0].total_price,0);
  assert.equal(result.changed,true);
});

test('unchanged commercial selections remain unchanged while refreshed names and images are copied',()=>{
  const {data,item,product}=fixture();
  product.name='Current name from Sheet';product.image_url='https://example.test/new-photo.png';
  const result=reconcilePublicCart([item],data);
  assert.equal(result.changed,false);
  assert.equal(result.removedCount,0);
  assert.equal(result.items[0].product.name,'Current name from Sheet');
  assert.equal(result.items[0].product.image_url,'https://example.test/new-photo.png');
  assert.notEqual(item.product.name,'Current name from Sheet');
});

test('malformed saved cart lines, duplicate IDs and invalid quantities cannot crash reconciliation',()=>{
  const {data,item}=fixture();
  const result=reconcilePublicCart([null,{}, {...item,quantity:0},{...item,quantity:1.5},item,item] as CartItem[],data);
  assert.equal(result.items.length,1);
  assert.equal(result.removedCount,5);
  assert.equal(result.changed,true);
});

test('an intentionally empty Sheet catalogue removes previous saved selections',()=>{
  const {data,item}=fixture();
  data.products=[];
  const result=reconcilePublicCart([item],data);
  assert.deepEqual(result.items,[]);
  assert.equal(result.removedCount,1);
  assert.equal(result.changed,true);
});



function pastOrder(item: CartItem): Order {
  const base=item.selected_variant.sale_price??item.selected_variant.price;
  return {
    items:[{
      id:'past-item',order_id:'past-order',product_id:item.product.id,product_name:item.product.name,
      variant_name:item.selected_variant.name,flavor_name:item.selected_flavor?.name,
      writing_message:item.writing_message,unit_price:base,quantity:item.quantity,subtotal:item.total_price,
      addons:item.selected_addons.map(addon=>({addon_id:addon.id,addon_name:addon.name,unit_price:addon.price,quantity:item.quantity,subtotal:addon.price*item.quantity})),
    }],
  } as Order;
}

test('reorder skips removed Sheet products and never creates a placeholder product',()=>{
  const {data,item}=fixture();
  const order=pastOrder(item);
  data.products=[];
  const result=reorderFromPublicOrder(order,data);
  assert.deepEqual(result.items,[]);
  assert.equal(result.changed,true);
  assert.equal(result.removedCount,1);
});

test('reorder uses current Sheet variant and per-cake add-on prices with unique new cart IDs',()=>{
  const {data,item,variant,addon}=fixture();
  const order=pastOrder(item);
  variant.price=950;delete variant.sale_price;addon.price=175;
  const first=reorderFromPublicOrder(order,data);
  const second=reorderFromPublicOrder(order,data);
  assert.equal(first.items[0].unit_price,1125);
  assert.equal(first.items[0].total_price,2250);
  assert.equal(first.items[0].quantity,2);
  assert.equal(first.items[0].writing_message,item.writing_message);
  assert.equal(first.items[0].product,data.products[0]);
  assert.notEqual(first.items[0].cart_item_id,second.items[0].cart_item_id);
  assert.equal(first.changed,true);
  assert.equal(first.removedCount,0);
});

test('reorder preserves zero Sheet sale price and removes unavailable add-ons',()=>{
  const {data,item,variant}=fixture();
  const order=pastOrder(item);
  variant.sale_price=0;
  data.addons=[];
  const result=reorderFromPublicOrder(order,data);
  assert.equal(result.items[0].unit_price,0);
  assert.equal(result.items[0].total_price,0);
  assert.deepEqual(result.items[0].selected_addons,[]);
  assert.equal(result.changed,true);
  assert.equal(result.removedCount,0);
});

