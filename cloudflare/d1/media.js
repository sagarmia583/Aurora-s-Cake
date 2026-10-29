import {json} from '../shared.js';
import {authorizedD1Staff} from './access.js';
const AUTH=new Set(['super_admin','admin','manager']);
const maxBytes=5*1024*1024;
const types=new Map([
 ['image/jpeg',{extension:'jpg',signature:b=>b[0]===0xff&&b[1]===0xd8&&b[2]===0xff}],
 ['image/png',{extension:'png',signature:b=>b.slice(0,8).join(',')==='137,80,78,71,13,10,26,10'}],
 ['image/webp',{extension:'webp',signature:b=>String.fromCharCode(...b.slice(0,4))==='RIFF'&&
    String.fromCharCode(...b.slice(8,12))==='WEBP'}],
]);
const fail=(code,status=503)=>json(status,{ok:false,code});
export async function d1MediaHandler({request,env},{staffVerifier=authorizedD1Staff}={}){
  if(env?.D1_PREVIEW_ENABLED!=='true')return fail('d1_preview_disabled');
  if(!env?.AURORA_DB||!env?.AURORA_MEDIA)return fail('d1_or_r2_binding_missing');
  const path=new URL(request.url).pathname;
  const db=env.AURORA_DB,bucket=env.AURORA_MEDIA;
  if(request.method==='GET'){
    const match=/^\/api\/d1\/media\/([0-9a-f-]{36})$/.exec(path);
    if(!match)return fail('media_not_found',404);
    try{
      const record=await db.prepare(`SELECT r2_key,mime_type FROM media_objects
        WHERE id=? AND public=1 AND kind IN ('product','banner')`)
        .bind(match[1]).first();
      if(!record)return fail('media_not_found',404);
      const object=await bucket.get(record.r2_key);
      if(!object)return fail('media_not_found',404);
      const bytes=await object.arrayBuffer();
      return new Response(bytes,{status:200,headers:{
        'Content-Type':record.mime_type,
        'Cache-Control':'public,max-age=3600','X-Content-Type-Options':'nosniff',
        'Content-Security-Policy':"default-src 'none'; sandbox",
      }});
    }catch{return fail('media_unavailable');}
  }
  if(request.method!=='POST'||path!=='/api/d1/admin/media')
    return fail('method_not_allowed',405);
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)
    return fail('origin_not_allowed',403);
  const staff=await staffVerifier(request,env).catch(()=>null);
  if(!staff)return fail('cloudflare_access_required',401);
  if(!AUTH.has(staff.role))return fail('not_authorized',403);
  if(env?.D1_MUTATIONS_ENABLED!=='true')return fail('d1_mutations_disabled');
  const mime=request.headers.get('content-type')?.split(';')[0].toLowerCase();
  const definition=types.get(mime),kind=request.headers.get('x-aurora-image-kind');
  if(!definition||!new Set(['product','banner','receipt','delivery_proof']).has(kind))
    return fail('invalid_image_type',415);
  if(['receipt','delivery_proof'].includes(kind)&&staff.role!=='super_admin'&&staff.role!=='admin')
    return fail('not_authorized',403);
  const contentLength=Number(request.headers.get('content-length')||0);
  if(!contentLength||contentLength>maxBytes)return fail('invalid_image_size',413);
  let bytes;
  try{bytes=new Uint8Array(await request.arrayBuffer());}catch{return fail('invalid_image',400);}
  if(bytes.byteLength<12||bytes.byteLength>maxBytes||!definition.signature(bytes))
    return fail('invalid_image_binary',415);
  const mediaId=crypto.randomUUID(),key=kind+'/'+mediaId+'.'+definition.extension;
  const isPublic=['product','banner'].includes(kind)?1:0;
  try{
    await bucket.put(key,bytes,{httpMetadata:{contentType:mime}});
    await db.prepare(`INSERT INTO media_objects
      (id,r2_key,kind,mime_type,size_bytes,public,uploaded_by)
      VALUES (?,?,?,?,?,?,?)`).bind(mediaId,key,kind,mime,bytes.byteLength,isPublic,staff.id).run();
    return json(201,{ok:true,id:mediaId,public:Boolean(isPublic),
      ...(isPublic?{url:'/api/d1/media/'+mediaId}:{})});
  }catch{
    // Don't leave unreferenced R2 content behind after a failed D1 insert.
    await bucket.delete(key).catch(()=>{});
    return fail('media_storage_unavailable');
  }
}
