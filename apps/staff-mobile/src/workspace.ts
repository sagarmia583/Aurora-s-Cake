import {validateStaffOperationsUrl} from './domain';

export const NATIVE_SESSION_KEY='aurora_staff_workspace_session_v1';
export function isStaffCredential(value:unknown):value is string {
  return typeof value==='string' && value.length<=10000 &&
    (/^[a-f0-9-]{72}$/i.test(value)||/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value));
}
export function staffWorkspaceUrl(endpoint:string,override?:string,development=false):string {
  const origin=new URL(validateStaffOperationsUrl(endpoint)).origin;
  const url=new URL(override||origin);
  const local=/^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(url.hostname);
  if(url.username||url.password||url.pathname!=='/'||
    !(url.origin===origin&&url.protocol==='https:' || development&&local&&url.protocol==='http:'&&url.port==='3000'))
    throw new Error('Staff workspace must use the bakery website. Local development requires port 3000.');
  url.search='';url.hash='';url.searchParams.set('staff','1');url.searchParams.set('native','1');
  return url.href;
}
export function isWorkspaceNavigation(url:string,workspace:string):boolean {
  try { const next=new URL(url);return next.origin===new URL(workspace).origin &&
    ['http:','https:'].includes(next.protocol)&&!next.username&&!next.password; } catch {return false;}
}
export function restoredWorkspaceToken(raw:string|null,origin:string):string {
  try {const saved=JSON.parse(raw||'null');return saved?.origin===origin&&isStaffCredential(saved.token)?saved.token:'';}catch{return '';}
}
export function nativeWorkspaceScript(token:string):string {
  return `(function(){
    ${isStaffCredential(token)?`sessionStorage.setItem('aurora_staff_session_v1',${JSON.stringify(token)});`:''}
    window.print=function(){
      var copy=document.documentElement.cloneNode(true);
      copy.querySelectorAll('script,iframe,input[type=password]').forEach(function(el){el.remove();});
      var base=document.createElement('base');base.href=location.origin+'/';copy.querySelector('head').prepend(base);
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'print',html:'<!doctype html>'+copy.outerHTML}));
    };
    window.addEventListener('aurora-native-refresh',function(){window.dispatchEvent(new Event('focus'));});
    true;
  })();true;`;
}
