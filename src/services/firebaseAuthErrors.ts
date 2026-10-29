/**
 * UI-only diagnostics for Firebase Authentication.
 *
 * Do not relay Firebase error.message to end users (could include sensitive
 * details). Never reveal whether a specific email has an account: invalid
 * login and unknown-user errors share the same message.
 */
export function firebaseAuthErrorCode(error: unknown): string {
  if(!error || typeof error !== 'object')return 'unknown';
  const code=(error as {code?:unknown}).code;
  return typeof code === 'string' && /^auth\/[a-z][a-z0-9-]{1,80}$/.test(code)
    ? code : 'unknown';
}

export function firebaseStaffLoginError(
  error: unknown,
  stage: 'sdk_initialization' | 'credential_sign_in' = 'credential_sign_in'
): string {
  const code=firebaseAuthErrorCode(error);
  if(code==='unknown'){
    // Only match known Firebase registration failures. Never copy a raw
    // error.message or stack, which could contain a request or user data.
    const message=error instanceof Error?error.message:'';
    if(/Component (?:auth|firestore) has not been registered|Service (?:auth|firestore) is not available/i.test(message))
      return 'Firebase SDK registration failed before sign-in (sdk/component-registration). Refresh the latest Cloudflare build. Do not reset your account password to fix an SDK error.';
    if(stage==='sdk_initialization')
      return 'Firebase Authentication SDK could not initialize (sdk/initialization-failed). Your account settings may be correct; this is a website initialization error.';
    return 'Firebase sign-in failed before a Firebase error code was returned (sdk/unclassified-sign-in). Check the Cloudflare app and SDK initialization; your account does not need to be recreated.';
  }
  switch(code){
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-password':
      return 'Incorrect Firebase email/password, or this email does not have an Email/Password login. Use the password created in Firebase Authentication, not the old Bakery Control Center password. (auth/invalid-credential)';
    case 'auth/operation-not-allowed':
      return 'Firebase Email/Password login is disabled. In Firebase Console → Authentication → Sign-in method, enable Email/Password. (auth/operation-not-allowed)';
    case 'auth/user-disabled':
      return 'This Firebase Authentication account has been disabled. Check Authentication → Users. (auth/user-disabled)';
    case 'auth/network-request-failed':
    case 'auth/timeout':
      return 'Firebase Authentication could not be reached. Check internet, browser extensions and try again. ('+code+')';
    case 'auth/too-many-requests':
      return 'Firebase temporarily blocked repeated login attempts. Avoid repeated guesses; try again after the limit clears. (auth/too-many-requests)';
    case 'auth/invalid-api-key':
    case 'auth/app-not-authorized':
    case 'auth/unauthorized-domain':
      return 'Firebase app configuration is not authorized for this project/domain. Check Firebase app settings and authorized domains. ('+code+')';
    case 'auth/invalid-email':
      return 'Please enter a valid email address. (auth/invalid-email)';
    case 'auth/web-storage-unsupported':
    case 'auth/operation-not-supported-in-this-environment':
      return 'Firebase login needs a compatible browser with cookies/web storage available. ('+code+')';
    default:
      return 'Firebase Authentication could not sign in. Error code: '+code;
  }
}
export function firebaseStaffPasswordResetError(error: unknown): string {
  const code=firebaseAuthErrorCode(error);
  if(code==='auth/user-not-found' || code==='auth/invalid-credential' ||
     code==='auth/invalid-login-credentials')
    return 'If the Firebase Email/Password account exists, password reset instructions have been requested. Check your inbox and spam folder.';
  if(code==='auth/operation-not-allowed')
    return 'Enable Email/Password in Firebase Console → Authentication → Sign-in method before resetting passwords.';
  if(code==='auth/network-request-failed'||code==='auth/timeout')
    return 'Network error while requesting the password reset. Try again when connected.';
  if(code==='auth/too-many-requests')
    return 'Too many requests. Use the existing reset email if available, or try again after the limit clears.';
  if(code==='auth/invalid-email')
    return 'Enter a valid email address for the Firebase account.';
  return 'Could not request a Firebase password reset. Check the Firebase Auth provider settings. ('+code+')';
}
