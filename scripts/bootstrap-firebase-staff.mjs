#!/usr/bin/env node
/**
 * Privileged local provisioning of Firebase staff roles (no public signup).
 *
 * npm ci
 * node scripts/bootstrap-firebase-staff.mjs --uid FIREBASE_AUTH_UID --email owner@example.com \
 *   --key "/private/firebase-service-account.json"
 * # Dry-run above. Once UID and email match an existing verified Auth user:
 * node scripts/bootstrap-firebase-staff.mjs --uid ... --email ... \
 *   --key "/private/firebase-service-account.json" --write
 *
 * Only use locally on your trusted machine. Never publish the service key.
 */
import {readFile} from 'node:fs/promises';
import {getGoogleAccessToken} from '../api/lib/firestoreOrderMirror.js';

const PROJECT_ID='aurorascake-213a0';
const ROLES=new Set(['super_admin','admin','order_manager','kitchen_manager','delivery_manager','delivery_man','accountant']);
const option=(name)=>{const idx=process.argv.indexOf(name);return idx>=0?process.argv[idx+1]||'':null};
const uid=option('--uid'), email=option('--email')?.trim().toLowerCase(),name=option('--name')?.trim()||'Aurora Owner';
const role=option('--role')||'super_admin',keyPath=option('--key')||process.env.GOOGLE_APPLICATION_CREDENTIALS;
const write=process.argv.includes('--write');
async function run(){
  if(!uid||!/^[A-Za-z0-9_-]{1,128}$/.test(uid)||!email||!/^\S+@\S+\.\S+$/.test(email)||
     !ROLES.has(role)||!keyPath||name.length>120)
    throw new Error('Usage: --uid FIREBASE_AUTH_UID --email VERIFIED_EMAIL --key PRIVATE_JSON [--role super_admin] [--write]');
  console.log('Firebase staff role:',{uid,email,role,active:true,write});
  if(!write){
    console.log('Dry run only. Verify this UID and email in Firebase Authentication → Users first.');
    return;
  }
  const secret=await readFile(keyPath,'utf8');
  const env={FIREBASE_MIRROR_ENABLED:'true',FIREBASE_SERVICE_ACCOUNT_JSON:secret};
  const access=await getGoogleAccessToken(fetch,env);
  const url='https://firestore.googleapis.com/v1/projects/'+PROJECT_ID+
    '/databases/(default)/documents/staff_roles/'+encodeURIComponent(uid);
  const preflight=await fetch(url,{headers:{Authorization:'Bearer '+access}});
  if(preflight.ok)throw new Error('Staff role already exists. Refusing to overwrite an existing role.');
  if(preflight.status!==404)throw new Error('Staff role preflight failed: HTTP '+preflight.status);
  const fields={
    role:{stringValue:role},email:{stringValue:email},name:{stringValue:name},
    active:{booleanValue:true},created_at:{timestampValue:new Date().toISOString()},
  };
  const response=await fetch(url+'?currentDocument.exists=false',{
    method:'PATCH',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},
    body:JSON.stringify({fields})
  });
  if(!response.ok)throw new Error('Staff role provision rejected: HTTP '+response.status);
  console.log('Provisioned private staff_roles/'+uid+'. No Firestore Rules opened.');
}
run().catch(error=>{console.error(error instanceof Error?error.message:'Provisioning failed');process.exitCode=1;});
