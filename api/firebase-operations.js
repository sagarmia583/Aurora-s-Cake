import {firebaseServices} from '../server/firebaseAdmin.mjs';
import {authenticateStaff,cleanUser,requirePermission} from '../server/firebaseAccess.mjs';
import {posCatalog,createPosSale} from '../server/firebasePos.mjs';
const allow=new Set(['staff_session','staff_orders','staff_pos_catalog','staff_pos_create','staff_pos_history']);
const response=(res,status,data)=>{
  res.statusCode=status;res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.end(JSON.stringify(data));
};
export default async function handler(req,res){
  if(req.method!=='POST')return response(res,405,{ok:false,code:'method',error:'POST required.'});
  if(process.env.AURORA_FIREBASE_MODE!=='staging'&&process.env.AURORA_FIREBASE_MODE!=='enabled')
    return response(res,503,{ok:false,code:'firebase_disabled',error:'Firestore backend not activated.'});
  const origin=req.headers?.origin;
  const host=req.headers?.host;
  if(origin){
    try{if(new URL(origin).host!==host||new URL(origin).protocol!=='https:')
      return response(res,403,{ok:false,code:'forbidden',error:'Invalid origin.'});}
    catch{return response(res,403,{ok:false,code:'forbidden',error:'Invalid origin.'});}
  }
  let raw;
  try{
    if(typeof req.body==='string')raw=req.body;
    else if(req.body&&typeof req.body==='object')raw=JSON.stringify(req.body);
    else{let size=0,chunks=[];for await(const c of req){
      size+=c.length;if(size>50000)return response(res,413,{ok:false,error:'Request too large.'});chunks.push(c);
    }raw=Buffer.concat(chunks).toString('utf8');}
    if(!raw||Buffer.byteLength(raw)>50000)return response(res,413,{ok:false,error:'Request too large.'});
    const input=JSON.parse(raw);
    if(!input||typeof input!=='object'||Array.isArray(input)||!allow.has(input.action))
      return response(res,400,{ok:false,code:'invalid_action',error:'Unsupported Firebase operation.'});
    const {db,auth}=await firebaseServices();
    const actor=await authenticateStaff(auth,db,input.id_token);
    if(input.action==='staff_session')return response(res,200,{ok:true,...cleanUser(actor)});
    if(input.action==='staff_orders'){
      requirePermission(actor,'orders_view');
      // Client receives no private receipt access tokens, passwords or OTPs.
      let query=db.collection('orders');
      if(actor.role==='delivery_man')query=query.where('rider_id','==',actor.uid);
      const docs=await query.limit(100).get();
      const fields=['id','order_number','status','customer_name','customer_phone','delivery_address',
        'order_note','created_at','updated_at','delivery_date','delivery_slot','rider_id','rider_name',
        'payment_method','payment_status','total_amount','cod_amount','cod_collected','items'];
      const orders=docs.docs.map(d=>{
        const saved=d.data(),safe={};
        fields.forEach(k=>{if(saved[k]!==undefined)safe[k]=saved[k]});
        safe.id=d.id;return safe;
      });
      return response(res,200,{ok:true,orders,snapshot_complete:true,snapshot_at:new Date().toISOString()});
    }
    if(input.action==='staff_pos_catalog')return response(res,200,await posCatalog(db,actor));
    if(input.action==='staff_pos_history')return response(res,200,await posCatalog(db,actor,{history:true}));
    if(input.action==='staff_pos_create')return response(res,200,await createPosSale(db,actor,input));
    return response(res,400,{ok:false,code:'invalid_action',error:'Unknown action.'});
  }catch(error){
    // Do not print secrets, full Firebase exceptions or stack traces in HTTP responses.
    const status=error.httpStatus||(/Invalid JSON/.test(error.message||'')?400:503);
    const visible=error.code?error.message:status===503?'Firebase backend unavailable. Do not duplicate a checkout.':'Invalid request.';
    return response(res,status,{ok:false,code:error.code||'firebase_unavailable',error:visible});
  }
}
