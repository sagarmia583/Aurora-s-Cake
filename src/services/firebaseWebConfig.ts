/** Public Firebase Web App config shared by SDK diagnostics and REST Auth.
 * No Firebase SDK modules are imported here; all values are public client IDs.
 * NEVER put FIREBASE_SERVICE_ACCOUNT_JSON in a client environment.
 */
import type {FirebaseOptions} from 'firebase/app';
const env=(import.meta as ImportMeta & {env?:Record<string,string>}).env||{};
export const firebaseConfig:FirebaseOptions={
  apiKey:env.VITE_FIREBASE_API_KEY||'AIzaSyCNVQv0iH6fAvzG5WxAX6om5yQGizrgxug',
  authDomain:env.VITE_FIREBASE_AUTH_DOMAIN||'aurorascake-213a0.firebaseapp.com',
  projectId:env.VITE_FIREBASE_PROJECT_ID||'aurorascake-213a0',
  storageBucket:env.VITE_FIREBASE_STORAGE_BUCKET||'aurorascake-213a0.firebasestorage.app',
  messagingSenderId:env.VITE_FIREBASE_MESSAGING_SENDER_ID||'102515276771',
  appId:env.VITE_FIREBASE_APP_ID||'1:102515276771:web:d06431a890c12808f8fed6',
  measurementId:env.VITE_FIREBASE_MEASUREMENT_ID||'G-WRX6GNLXK4',
};
