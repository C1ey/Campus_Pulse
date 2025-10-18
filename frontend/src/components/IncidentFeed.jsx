// File: src/components/IncidentFeed.jsx
import React, { useState } from "react";
import useAlerts from "/Users/Cley/campus-pulse/frontend/src/hooks/useAlerts.js";
import { resolveAlert } from "/Users/Cley/campus-pulse/frontend/alertsService.js";

function displayPlaceForAlert(a) {
  if (a.locationName) return a.locationName;
  if (a.location?.name) return a.location.name;
  if (typeof a.location?.lat === "number" && typeof a.location?.lng === "number") {
    return `${a.location.lat.toFixed(5)}, ${a.location.lng.toFixed(5)}`;
  }
  return "Unknown Location";
}

export default function IncidentFeed() {
  const alerts = useAlerts();
  const [resolving, setResolving] = useState(null);

  async function handleResolve(id) {
    setResolving(id);
    try {
      await resolveAlert(id);
    } catch (err) {
      console.error("Failed to resolve alert", err);
      alert("Failed to mark resolved: " + (err.message || err));
    } finally {
      setResolving(null);
    }
  }

  return (
    <div className="incident-feed">
      <h3>Incident Feed</h3>
      {alerts.length === 0 && <div>No active incidents</div>}
      <ul>
        {alerts.map((a) => {
          const when =
            a.createdAt?.toDate?.()?.toLocaleString?.() ||
            (a.createdAt?.seconds ? new Date(a.createdAt.seconds * 1000).toLocaleString() : "just now");
          const place = displayPlaceForAlert(a);
          return (
            <li key={a.id}>
              <div>
                <strong>{a.type}</strong> — {when}
              </div>
              <div title={place}>
                {place}
              </div>
              <div>
                <button onClick={() => handleResolve(a.id)} disabled={resolving === a.id}>
                  {resolving === a.id ? "Resolving..." : "Mark Resolved"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
