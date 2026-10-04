import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectDatabaseEmulator, getDatabase } from 'firebase/database'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID

export const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: `${projectId}.firebaseapp.com`,
  databaseURL: `https://${projectId}-default-rtdb.firebaseio.com`,
  projectId,
})

export const auth = getAuth(app)
export const db = getFirestore(app)
export const rtdb = getDatabase(app)

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, `http://${import.meta.env.VITE_AUTH_EMULATOR_HOST}`, {
    disableWarnings: true,
  })
  const [firestoreHost, firestorePort] = import.meta.env.VITE_FIRESTORE_EMULATOR_HOST.split(':')
  connectFirestoreEmulator(db, firestoreHost, Number(firestorePort))
  const [databaseHost, databasePort] = import.meta.env.VITE_DATABASE_EMULATOR_HOST.split(':')
  connectDatabaseEmulator(rtdb, databaseHost, Number(databasePort))
}
