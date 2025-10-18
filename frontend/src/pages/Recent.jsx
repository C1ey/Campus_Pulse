// File: src/pages/Recent.jsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getActiveAlerts } from "/Users/Cley/campus-pulse/frontend/alertsService.js";
import "/Users/Cley/campus-pulse/frontend/src/pages/Recent.css";

export default function Recent() {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const res = await getActiveAlerts();
      const sorted = (res || []).sort((a, b) => {
        const aTime = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : a.createdAt;
        const bTime = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : b.createdAt;
        return bTime - aTime;
      });
      if (mounted) setAlerts(sorted);
    }
    load();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="recent-screen">
      <Link to="/" className="home-badge" aria-label="Back to Emergency">🔴</Link>

      <h1 className="glow-title">Recent Reports</h1>

      <div className="reports-container">
        {alerts.length === 0 ? (
          <p className="no-reports">No recent reports</p>
        ) : (
          alerts.map((a, index) => {
            const date = new Date(
              a.createdAt?.seconds ? a.createdAt.seconds * 1000 : a.createdAt
            ).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            });

            // Prefer locationName then nested name then lat/lng fallback
            const displayPlace =
              a.locationName ||
              a.location?.name ||
              (a.location?.lat && a.location?.lng
                ? `${Number(a.location.lat).toFixed(4)}, ${Number(a.location.lng).toFixed(4)}`
                : "Unknown Location");

            const isNewest = index === 0;
            return (
              <div key={a.id} className={`report-row ${isNewest ? "newest" : ""}`}>
                <div className="col type">{a.type || "Unknown"}</div>
                <div className="col date">{date}</div>
                <div className="col place">{displayPlace}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
