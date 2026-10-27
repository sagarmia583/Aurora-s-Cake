/**
 * Optional Firebase web bootstrap for Aurora's Cake.
 *
 * This uses Firebase's official modular CDN, so it does not change the
 * existing npm lockfile. It is loaded only when explicitly enabled.
 * No customer, payment, or staff data is written by this module.
 */
export interface FirebaseConnectionResult {
  ok: boolean;
  message: string;
  healthDocumentExists?: boolean;
}

export interface FirebaseServices {
  app: any;
  auth: any;
  db: any;
  checkConnection: () => Promise<FirebaseConnectionResult>;
}

const sdkBase = 'https://www.gstatic.com/firebasejs/13.1.0/';
const appName = 'auroras-cake';
const loadSdk = (file: string): Promise<any> =>
  import(/* @vite-ignore */ sdkBase + file);

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
};

export const isFirebaseEnabled = import.meta.env.VITE_FIREBASE_ENABLED === 'true';

export function getFirebaseConfigurationStatus(): {
  enabled: boolean;
  configured: boolean;
  missing: string[];
} {
  const missing = Object.entries(firebaseConfig)
    .filter(([key, value]) => key !== 'messagingSenderId' && !value.trim())
    .map(([key]) => key);
  return { enabled: isFirebaseEnabled, configured: missing.length === 0, missing };
}

let servicesPromise: Promise<FirebaseServices> | null = null;

/**
 * Initializes the Firebase Web SDK without modifying legacy order flows.
 * Throws a clear error when configuration is missing or Firebase CDN fails.
 */
export function getFirebaseServices(): Promise<FirebaseServices> {
  if (!isFirebaseEnabled) {
    return Promise.reject(new Error('Firebase is disabled. Set VITE_FIREBASE_ENABLED=true.'));
  }
  const status = getFirebaseConfigurationStatus();
  if (!status.configured) {
    return Promise.reject(new Error('Missing Firebase config: ' + status.missing.join(', ')));
  }
  if (!servicesPromise) {
    servicesPromise = (async () => {
      const [appModule, authModule, firestoreModule] = await Promise.all([
        loadSdk('firebase-app.js'),
        loadSdk('firebase-auth.js'),
        loadSdk('firebase-firestore.js'),
      ]);
      const app = appModule.getApps().find((item: any) => item.name === appName)
        || appModule.initializeApp(firebaseConfig, appName);
      const auth = authModule.getAuth(app);
      const db = firestoreModule.getFirestore(app);
      return {
        app,
        auth,
        db,
        async checkConnection(): Promise<FirebaseConnectionResult> {
          try {
            // A server-only read proves network reachability AND deployed rules.
            // The health document may legitimately be absent.
            const snapshot = await firestoreModule.getDocFromServer(
              firestoreModule.doc(db, 'public', 'health')
            );
            return {
              ok: true,
              message: 'Firestore server is reachable and public health read is allowed.',
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
    })().catch((error) => {
      servicesPromise = null;
      throw error;
    });
  }
  return servicesPromise;
}
