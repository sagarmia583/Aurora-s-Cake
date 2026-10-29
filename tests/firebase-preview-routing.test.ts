import test from 'node:test';
import assert from 'node:assert/strict';
import {isCloudflarePreviewHostname,isFirebaseStaffPreviewRoute} from '../src/services/firebasePreviewRouting';

test('Cloudflare Workers production host opens the Firebase Staff Preview for the explicit query flag',()=>{
  const host='aurora-s-cake.sagarmia583.workers.dev';
  assert.equal(isCloudflarePreviewHostname(host),true);
  assert.equal(isFirebaseStaffPreviewRoute(host,'?firebase_staff_preview=1&utm_source=chatgpt.com'),true);
  assert.equal(isFirebaseStaffPreviewRoute(host,'?firebase_staff_preview=0'),false);
  assert.equal(isFirebaseStaffPreviewRoute(host,''),false);
});
test('Pages test site is supported without enabling Vercel or Netlify',()=>{
  assert.equal(isFirebaseStaffPreviewRoute('aurora.pages.dev','?firebase_staff_preview=1'),true);
  assert.equal(isFirebaseStaffPreviewRoute('aurora.vercel.app','?firebase_staff_preview=1'),false);
  assert.equal(isFirebaseStaffPreviewRoute('aurora.netlify.app','?firebase_staff_preview=1'),false);
});
test('Host suffix matching cannot be spoofed using misleading hostnames',()=>{
  for(const hostname of ['workers.dev.evil.example','fakeworkers.dev','example.com','WORKERS.dev.evil',
    'bad-pages.dev','localhost','aurora.com']){
    assert.equal(isFirebaseStaffPreviewRoute(hostname,'?firebase_staff_preview=1'),false,hostname);
  }
  assert.equal(isFirebaseStaffPreviewRoute('AURORA-S-CAKE.SAGARMIA583.WORKERS.DEV','?firebase_staff_preview=1'),true);
});
