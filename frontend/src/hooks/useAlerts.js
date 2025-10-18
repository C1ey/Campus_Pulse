// File: src/hooks/useAlerts.js
// Path: src/hooks/useAlerts.js

import { useEffect, useState, useRef } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

export default function useAlerts(pollIntervalMs = 30000) {
  const [alerts, setAlerts] = useState([]);
  const unsubRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    const subscribe = () => {
      if (!mounted) return;
      const now = new Date();
      const q = query(
        collection(db, "alerts"),
        where("status", "==", "active"),
        where("expiresAt", ">", now),
        orderBy("createdAt", "desc")
      );

      if (unsubRef.current) unsubRef.current();
      unsubRef.current = onSnapshot(
        q,
        (snap) => {
          if (!mounted) return;
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setAlerts(items);
        },
        (err) => console.error("useAlerts onSnapshot error:", err)
      );
    };

    subscribe();
    const interval = setInterval(subscribe, pollIntervalMs);

    return () => {
      mounted = false;
      if (unsubRef.current) unsubRef.current();
      clearInterval(interval);
    };
  }, [pollIntervalMs]);

  return alerts;
}
