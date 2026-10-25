/**
 * Serve only Aurora's Cake images from the Apps Script-managed private folder.
 * This endpoint never accepts a client-selected URL and does not forward cookies.
 */
const VALID_SCRIPT=/^\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/;
const respond=(res,status,message)=>{
  res.statusCode=status;
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.end(JSON.stringify({ok:false,error:message}));
};
export default async function handler(req,res){
  if(req.method!=='GET'&&req.method!=='HEAD')return respond(res,405,'GET required.');
  const imageId=typeof req.query?.id==='string'?req.query.id:'';
  if(!/^[a-zA-Z0-9_-]{12,150}$/.test(imageId))return respond(res,404,'Image not found.');
  let backend;
  try{backend=new URL(process.env.AURORA_SCRIPT_POST_URL||'');}
  catch{return respond(res,503,'Image backend is not configured.');}
  if(backend.protocol!=='https:'||backend.hostname!=='script.google.com'||!VALID_SCRIPT.test(backend.pathname)||
    backend.username||backend.password||backend.search||backend.hash)return respond(res,503,'Invalid image backend configuration.');
  backend.searchParams.set('action','public_image');
  backend.searchParams.set('id',imageId);
  const control=new AbortController(),timeout=setTimeout(()=>control.abort(),18000);
  try{
    const upstream=await fetch(backend.toString(),{redirect:'follow',signal:control.signal});
    if(!upstream.ok||!['script.googleusercontent.com','script.google.com'].includes(new URL(upstream.url).hostname))
      return respond(res,502,'Image upstream failed.');
    const data=await upstream.json();
    if(!data||data.ok!==true||typeof data.base64!=='string'||data.base64.length>900000||
      !['image/jpeg','image/png','image/webp'].includes(data.mime_type))
      return respond(res,404,'Image is unavailable.');
    const bytes=Buffer.from(data.base64,'base64');
    if(bytes.length===0||bytes.length>650000)return respond(res,502,'Image exceeds allowed size.');
    const jpeg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
    if(!((data.mime_type==='image/jpeg'&&jpeg)||(data.mime_type==='image/png'&&png)||(data.mime_type==='image/webp'&&webp)))
      return respond(res,502,'Invalid image content.');
    res.statusCode=200;
    res.setHeader('Content-Type',data.mime_type);
    res.setHeader('Content-Length',String(bytes.length));
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cache-Control','public,max-age=3600,s-maxage=604800,stale-while-revalidate=86400');
    res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
    res.end(req.method==='HEAD'?undefined:bytes);
  }catch{return respond(res,502,'Image is temporarily unavailable.');}
  finally{clearTimeout(timeout);}
}