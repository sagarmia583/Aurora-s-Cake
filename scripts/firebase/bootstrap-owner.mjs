/**
 * One-time provisioning, requires a verified Firebase Auth user already existing.
 * NEVER put service account credentials in an app, repo or EXPO_PUBLIC_*.
 * Example:
 * node scripts/firebase/bootstrap-owner.mjs owner@example.com --confirm-owner=owner@example.com
 */
import {firebaseServices} from '../../server/firebaseAdmin.mjs';
const email=String(process.argv[2]||'').trim().toLowerCase();
const confirmation='--confirm-owner='+email;
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!process.argv.includes(confirmation)){
  console.error('Usage: node scripts/firebase/bootstrap-owner.mjs OWNER_EMAIL --confirm-owner=OWNER_EMAIL');
  process.exitCode=2;
}else{
 try{
  const {auth,db}=await firebaseServices();
  const user=await auth.getUserByEmail(email);
  if(!user.emailVerified)throw Error('Verify the email in Firebase Authentication before bootstrapping.');
  const count=await db.collection('staff_accounts').limit(2).get();
  if(!count.empty)throw Error('Existing staff records detected. Refusing to overwrite or create a second Super Admin.');
  await db.collection('staff_accounts').doc(user.uid).create({
    uid:user.uid,email,name:user.displayName||'Aurora Owner',role:'super_admin',active:true,
    permissions:[],created_at:new Date().toISOString()
  });
  console.log('Verified owner initialized. UID:',user.uid);
 }catch(e){console.error('Owner setup refused:',e.message);process.exitCode=1;}
}
