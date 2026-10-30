import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const source=fs.readFileSync(new URL('../src/components/WebsiteManager.tsx',import.meta.url),'utf8');
const marker='return <section className="rounded-2xl border border-emerald-200';
assert.equal(source.split(marker).length,2);
// Execute the real handlers; expose them only in this in-memory test copy.
const compiled=transformSync(source.replace(marker,
  'globalThis.editor={table,data,draft,selected,creating,loading,saving,uploading,error,notice,setDraft,load,changeTable,create,choose,cancel,save,archive,uploadImage}; '+marker),
  {loader:'tsx',format:'cjs',target:'es2022'}).code;
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve!:(value:any)=>void,reject!:(reason:unknown)=>void;const promise=new Promise<any>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const snapshot=(table:string,columns:string[],rows:Record<string,unknown>[]=[])=>({table,columns,rows,total:rows.length,truncated:false,can_delete:true});
const products=snapshot('products',['id','name','image_url'],[
  {id:'product_A',name:'Cake A',image_url:'https://fixture.invalid/a.jpg'},
  {id:'product_B',name:'Cake B',image_url:'https://fixture.invalid/b.jpg'}]);
const text=(node:any):string=>node==null?'':Array.isArray(node)?node.map(text).join(''):typeof node==='object'?text(node.props?.children):String(node);
const elements=(node:any):any[]=>node==null?[]:Array.isArray(node)?node.flatMap(elements):typeof node==='object'?[node,...elements(node.props?.children)]:[];

function editorHarness(api:Record<string,any>){
  const slots:any[]=[];let cursor=0,effects:(()=>void)[]=[],tree:any,updates=0;
  const props={endpoint:'https://fixture.invalid/exec',token:'OFFLINE_FIXTURE',role:'super_admin',onUpdated:()=>{updates++;}};
  const same=(a:any[],b:any[])=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
  const hooks={
    useState(initial:any){const index=cursor++;if(!slots[index])slots[index]={value:typeof initial==='function'?initial():initial};return [slots[index].value,(value:any)=>{slots[index].value=typeof value==='function'?value(slots[index].value):value;}];},
    useRef(initial:any){const index=cursor++;if(!slots[index])slots[index]={ref:{current:initial}};return slots[index].ref;},
    useMemo(callback:()=>unknown,deps:any[]){const index=cursor++;if(!slots[index]||!same(slots[index].deps,deps))slots[index]={deps,value:callback()};return slots[index].value;},
    useCallback(callback:()=>unknown,deps:any[]){return hooks.useMemo(()=>callback,deps);},
    useEffect(callback:()=>unknown,deps:any[]){const index=cursor++;if(!slots[index]||!same(slots[index].deps,deps)){const previous=slots[index];slots[index]={deps};effects.push(()=>{previous?.cleanup?.();slots[index].cleanup=callback();});}},
    createElement(type:unknown,attributes:Record<string,unknown>|null,...children:unknown[]){return {type,props:{...attributes,children:children.flat()}};}
  };
  const module={exports:{} as any};
  const canvas=()=>({width:0,height:0,getContext:()=>({fillStyle:'',fillRect(){},drawImage(){}}),toBlob:(callback:(value:Blob)=>void)=>callback(new Blob(['fixture jpeg'],{type:'image/jpeg'}))});
  const ctx:any={module,exports:module.exports,console,Blob,Uint8Array,btoa,window:{confirm:()=>true},document:{createElement:canvas},createImageBitmap:async()=>({width:100,height:100,close(){}}),
    require(name:string){
      if(name==='react')return {...hooks,default:hooks,__esModule:true};
      if(name==='lucide-react')return new Proxy({},{get:()=>()=>null});
      if(name.includes('sheetStaffApi'))return {CMS_TABLE_OPTIONS:['products','product_variants','settings','content'].map(table=>({table,label:table})),...api};
      throw new Error('Unexpected import in offline editor fixture.');
    }};
  vm.createContext(ctx);vm.runInContext(compiled,ctx);
  const render=()=>{cursor=0;effects=[];tree=module.exports.WebsiteManager(props);for(const effect of effects)effect();return ctx.editor;};
  return {render,get state(){return ctx.editor;},get tree(){return tree;},get updates(){return updates;},
    setProps:(next:Partial<typeof props>)=>Object.assign(props,next),
    unmount:()=>{for(const slot of slots)slot?.cleanup?.();},
    button:(label:string)=>elements(tree).find(node=>node.type==='button'&&text(node).includes(label)),
    section:()=>elements(tree).find(node=>node.type==='select'&&node.props.value===ctx.editor.table)};
}

