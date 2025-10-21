//October 19, 2025
//Pulse

import admin from "firebase-admin";
import { readFileSync } from "fs";

if (!admin.apps.length) {
  // Load from JSON file (recommended for local dev)
  const serviceAccount = JSON.parse(
    readFileSync(new URL("./serviceAccountKey.json", import.meta.url))
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
export default db;
