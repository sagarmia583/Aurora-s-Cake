/**
 * One shared, owner-approved API for both websites.
 * GitHub Pages is a static frontend. Netlify Functions are the server,
 * and Google Apps Script + the original Google Sheet are the only database.
 * The Pages build stays read-only until the verified Netlify production
 * origin is configured in GitHub Actions Variables.
 */
export const SHARED_NETLIFY_PRODUCTION_ORIGIN='https://aurorascake.netlify.app';

export function getSharedBakeryApiOrigin():string|null{
  const env=(import.meta as ImportMeta & {env?:{
    VITE_GITHUB_PAGES_READ_ONLY?:string;
    VITE_SHARED_BAKERY_API_ORIGIN?:string;
  }}).env;
  if(env?.VITE_GITHUB_PAGES_READ_ONLY!=='true')return null;
  const raw=env.VITE_SHARED_BAKERY_API_ORIGIN?.trim()||'';
  if(!raw)return null;
  try{
    const value=new URL(raw);
    if(value.origin!==SHARED_NETLIFY_PRODUCTION_ORIGIN ||
      value.href!==value.origin && value.href!==value.origin+'/'||
      value.username||value.password||value.search||value.hash||value.port)
      return null;
    return value.origin;
  }catch{return null;}
}

export function isGitHubPagesReadOnly():boolean{
  const env=(import.meta as ImportMeta & {env?:{VITE_GITHUB_PAGES_READ_ONLY?:string}}).env;
  return env?.VITE_GITHUB_PAGES_READ_ONLY==='true' && !getSharedBakeryApiOrigin();
}

export function getSharedBakeryApiUrl(path:'/api/public'|'/api/operations'|'/api/backend-health'|'/api/image'):string|null{
  const origin=getSharedBakeryApiOrigin();
  return origin?origin+path:null;
}
