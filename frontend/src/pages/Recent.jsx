
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getActiveAlerts } from "../frontend/alertsService.js";
import "../frontend/src/pages/Recent.css";

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || "";

// quantize lat/lng to reduce duplicate queries
function cacheKeyForLatLng(lat, lng) {
  return `${Number(lat).toFixed(5)}|${Number(lng).toFixed(5)}`;
}

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem("geocodeCache") || "{}");
  } catch {
    return {};
  }
}
function saveCache(cache) {
  try {
    localStorage.setItem("geocodeCache", JSON.stringify(cache));
  } catch {}
}

async function fetchPlaceFromBackend(lat, lng) {
  try {
    const url = `${BACKEND_BASE}/api/reverse-geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`;
    const r = await fetch(url);
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      console.warn("[Recent] reverse-geocode backend failed:", r.status, txt);
      return null;
    }
    const j = await r.json();
    // prefer road then displayName then neighbourhood/locality
    const name = (j.road && String(j.road).trim()) ||
                 (j.displayName && String(j.displayName).split(",")[0].trim()) ||
                 j.neighbourhood ||
                 j.locality ||
                 null;
    return name || null;
  } catch (err) {
    console.warn("[Recent] reverse geocode fetch error:", err);
    return null;
  }
}

export default function Recent() {
  const [alerts, setAlerts] = useState([]);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setResolving(true);
      try {
        const res = await getActiveAlerts();
        const sorted = (res || []).sort((a, b) => {
          const aTime = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : a.createdAt;
          const bTime = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : b.createdAt;
          return bTime - aTime;
        });

        const cache = loadCache();
        const toResolve = new Map();

        // collect unique coords that need resolving
        for (const a of sorted) {
          const lat = a.location?.lat;
          const lng = a.location?.lng;
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            const key = cacheKeyForLatLng(lat, lng);
            if (!cache[key] && !toResolve.has(key)) {
              toResolve.set(key, { lat, lng });
            }
          }
        }

        // resolve in parallel (but don't overwhelm backend)
        if (toResolve.size > 0) {
          const promises = Array.from(toResolve.entries()).map(async ([key, {lat, lng}]) => {
            const name = await fetchPlaceFromBackend(lat, lng);
            cache[key] = name || null;
          });
          await Promise.all(promises);
          saveCache(cache);
        }

        // enrich alerts with displayPlace (use existing locationName if present)
        const enriched = sorted.map(a => {
          const lat = a.location?.lat;
          const lng = a.location?.lng;
          let displayPlace = a.locationName ||
                             a.location?.name ||
                             (Number.isFinite(lat) && Number.isFinite(lng) ? `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}` : "Unknown Location");

          const coordsLike = /\d+\.\d+,\s*-?\d+\.\d+/.test(displayPlace);
          if (coordsLike && Number.isFinite(lat) && Number.isFinite(lng)) {
            const key = cacheKeyForLatLng(lat, lng);
            if (cache[key]) displayPlace = cache[key];
          } else if (/Unnamed/i.test(displayPlace) && Number.isFinite(lat) && Number.isFinite(lng)) {
            const key = cacheKeyForLatLng(lat, lng);
            if (cache[key]) displayPlace = cache[key];
          }

          return { ...a, displayPlace };
        });

        if (mounted) setAlerts(enriched);
      } catch (err) {
        console.error("[Recent] load failed:", err);
      } finally {
        if (mounted) setResolving(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="recent-screen">
      <Link to="/" className="home-badge" aria-label="Back to Emergency">🔴</Link>

      <h1 className="glow-title">Recent Reports</h1>

      <div style={{ marginBottom: 8, color: resolving ? "#0077cc" : "#666", fontSize: 13 }}>
        {resolving ? "Resolving place names..." : ""}
      </div>

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

            const isNewest = index === 0;
            return (
              <div key={a.id} className={`report-row ${isNewest ? "newest" : ""}`}>
                <div className="col type">{a.type || "Unknown"}</div>
                <div className="col date">{date}</div>
                <div className="col place">{a.displayPlace}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