test('new editor variants leave optional numeric values blank, while explicit zero stays intentional',async()=>{
  const writes:any[]=[];
  const h=editorHarness({fetchCmsTable:async(_e:string,_t:string,table:string)=>snapshot(table,table==='product_variants'?['id','product_id','name','price','sale_price','rating','max_discount_amount','is_active']:['id','name']),mutateCmsTable:async(...args:any[])=>writes.push(args)});
  h.render();await tick();h.render();h.state.changeTable('product_variants');h.render();await tick();h.render();h.state.create();h.render();
  for(const field of ['sale_price','max_discount_amount','rating'])assert.equal(h.state.draft[field],'');
  h.state.setDraft({...h.state.draft,product_id:'cake',name:'1kg',price:'1000'});h.render();await h.state.save();h.render();
  assert.equal(writes[0][4].price,1000);assert.equal(writes[0][4].sale_price,'');
  h.state.create();h.render();h.state.setDraft({...h.state.draft,product_id:'cake',name:'Gift size',price:'1000',sale_price:'0'});h.render();await h.state.save();
  assert.equal(writes[1][4].sale_price,0);
});

test('late section responses cannot replace current rows or save a shared key into the wrong section',async()=>{
  const old=deferred(),latest=deferred(),writes:any[]=[];let contentCalls=0;
  const h=editorHarness({fetchCmsTable:async(_e:string,_t:string,table:string)=>table==='settings'?old.promise:table==='content'&&++contentCalls===1?latest.promise:snapshot(table,['key','value'],[{key:'hero_title',value:'CURRENT_CONTENT'}]),mutateCmsTable:async(...args:any[])=>writes.push(args)});
  h.render();await tick();h.render();h.state.changeTable('settings');h.render();h.state.changeTable('content');h.render();
  assert.equal(h.state.data,null,'Old rows are cleared while the next section loads.');
  latest.resolve(snapshot('content',['key','value'],[{key:'hero_title',value:'CURRENT_CONTENT'}]));await tick();h.render();
  old.resolve(snapshot('settings',['key','value'],[{key:'hero_title',value:'STALE_SETTINGS'}]));await tick();h.render();
  assert.equal(h.state.data.table,'content');assert.equal(h.state.data.rows[0].value,'CURRENT_CONTENT');
  h.state.choose(h.state.data.rows[0]);h.render();await h.state.save();
  assert.equal(writes[0][2],'content');assert.equal(writes[0][4].value,'CURRENT_CONTENT');
});

test('stale load errors and unmounted completions cannot alter the active editor',async()=>{
  const old=deferred(),latest=deferred();
  const h=editorHarness({fetchCmsTable:async(_e:string,_t:string,table:string)=>table==='settings'?old.promise:table==='content'?latest.promise:products});
  h.render();await tick();h.render();h.state.changeTable('settings');h.render();h.state.changeTable('content');h.render();
  latest.resolve(snapshot('content',['key','value'],[{key:'hero_title',value:'CURRENT'}]));await tick();h.render();old.reject(new Error('STALE FAILURE'));await tick();h.render();
  assert.equal(h.state.error,'');assert.equal(h.state.loading,false);assert.equal(h.state.data.table,'content');
  const pending=deferred();const closing=editorHarness({fetchCmsTable:()=>pending.promise});closing.render();closing.unmount();pending.resolve(products);await tick();
  closing.render();assert.equal(closing.state.data,null);
});

test('pending uploads stay on their original record and block navigation, saving and cancellation',async()=>{
  const upload=deferred(),writes:any[]=[];
  const h=editorHarness({fetchCmsTable:async()=>products,uploadCmsImage:()=>upload.promise,mutateCmsTable:async(...args:any[])=>writes.push(args)});
  h.render();await tick();h.render();h.state.choose(products.rows[0]);h.render();
  const task=h.state.uploadImage({type:'image/jpeg',size:100},'image_url');await tick();h.render();
  assert.equal(h.state.uploading,true);
  for(const label of ['Cake B','Create','Save changes','Cancel','Refresh'])assert.equal(h.button(label).props.disabled,true,label);
  assert.equal(h.section().props.disabled,true);
  h.state.choose(products.rows[1]);h.state.changeTable('settings');h.state.create();h.state.cancel();await h.state.save();h.render();
  assert.equal(h.state.selected,'product_A');assert.equal(h.state.table,'products');assert.equal(writes.length,0);
  upload.resolve('/api/image?id=uploadedForProductA123');await task;h.render();
  assert.equal(h.state.draft.image_url,'/api/image?id=uploadedForProductA123');await h.state.save();
  assert.equal(writes[0][5],'product_A');assert.equal(writes[0][4].image_url,'/api/image?id=uploadedForProductA123');
});

