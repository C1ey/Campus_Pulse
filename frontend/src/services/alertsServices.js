import {
  collection,
  serverTimestamp,
  getDocs,
  query,
  where,
  orderBy,
  deleteDoc,
  doc,
  updateDoc,
  Timestamp
} from "firebase/firestore";
import { db } from "../firebase"; // Assuming this is the initialized Firestore instance

const alertsCol = collection(db, "alerts");

// CRITICAL FIX: The API_URL points to the deployed Cloud Function
const API_URL = '/api/create-alert'; 

/**
 * sendAlert: Sends alert data to the Cloud Function API for secure processing.
 */
export async function sendAlert(payload) {
  try {
    // Making the HTTP call to the Cloud Function
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    // The Cloud Function should return the ID of the newly created alert document
    return response.json();
  } catch (error) {
    console.error("Failed to send alert via service:", error);
    throw error;
  }
}

/**
 * Mark an alert resolved (update status)
 */
export async function resolveAlert(alertId) {
  try {
    const ref = doc(db, "alerts", alertId);
    await updateDoc(ref, { status: "resolved" });
    return { ok: true };
  } catch (err) {
    console.error("alertsService.resolveAlert error:", err);
    throw err;
  }
}

/**
 * getActiveAlerts
 */
export async function getActiveAlerts() {
  try {
    const now = Timestamp.now();
    const q = query(
      collection(db, "alerts"),
      where("status", "==", "active"),
      where("expiresAt", ">", now),
      orderBy("createdAt", "desc")
    );

    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("alertsService.getActiveAlerts error:", err);
    throw err;
  }
}

/**
 * Optional helper to delete an alert
 */
export async function deleteAlert(alertId) {
  try {
    const ref = doc(db, "alerts", alertId);
    await deleteDoc(ref);
    return { ok: true };
  } catch (err) {
    console.error("alertsService.deleteAlert error:", err);
    throw err;
  }
}