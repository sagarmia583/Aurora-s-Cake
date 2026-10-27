import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { FirebaseDiagnosticPanel } from './components/FirebaseDiagnosticPanel';
import './index.css';

// The diagnostic is opt-in and never changes checkout or staff authorization.
// Open /?firebase-check=1 to test the actual Firestore server connection.
const showFirebaseDiagnostic =
  new URLSearchParams(window.location.search).get('firebase-check') === '1';

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    {showFirebaseDiagnostic ? <FirebaseDiagnosticPanel /> : null}
  </>
);
