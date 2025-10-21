

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "Insert key",
  authDomain: "Insert Domain Name",
  projectId: "Insert ID",
  storageBucket: "Inser storage Bucket",
  messagingSenderId: "Insert Sender ID",
  appId: "Insert ID",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export default app;
