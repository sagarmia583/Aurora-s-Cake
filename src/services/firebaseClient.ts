/**
 * Aurora's Cake Firebase Web SDK bootstrap.
 *
 * Uses the official npm modular SDK with the public Firebase web app settings
 * registered for this project. It is intentionally read-only until identity,
 * Firestore rules, order migration and dual-write correctness are verified.
 * Firebase config identifiers are public; never put an Admin SDK credential here.
 */
import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore, type Firestore } from 'firebase/firestore';

export interface FirebaseConnectionResult {
  ok: boolean;
  message: string;
  healthDocumentExists?: boolean;
}

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  checkConnection: () => Promise<FirebaseConnectionResult>;
}

const appName = 'auroras-cake';
/**
 * Public web configuration transcribed from Firebase Console on 2026-10-27.
 * Environment values can override it to switch to another Firebase project.
 */
export const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCNVQv0iH6fAvzG5WxAX6om5yQGizrgxug',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'aurorascake-213a0.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'aurorascake-213a0',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'aurorascake-213a0.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '102515276771',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:102515276771:web:d06431a890c12808f8fed6',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-WRX6GNLXK4',
};

export const isFirebaseEnabled = import.meta.env.VITE_FIREBASE_ENABLED !== 'false';

export function getFirebaseConfigurationStatus(): {
  enabled: boolean;
  configured: boolean;
  missing: string[];
} {
  const required = ['apiKey', 'authDomain', 'projectId', 'appId'] as const;
  const missing = required.filter(key => !firebaseConfig[key]?.trim());
  return { enabled: isFirebaseEnabled, configured: missing.length === 0, missing };
}

let servicesPromise: Promise<FirebaseServices> | null = null;

/**
 * Initializes the Firebase SDK, but does not change existing checkout,
 * staff session, Supabase or Apps Script backends.
 */
export function getFirebaseServices(): Promise<FirebaseServices> {
  if (!isFirebaseEnabled) {
    return Promise.reject(new Error('Firebase is disabled (VITE_FIREBASE_ENABLED=false).'));
  }
  const status = getFirebaseConfigurationStatus();
  if (!status.configured) {
    return Promise.reject(new Error('Missing Firebase config: ' + status.missing.join(', ')));
  }
  if (!servicesPromise) {
    servicesPromise = Promise.resolve().then(() => {
      const app = getApps().find(item => item.name === appName)
        || initializeApp(firebaseConfig, appName);
      const auth = getAuth(app);
      const db = getFirestore(app);
      return {
        app,
        auth,
        db,
        async checkConnection(): Promise<FirebaseConnectionResult> {
          try {
            // A server read verifies network access and security rules.
            // A missing public/health document is acceptable.
            const snapshot = await getDocFromServer(doc(db, 'public', 'health'));
            return {
              ok: true,
              message: 'Firestore server reachable; public health read permitted.',
              healthDocumentExists: snapshot.exists(),
            };
          } catch (error) {
            return {
              ok: false,
              message: error instanceof Error ? error.message : 'Firestore connectivity check failed.',
            };
          }
        },
      };
    }).catch(error => {
      servicesPromise = null;
      throw error;
    });
  }
  return servicesPromise;
}
