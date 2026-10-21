import { initializeApp } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import type { ConfirmationResult } from 'firebase/auth';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);

if (import.meta.env.DEV) {
    (firebaseAuth.settings as any).appVerificationDisabledForTesting = true;
    console.log('[Firebase] Modo de prueba: reCAPTCHA deshabilitado');
}

export { RecaptchaVerifier, signInWithPhoneNumber, GoogleAuthProvider, signInWithPopup };
export type { ConfirmationResult };
