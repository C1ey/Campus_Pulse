// File: src/components/AlertsFeed.jsx
import React, { useEffect, useState } from "react";
import { getActiveAlerts } from "/Users/Cley/campus-pulse/frontend/alertsService.js"; // keep your project's import style

function displayPlaceForAlert(a) {
  if (a.locationName) return a.locationName;
  if (a.location?.name) return a.location.name;
  if (typeof a.location?.lat === "number" && typeof a.location?.lng === "number") {
    return `${a.location.lat.toFixed(4)}, ${a.location.lng.toFixed(4)}`;
  }
  return "Unknown Location";
}

export default function AlertsFeed() {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    let mounted = true;

    async function fetchAlerts() {
      try {
        const active = await getActiveAlerts();
        if (mounted) setAlerts(Array.isArray(active) ? active : []);
      } catch (err) {
        console.error("Failed to fetch alerts:", err);
      }
    }

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="alerts-feed-inner">
      <h2>Active Alerts</h2>
      <ul>
        {alerts.length > 0 ? (
          alerts.map((a) => {
            const place = displayPlaceForAlert(a);
            return (
              <li key={a.id} title={place}>
                <strong>{a.type ?? "Unknown"}</strong> — {a.status ?? "?"} —{" "}
                <span>{place}</span>
              </li>
            );
          })
        ) : (
          <li>No active alerts</li>
        )}
      </ul>
    </div>
  );
}
