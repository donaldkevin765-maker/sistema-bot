let db: any = null
let ref: any = null
let onValue: any = null
let off: any = null

export function initFirebase() {
  if (db) return { db, ref, onValue, off }

  try {
    const firebase = require("firebase/app")
    const database = require("firebase/database")

    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
      databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "",
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
    }

    if (!firebaseConfig.databaseURL) {
      console.warn("Firebase databaseURL not configured")
      return null
    }

    const app = !firebase.getApps().length
      ? firebase.initializeApp(firebaseConfig)
      : firebase.getApps()[0]

    db = database.getDatabase(app)
    ref = database.ref
    onValue = database.onValue
    off = database.off

    return { db, ref, onValue, off }
  } catch (e) {
    console.warn("Firebase init failed:", e)
    return null
  }
}
