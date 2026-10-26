/**
 * Same-tab Staff workspace continuity: survives page refresh but not browser
 * session ending. Staff authorization always comes from the Apps Script
 * backend; the browser token is never treated as proof of permission.
 */
export interface WorkspaceStorage {
  getItem(key:string):string|null;
  setItem(key:string,value:string):void;
  removeItem(key:string):void;
}
export const STAFF_SESSION_KEY='aurora_staff_session_v1';
export const STAFF_WORKSPACE_KEY='aurora_staff_workspace_open_v1';
export const STAFF_TAB_KEY='aurora_staff_tab_v1';
const employeeSession=/^[0-9a-f-]{72}$/i;
const googleIdToken=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
export const isStaffSessionCredential=(value:string):boolean=>
  value.length>0&&value.length<=10000&&(employeeSession.test(value)||googleIdToken.test(value));
export function getBrowserWorkspaceStorage():WorkspaceStorage|null{
  try{return typeof window!=='undefined'?window.sessionStorage:null;}catch{return null;}
}
export function loadStaffCredential(storage:WorkspaceStorage|null):string{
  if(!storage)return '';
  try{
    const token=storage.getItem(STAFF_SESSION_KEY)||'';
    if(!isStaffSessionCredential(token)){
      if(token)storage.removeItem(STAFF_SESSION_KEY);
      return '';
    }
    return token;
  }catch{return '';}
}
export function saveStaffCredential(storage:WorkspaceStorage|null,token:string):boolean{
  if(!storage||!isStaffSessionCredential(token))return false;
  try{storage.setItem(STAFF_SESSION_KEY,token);return true;}catch{return false;}
}
export function clearStaffCredential(storage:WorkspaceStorage|null):void{
  try{storage?.removeItem(STAFF_SESSION_KEY);}catch{}
}
export function isStaffWorkspaceOpen(storage:WorkspaceStorage|null):boolean{
  try{return storage?.getItem(STAFF_WORKSPACE_KEY)==='1';}catch{return false;}
}
export function setStaffWorkspaceOpen(storage:WorkspaceStorage|null,open:boolean):void{
  try{if(open)storage?.setItem(STAFF_WORKSPACE_KEY,'1');
  else storage?.removeItem(STAFF_WORKSPACE_KEY);}catch{}
}
export function loadStaffTab(storage:WorkspaceStorage|null):string{
  try{return storage?.getItem(STAFF_TAB_KEY)||'';}catch{return '';}
}
export function saveStaffTab(storage:WorkspaceStorage|null,tab:string):void{
  try{storage?.setItem(STAFF_TAB_KEY,tab);}catch{}
}