test('uploads and save acknowledgments from a replaced login do not overwrite the new editor scope',async()=>{
  const upload=deferred(),mutation=deferred();let loads=0;
  const h=editorHarness({fetchCmsTable:async()=>{loads++;return products;},uploadCmsImage:()=>upload.promise,mutateCmsTable:()=>mutation.promise});
  h.render();await tick();h.render();h.state.choose(products.rows[0]);h.render();const uploading=h.state.uploadImage({type:'image/jpeg',size:100},'image_url');await tick();
  h.setProps({token:'NEW_OFFLINE_LOGIN'});h.render();await tick();h.render();upload.resolve('/api/image?id=oldLoginUpload12345');await uploading;h.render();
  assert.equal(h.state.selected,'');assert.equal(h.state.draft.image_url,undefined);assert.equal(h.state.notice,'');
  h.state.choose(products.rows[1]);h.render();const saving=h.state.save();await tick();h.setProps({token:'THIRD_OFFLINE_LOGIN'});h.render();await tick();h.render();const before=loads;
  mutation.resolve({});await saving;h.render();
  assert.equal(loads,before,'The old save must not trigger a refresh with its old credentials.');assert.equal(h.state.selected,'');assert.equal(h.state.notice,'');assert.equal(h.state.saving,false);assert.equal(h.updates,0);
});

function backendHarness(){
  const ctx:any={console,PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})},Utilities:{getUuid:(()=>{let id=0;return()=>String(++id);})(),formatDate:(date:Date)=>date.toISOString().slice(0,10)},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},CacheService:{getScriptCache:()=>({remove(){}})}};
  vm.createContext(ctx);for(const name of ['Code.gs','PublicCms.gs'])vm.runInContext(fs.readFileSync(new URL('../apps-script/'+name,import.meta.url),'utf8'),ctx);
  const sheets:Record<string,any>={};
  for(const [name,headers]of Object.entries(ctx.PUBLIC_TABLE_SCHEMAS) as [string,string[]][]){
    const values:any[][]=[Array.from(headers)];
    const sheet={values,getLastRow:()=>values.length,getLastColumn:()=>headers.length,getRange:(r:number,c:number,h=1,w=1)=>({getValues:()=>Array.from({length:h},(_,y)=>Array.from({length:w},(_,x)=>values[r+y-1]?.[c+x-1]??'')),setValues:(rows:any[][])=>{rows.forEach((row,y)=>{values[r+y-1]??=[];row.forEach((value,x)=>{values[r+y-1][c+x-1]=value;});});}})};
    sheets[name]=sheet;
  }
  const book={getSheetByName:(name:string)=>sheets[name]};ctx.auroraSpreadsheet_=()=>book;ctx.auroraStaffAuthenticate_=()=>({role:'super_admin'});
  const append=(name:string,row:Record<string,unknown>)=>sheets[name].values.push(Array.from(ctx.PUBLIC_TABLE_SCHEMAS[name],(header:any)=>row[header]??''));
  append('products',{id:'cake',category_id:'category',name:'Fixture cake',is_active:true});append('categories',{id:'category',name:'Fixture category',is_active:true});
  const create=(table:string,values:Record<string,unknown>)=>ctx.auroraCmsPost_({action:'staff_cms_create',table,values});
  const last=(table:string)=>Object.fromEntries(Array.from(ctx.PUBLIC_TABLE_SCHEMAS[table],(header:any,index:number)=>[header,sheets[table].values.at(-1)[index]] as const));
  return {ctx,book,append,create,last};
}

test('server CMS creates omitted optional numeric fields blank and checkout charges the regular variant price',()=>{
  const h=backendHarness();h.create('product_variants',{product_id:'cake',name:'1kg',price:1000,weight_grams:1000,is_active:true});const variant=h.last('product_variants');
  assert.equal(variant.sale_price,'');
  h.create('coupons',{code:'FIRST',discount_type:'percentage',discount_value:10,is_active:true});assert.equal(h.last('coupons').max_discount_amount,'');
  h.create('products',{name:'Another cake',category_id:'category',base_price:1000});assert.equal(h.last('products').rating,'');assert.equal(h.last('products').sale_price,'');
  h.append('settings',{key:'accepting_orders',value:true});h.append('settings',{key:'delivery_enabled',value:true});h.append('delivery_zones',{id:'zone',name:'Fixture area',delivery_fee:0,is_active:true});h.append('delivery_slots',{id:'slot',slot_label:'Morning',is_active:true});
  const order=h.ctx.auroraBuildOrder_(h.book,{request_id:'fixture-request',delivery_date:new Date(Date.now()+86400000).toISOString().slice(0,10),delivery_zone_id:'zone',delivery_slot:'Morning',customer_name:'Offline fixture',customer_phone:'01700000000',delivery_address:'Fixture street',coupon_code:'',order_note:'',cart_items:[{product_id:'cake',variant_id:variant.id,flavor_id:'',addon_ids:[],quantity:1,writing_message:''}]});
  assert.equal(order.items[0].unit_price,1000);assert.equal(order.total_amount,1000);
  h.create('product_variants',{product_id:'cake',name:'Gift size',price:1000,sale_price:0,is_active:true});assert.equal(h.last('product_variants').sale_price,0);
});
