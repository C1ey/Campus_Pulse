// File: src/services/alertsService.js
// Path: src/services/alertsService.js

import {
  collection,
  addDoc,
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
import { db } from "../firebase";

const alertsCol = collection(db, "alerts");

/**
 * sendAlert
 * payload example:
 * {
 *   type: "threat",
 *   location: { lat: 18.0000, lng: -76.0000 } | null,
 *   locationName: "UWI Mona Library" | null,
 *   reportedBy: "uid" | null
 * }
 *
 * Returns: { id: <newDocId> } on success, throws on error.
 */
export async function sendAlert({ type = "medical", location = null, locationName = null, reportedBy = null } = {}) {
  try {
    // expire in 7 days (stored as Firestore Timestamp)
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

    const docRef = await addDoc(alertsCol, {
      type,
      location,
      locationName: locationName ?? null,
      createdAt: serverTimestamp(),
      expiresAt,
      status: "active",
      reportedBy: reportedBy ?? null,
    });

    // Return something simple to the caller
    return { id: docRef.id };
  } catch (err) {
    console.error("alertsService.sendAlert error:", err);
    // Rethrow so callers (UI) can catch and handle
    throw err;
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
 * Returns array of alerts with fields: id, type, location, locationName, createdAt, expiresAt, status, reportedBy
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
 * Optional helper to delete an alert (not currently used but handy)
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
