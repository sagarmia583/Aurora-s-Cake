import publicCatalog from '../netlify/functions/public.mjs';
import publicImage from '../netlify/functions/image.mjs';
import operations from '../netlify/functions/operations.mjs';
import health from '../netlify/functions/backend-health.mjs';
/** Local Vite preview uses the exact Netlify API handlers, never another hosting provider. */
export function bakeryApi(scriptEndpoint){
 const routes={'/api/public':publicCatalog,'/api/image':publicImage,'/api/operations':operations,'/api/backend-health':health};
 return {name:'aurora-local-netlify-sheets',configureServer(server){
  server.middlewares.use(async(req,res,next)=>{
   const url=new URL(req.url||'/', 'http://'+(req.headers.host||'localhost:3000'));
   const handler=routes[url.pathname];
   if(!handler){if(url.pathname.startsWith('/api/')){res.statusCode=404;res.setHeader('Content-Type','application/json');res.end('{"ok":false}');}else next();return;}
   try{
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>950000){res.statusCode=413;res.end('{"ok":false}');return;}chunks.push(chunk);}
    const body=Buffer.concat(chunks);
    const request=new Request(url,{method:req.method,headers:req.headers,...(body.length?{body}:{} )});
    const response=await handler(request,{scriptUrl:scriptEndpoint});
    res.statusCode=response.status;response.headers.forEach((v,k)=>res.setHeader(k,v));
    res.end(Buffer.from(await response.arrayBuffer()));
   }catch{res.statusCode=502;res.setHeader('Content-Type','application/json');res.end('{"ok":false,"error":"Netlify preview could not reach Google Sheets."}');}
  });
 }};
}
