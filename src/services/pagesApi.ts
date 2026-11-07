/**
 * Optional secure Cloudflare Worker API for the static GitHub Pages build.
 * Invalid or absent configuration fails CLOSED: no direct browser POST to
 * Google Apps Script, preventing uncertain duplicate order submissions.
 * Only the dedicated Aurora API Worker hostname is accepted.
 */
export function getPagesApiOrigin(): string | null {
  const env=(import.meta as ImportMeta & {env?:{
    VITE_GITHUB_PAGES_READ_ONLY?:string;
    VITE_GITHUB_PAGES_API_ORIGIN?:string;
  }}).env;
  if(env?.VITE_GITHUB_PAGES_READ_ONLY!=='true')return null;
  const raw=env.VITE_GITHUB_PAGES_API_ORIGIN?.trim()||'';
  if(!raw)return null;
  try{
    const url=new URL(raw);
    if(url.protocol!=='https:'||!/^aurora-gh-pages-api\.[a-z0-9-]+\.workers\.dev$/i.test(url.hostname)||
      url.username||url.password||url.pathname!=='/'||url.search||url.hash||url.port)
      return null;
    return url.origin;
  }catch{return null;}
}
export function isPagesApiUnavailable(): boolean {
  const env=(import.meta as ImportMeta & {env?:{VITE_GITHUB_PAGES_READ_ONLY?:string}}).env;
  return env?.VITE_GITHUB_PAGES_READ_ONLY==='true' && !getPagesApiOrigin();
}
