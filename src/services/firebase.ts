import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { OperationType, FirestoreErrorInfo } from '../types';

const firebaseConfig = {
  apiKey: "AIzaSyCo_G5Vo7OkUsK-tUXVQKCkeTn_IHw9vB0",
  authDomain: "elite-rummy-circle.firebaseapp.com",
  projectId: "elite-rummy-circle",
  storageBucket: "elite-rummy-circle.firebasestorage.app",
  messagingSenderId: "762468709641",
  appId: "1:762468709641:web:b4e193ed1670e5d13ccfd8",
  measurementId: "G-D5Z38J9JMC"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// CRITICAL CONSTRAINT: Validate Firestore connection on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test_connection', 'ping'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. Client is offline.");
    }
  }
}
testConnection();
