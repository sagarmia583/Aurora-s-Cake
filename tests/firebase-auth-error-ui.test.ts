import assert from 'node:assert/strict';
import test from 'node:test';
import {
  firebaseAuthErrorCode, firebaseStaffLoginError, firebaseStaffPasswordResetError
} from '../src/services/firebaseAuthErrors';

const err=(code:string)=>({code,message:'DO_NOT_EXPOSE_FIREBASE_INTERNAL_MESSAGE'});
test('Firebase sign in provider-disabled reports actionable configuration error',()=>{
  const msg=firebaseStaffLoginError(err('auth/operation-not-allowed'));
  assert.match(msg,/enable Email\/Password/);
  assert.match(msg,/auth\/operation-not-allowed/);
});
test('Wrong password, unknown user and invalid credentials are indistinguishable',()=>{
  const result=['auth/invalid-credential','auth/wrong-password',
    'auth/user-not-found','auth/invalid-login-credentials'].map(code=>firebaseStaffLoginError(err(code)));
  assert.equal(new Set(result).size,1);
  assert.match(result[0],/old Bakery Control Center password/);
});
test('Noncredential failure codes are shown but raw error messages are never copied',()=>{
  for(const code of ['auth/network-request-failed','auth/too-many-requests',
    'auth/invalid-api-key','auth/user-disabled','auth/web-storage-unsupported']){
    const message=firebaseStaffLoginError(err(code));
    assert.match(message,new RegExp(code));
    assert.equal(message.includes('DO_NOT_EXPOSE'),false);
  }
  assert.equal(firebaseAuthErrorCode({code:'auth/private_key=top_secret'}),'unknown');
  assert.equal(firebaseAuthErrorCode({code:'firebase/custom'}),'unknown');
  assert.equal(firebaseStaffLoginError({code:'auth/custom',message:'PRIVATE'}).includes('PRIVATE'),false);
});
test('Password reset error response does not expose whether an account exists',()=>{
  assert.match(firebaseStaffPasswordResetError(err('auth/operation-not-allowed')),/Enable Email\/Password/);
  assert.equal(firebaseStaffPasswordResetError(err('auth/user-not-found')).includes('user-not-found'),false);
  assert.equal(firebaseStaffPasswordResetError(err('auth/user-not-found')).includes('DO_NOT_EXPOSE'),false);
});
