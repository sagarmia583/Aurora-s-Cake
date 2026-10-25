/**
 * Vercel Hobby/Free same-origin bridge to the existing private Google Apps
 * Script POST relay. Keeps frontend and API under one origin; never forward
 * unvalidated client-selected destinations or expose Google OAuth secrets.
 *
 * Set server-only AURORA_SCRIPT_POST_URL to the deployed Apps Script /exec URL.
 * Set VITE_SHEETS_POST_PROXY=/api/operations for the Vite frontend.
 */
import relay from '../netlify/functions/operations.mjs';

const MAX_REQUEST_BYTES = 950000;
const fail=(res, status, message)=>{
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.end(JSON.stringify({ok:false,success:false,code:'proxy_error',error:message}));
};

export default async function handler(req,res) {
  if(req.method!=='POST') return fail(res,405,'POST is required.');
  const host=typeof req.headers?.host==='string'?req.headers.host:'';
  if(!/^[a-z0-9][a-z0-9.-]*(?::[0-9]{1,5})?$/i.test(host)) return fail(res,400,'Invalid request host.');
  const headerLength=Number(req.headers['content-length']||0);
  if(!Number.isFinite(headerLength)||headerLength>MAX_REQUEST_BYTES) return fail(res,413,'Request too large.');
  let body;
  if(typeof req.body==='string') body=req.body;
  else if(Buffer.isBuffer(req.body)) body=req.body.toString('utf8');
  else if(req.body&&typeof req.body==='object') body=JSON.stringify(req.body);
  else {
    const chunks=[];let size=0;
    for await(const chunk of req){
      const value=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
      size+=value.length;
      if(size>MAX_REQUEST_BYTES) return fail(res,413,'Request too large.');
      chunks.push(value);
    }
    body=Buffer.concat(chunks).toString('utf8');
  }
  if(!body||Buffer.byteLength(body,'utf8')>MAX_REQUEST_BYTES) return fail(res,413,'Request too large.');
  const headers=new Headers();
  for(const key of ['origin','content-type','content-length']){
    const value=req.headers?.[key];
    if(typeof value==='string')headers.set(key,value);
  }
  // The client already used HTTPS on Vercel; the origin check is intentionally
  // restricted to the deployed Host, rather than trusting X-Forwarded-*.
  const request=new Request('https://'+host+'/api/operations',{
    method:'POST',headers,body
  });
  try{
    const reply=await relay(request);
    res.statusCode=reply.status;
    for(const key of ['content-type','cache-control','x-content-type-options','referrer-policy']){
      const value=reply.headers.get(key);
      if(value)res.setHeader(key,value);
    }
    res.end(await reply.text());
  }catch{
    return fail(res,502,'Bakery operations are unavailable. Retry the same request reference.');
  }
}
