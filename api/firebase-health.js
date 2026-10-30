/** Safe availability check: never reveals Firebase credentials or user records. */
import {firebaseConfigured} from '../server/firebaseAdmin.mjs';
export default function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='GET'){res.statusCode=405;return res.end(JSON.stringify({ok:false,error:'GET required'}));}
  res.statusCode=200;
  return res.end(JSON.stringify({ok:true,backend:'firestore',configured:firebaseConfigured(),
    state:'staging',primary:'google_sheets_until_cutover'}));
}
