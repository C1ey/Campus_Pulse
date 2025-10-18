import { collection, addDoc, serverTimestamp, getDocs, deleteDoc } from "firebase/firestore";
import { db } from "/Users/Cley/campus-pulse/frontend/src/firebase.js";

// 1️⃣ Function to create a new alert
export async function sendAlert({ type="medical", location, reportedBy=null }) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // now + 7 days
  return addDoc(collection(db, "alerts"), {
    type,
    location,
    createdAt: serverTimestamp(),
    expiresAt,               // Firestore accepts JS Date and stores as Timestamp
    status: "active",
    reportedBy
  });
}

// 2️⃣ Function to fetch active alerts and delete expired ones
export async function getActiveAlerts() {
  const now = new Date();
  const alertsRef = collection(db, "alerts");

  const snapshot = await getDocs(alertsRef);
  const activeAlerts = [];

  snapshot.forEach(async (doc) => {
    const data = doc.data();

    // Delete expired alerts
    if (data.expiresAt.toDate() < now) {
      await deleteDoc(doc.ref);
    } else {
      activeAlerts.push({ id: doc.id, ...data });
    }
  });

  return activeAlerts;
}
