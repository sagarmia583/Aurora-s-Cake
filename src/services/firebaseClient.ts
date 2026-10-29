/**
 * Aurora's Cake Firebase Web SDK bootstrap.
 *
 * Uses the official npm modular SDK with the public Firebase web app settings
 * registered for this project. It is intentionally read-only until identity,
 * Firestore rules, order migration and dual-write correctness are verified.
 * Firebase config identifiers are public; never put an Admin SDK credential here.
 */
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {firebaseConfig} from './firebaseWebConfig';
export {firebaseConfig} from './firebaseWebConfig';
import type { Auth } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore, type Firestore } from 'firebase/firestore';

export interface FirebaseConnectionResult {
  ok: boolean;
  message: string;
  healthDocumentExists?: boolean;
}

export interface FirebaseServices {
  app: FirebaseApp;
  db: Firestore;
  checkConnection: () => Promise<FirebaseConnectionResult>;
}

const appName = 'auroras-cake';
/**
 * Public web configuration transcribed from Firebase Console on 2026-10-27.
 * Environment values can override it to switch to another Firebase project.
 */
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
let authPromise: Promise<Auth> | null = null;

function getOrCreateFirebaseApp(): FirebaseApp {
  if (!isFirebaseEnabled) throw new Error('firebase_disabled');
  const status = getFirebaseConfigurationStatus();
  if (!status.configured) throw new Error('firebase_config_missing');
  return getApps().find(item => item.name === appName)
    || initializeApp(firebaseConfig, appName);
}

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
      const app = getOrCreateFirebaseApp();
      const db = getFirestore(app);
      return {
        app,
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

/**
 * Authentication is intentionally initialized separately from read-only
 * Firestore diagnostics. Auth is not yet connected to the production staff
 * login flow, and calling getAuth during every health check can fail due to
 * Firebase Auth component registration before Firestore is even checked.
 *
 * Authentication now powers the independent Cloudflare Staff Preview.
 * Keep its module initialization isolated from Firestore health checks so
 * Firestore registration errors cannot prevent Firebase Auth sign-in.
 */
export function getFirebaseAuth(): Promise<Auth> {
  // Staff sign-in must not initialize or depend on Firestore first.
  // A Firestore component-registration error should never block Auth.
  if (!authPromise) {
    authPromise = import('firebase/auth').then(({ getAuth }) => {
      // Importing firebase/auth first registers its component before the
      // named app is handed to getAuth. This is separate from Firestore.
      const app = getOrCreateFirebaseApp();
      return getAuth(app);
    }).catch(error => {
      authPromise = null; // Permit recovery after transient SDK failure.
      throw error;
    });
  }
  return authPromise;
}
