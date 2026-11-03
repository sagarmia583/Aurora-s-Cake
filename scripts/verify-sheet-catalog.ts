/** Read-only: compare a public API snapshot with raw public catalogue Sheet rows.
 * Usage: tsx scripts/verify-sheet-catalog.ts public.json raw-catalog.json
 * Never calls create_order or writes to a database.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {normalizePublicSiteData} from '../src/services/googleSheets';
import {normalizeCatalog,quote as nativeQuote} from '../apps/staff-mobile/src/native/model';

const [publicFile,rawFile]=process.argv.slice(2);
if(!publicFile||!rawFile)throw new Error('Supply the public API snapshot and raw catalogue JSON paths.');
const payload=JSON.parse(fs.readFileSync(publicFile,'utf8'));
const data=normalizePublicSiteData(payload),raw=JSON.parse(fs.readFileSync(rawFile,'utf8'));
const nativeCatalog=normalizeCatalog(payload);
const tables={...raw,settings:Object.entries(data.settings).map(([key,value])=>({key,value})),
  flavors:data.flavors,product_addons:data.addons,delivery_zones:data.zones,delivery_slots:data.slots,coupons:data.coupons};
const backend:Record<string,any>={console,Utilities:{getUuid:randomUUID,
  formatDate:(date:Date)=>date.toISOString().slice(0,10)}};
vm.createContext(backend);
vm.runInContext(fs.readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8'),backend);
backend.auroraRows_=(_book:unknown,name:keyof typeof tables)=>tables[name]||[];
let checked=0;
const failures:string[]=[];
for(const product of data.products.filter(p=>p.is_active)) {
  if(!product.variants.length){failures.push(`${product.id}: no available Sheet variants`);continue;}
  const flavors=product.allowed_flavor_ids.length?product.allowed_flavor_ids:[''];
  const addons=data.addons.filter(a=>product.allowed_addon_ids.includes(a.id));
  const selections=[[],...addons.map(a=>[a]),...(addons.length>1?[addons]:[])];
  for(const variant of product.variants)for(const flavor of flavors)for(const extra of selections)
    for(const zone of data.zones)for(const slot of data.slots) {
      const expected=2*((variant.sale_price??variant.price)+extra.reduce((sum,a)=>sum+a.price,0))+zone.delivery_fee;
      try {
        const order=backend.auroraBuildOrder_({}, {request_id:randomUUID(),customer_name:'Read-only verifier',
          customer_phone:'01700000000',delivery_address:'Fixture only: never submitted',
          delivery_date:new Date(Date.now()+172800000).toISOString().slice(0,10),
          delivery_zone_id:zone.id,delivery_slot:slot.slot_label,coupon_code:'',order_note:'',expected_total:expected,
          cart_items:[{product_id:product.id,variant_id:variant.id,flavor_id:flavor,quantity:2,
            addon_ids:extra.map(a=>a.id),writing_message:''}]});
        if(order.total_amount!==expected)throw new Error('Displayed and backend total differ.');
        const native=nativeQuote(nativeCatalog,[{product_id:product.id,variant_id:variant.id,flavor_id:flavor,quantity:2,addon_ids:extra.map(a=>a.id),writing_message:''}],zone.id,'');
        if(native.total!==order.total_amount)throw new Error('Native app and backend total differ: '+JSON.stringify({native:native.total,backend:order.total_amount,zone:zone.id,extras:extra.map(a=>a.id)}));
        checked++;
      } catch(error) {failures.push(`${product.id}/${variant.id}: ${error instanceof Error?error.message:String(error)}`);}
    }
}
console.log(JSON.stringify({activeProducts:data.products.filter(p=>p.is_active).length,
  activeVariants:data.products.filter(p=>p.is_active).reduce((sum,p)=>sum+p.variants.length,0),
  combinationsVerified:checked,failures:[...new Set(failures)]},null,2));
if(failures.length)process.exitCode=1;
