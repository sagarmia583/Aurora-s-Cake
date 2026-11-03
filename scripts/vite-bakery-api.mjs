import {onRequest as publicData} from '../functions/api/public.js';
import {onRequest as image} from '../functions/api/image.js';
import {onRequest as operations} from '../functions/api/operations.js';
import {onRequest as health} from '../functions/api/backend-health.js';
import {storefrontSeo} from '../cloudflare/storefrontSeo.js';
import {readFile} from 'node:fs/promises';

/** Use the production validators locally; no CORS redirects or browser secrets. */
export function bakeryApi(scriptEndpoint) {
  const routes = {'/api/public':publicData,'/api/image':image,'/api/operations':operations,
    '/api/backend-health':health};
  return {name:'aurora-local-bakery-api',configureServer(server) {
    server.middlewares.use(async(req,res,next)=>{
      const url=new URL(req.url||'/', 'http://'+(req.headers.host||'localhost:3000'));
      const handler=routes[url.pathname];
      if(!handler&&(url.pathname==='/sitemap.xml'||url.pathname.startsWith('/cake/'))&&['GET','HEAD'].includes(req.method)){
        const env={AURORA_SCRIPT_POST_URL:scriptEndpoint};
        const asset=async path=>{
          const file=path==='/'?'index.html':'public/sitemap.xml';
          const source=await readFile(new URL('../'+file,import.meta.url),'utf8');
          return path==='/' ? new Response(await server.transformIndexHtml(url.pathname,source),{headers:{'Content-Type':'text/html; charset=utf-8'}}) :
            new Response(source,{headers:{'Content-Type':'application/xml; charset=utf-8'}});
        };
        try{
          const response=await storefrontSeo({request:new Request(url,{method:req.method}),env,asset});
          if(response){
            res.statusCode=response.status;
            response.headers.forEach((value,name)=>res.setHeader(name,value));
            res.end(req.method==='HEAD'?undefined:Buffer.from(await response.arrayBuffer()));
            return;
          }
        }catch{ /* Vite's HTML/static fallback keeps previews reachable. */ }
      }
      if(!handler) { if(url.pathname.startsWith('/api/')) {res.statusCode=404;res.end('{"ok":false}');} else next(); return; }
      try {
        const chunks=[]; let size=0;
        for await(const chunk of req) {
          size+=chunk.length;
          if(size>950000){res.statusCode=413;res.end('{"ok":false,"error":"Request too large."}');return;}
          chunks.push(chunk);
        }
        const body=Buffer.concat(chunks);
        const request=new Request(url,{method:req.method,headers:req.headers,
          ...(body.length?{body}:{} )});
        const response=await handler({request,env:{AURORA_SCRIPT_POST_URL:scriptEndpoint}});
        res.statusCode=response.status;
        response.headers.forEach((value,name)=>res.setHeader(name,value));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch {
        res.statusCode=502;res.setHeader('Content-Type','application/json');
        res.end('{"ok":false,"error":"Local bakery API could not reach Google Sheets."}');
      }
    });
  }};
}
