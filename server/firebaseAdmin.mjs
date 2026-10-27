/**
 * Private Firebase Admin initialization. Never import from src/ or mobile code.
 * Vercel server-only env: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL,
 * FIREBASE_PRIVATE_KEY (with literal \n allowed). Never VITE_* / EXPO_PUBLIC_*.
 */
let instance=null;
export function firebaseConfigured(env=process.env){
  return Boolean(env.FIREBASE_PROJECT_ID&&env.FIREBASE_CLIENT_EMAIL&&env.FIREBASE_PRIVATE_KEY);
}
export async function firebaseServices(){
  if(instance)return instance;
  if(!firebaseConfigured())throw new Error('Firebase server credentials not configured.');
  const projectId=process.env.FIREBASE_PROJECT_ID;
  if(!/^[a-z][a-z0-9-]{4,50}$/.test(projectId))throw new Error('Invalid Firebase project ID.');
  const clientEmail=process.env.FIREBASE_CLIENT_EMAIL;
  if(!/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(clientEmail))
    throw new Error('Invalid Firebase service account.');
  const privateKey=process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g,'\n');
  if(!privateKey.startsWith('-----BEGIN PRIVATE KEY-----'))throw new Error('Invalid Firebase private key.');
  const [{getApps,initializeApp,cert},{getFirestore},{getAuth}]=await Promise.all([
    import('firebase-admin/app'),import('firebase-admin/firestore'),import('firebase-admin/auth')]);
  const app=getApps().find(a=>a.name==='aurora-firebase')||
    initializeApp({credential:cert({projectId,clientEmail,privateKey}),projectId},'aurora-firebase');
  instance={db:getFirestore(app),auth:getAuth(app),app};
  return instance;
}
