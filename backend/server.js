// backend/server.js
/**
 * Campus Pulse backend
 *
 * - Requires .env in backend folder with GOOGLE_API_KEY=YOUR_SERVER_KEY
 * - Requires firebase-admin credentials available (e.g. set GOOGLE_APPLICATION_CREDENTIALS to service account JSON)
 *
 * Start:
 *   npm run dev   # or node server.js
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import admin from "firebase-admin";
import turf from "@turf/turf";

dotenv.config();

// Initialize Firebase Admin SDK
try {
  admin.initializeApp();
} catch (e) {
  console.warn("firebase-admin initializeApp() warning:", e.message || e);
}
const db = admin.firestore();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// small helper to mask API key in logs
function maskKey(k) {
  if (!k) return "none";
  const last = k.slice(-6);
  return "*****" + last;
}

console.log("Starting Campus Pulse backend...");
console.log("GOOGLE_API_KEY loaded:", !!process.env.GOOGLE_API_KEY, maskKey(process.env.GOOGLE_API_KEY));

/**
 * Choose a human-friendly location string from Google Geocode response.
 * Prefer street/establishment/route/locality etc., avoid returning only plus-codes if possible.
 */
function chooseFriendlyLocationFromGoogle(googleResp) {
  if (!googleResp || !Array.isArray(googleResp.results)) return null;
  const results = googleResp.results;

  const preferredTypes = [
    "street_address","premise","subpremise","route",
    "establishment","point_of_interest","neighborhood",
    "locality","postal_town","sublocality",
    "administrative_area_level_2","administrative_area_level_1","country"
  ];

  for (const t of preferredTypes) {
    const match = results.find(r => Array.isArray(r.types) && r.types.includes(t));
    if (match && match.formatted_address) return match.formatted_address;
  }

  // prefer first non-plus_code formatted_address
  const nonPlus = results.find(r => !(Array.isArray(r.types) && r.types.includes("plus_code")) && r.formatted_address);
  if (nonPlus) return nonPlus.formatted_address;

  // fallback to first formatted_address
  if (results.length && results[0].formatted_address) return results[0].formatted_address;

  // last resort: compose locality/admin/country from address_components
  const first = results[0];
  if (first && Array.isArray(first.address_components)) {
    const ac = first.address_components;
    const get = (type) => {
      const a = ac.find(x => Array.isArray(x.types) && x.types.includes(type));
      return a ? a.long_name : null;
    };
    const locality = get("locality") || get("postal_town") || get("neighborhood") || get("sublocality");
    const admin1 = get("administrative_area_level_1");
    const country = get("country");
    const parts = [locality, admin1, country].filter(Boolean);
    if (parts.length) return parts.join(", ");
  }

  return null;
}

app.get("/", (req, res) => {
  res.send("Campus Pulse backend is running 🚀");
});

/**
 * POST /create-alert
 * Accepts { type, lat, lng, reportedBy }
 * Writes an alert to Firestore with a human-readable locationName (Google -> Nominatim fallback).
 */
app.post("/create-alert", async (req, res) => {
  try {
    const { type = "threat", lat, lng, reportedBy = null } = req.body;

    // Coerce lat/lng into numbers safely (handles strings)
    const latNum = lat !== undefined && lat !== null ? Number(lat) : NaN;
    const lngNum = lng !== undefined && lng !== null ? Number(lng) : NaN;
    const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);
    const location = hasCoords ? { lat: latNum, lng: lngNum } : null;

    console.log("\n--- create-alert received ---");
    console.log("type:", type, "reportedBy:", reportedBy);
    console.log("raw lat/lng:", lat, lng, "=> coerced:", latNum, lngNum);
    console.log("GOOGLE_API_KEY present?:", !!process.env.GOOGLE_API_KEY);

    let locationName = null;

    if (location) {
      // --- Try Google Geocoding (prefer friendly types) ---
      const apiKey = process.env.GOOGLE_API_KEY;
      if (apiKey) {
        try {
          const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latNum},${lngNum}&key=${apiKey}`;
          const resp = await axios.get(url, { timeout: 12000 });

          // Debug: small payload snippet so you can inspect results in logs
          const payloadSnippet = JSON.stringify(resp.data).slice(0, 2000);
          console.log("Google geocode status:", resp.data.status);
          console.log("Google payload snippet:", payloadSnippet);

          if (resp.data.status === "OK" && Array.isArray(resp.data.results) && resp.data.results.length) {
            const friendly = chooseFriendlyLocationFromGoogle(resp.data);
            if (friendly) {
              locationName = friendly;
              console.log("Google resolved (friendly):", locationName);
            } else {
              // Join up to 5 formatted_address values as a readable fallback
              const formattedList = resp.data.results
                .map(r => r.formatted_address)
                .filter(Boolean)
                .slice(0, 5);
              if (formattedList.length) {
                locationName = formattedList.join(" • ");
                console.log("Google produced addresses; using joined fallback:", locationName);
              } else {
                console.warn("Google had results but no formatted_address fields; full payload printed above.");
              }
            }
          } else {
            console.warn("Google geocode non-OK or no results:", resp.data.status, resp.data.error_message || "");
          }
        } catch (err) {
          console.warn("Google reverse geocode failed (axios):", err.message || err);
        }
      } else {
        console.warn("No GOOGLE_API_KEY found in process.env (check .env & restart).");
      }

      // --- Fallback: OpenStreetMap Nominatim ---
      if (!locationName) {
        try {
          const osmUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latNum}&lon=${lngNum}&addressdetails=1`;
          const osmResp = await axios.get(osmUrl, {
            headers: { "User-Agent": "CampusPulse/1.0 (contact@example.com)" },
            timeout: 8000
          });
          if (osmResp.data && (osmResp.data.display_name || osmResp.data.name)) {
            locationName = osmResp.data.display_name || osmResp.data.name;
            console.log("Nominatim resolved:", locationName);
          } else {
            console.warn("Nominatim returned empty result. Payload keys:", Object.keys(osmResp.data || {}).slice(0, 10));
          }
        } catch (err) {
          console.warn("Nominatim reverse geocode failed:", err.message || err);
        }
      }
    } else {
      console.log("No valid coordinates provided in request; skipping geocode.");
    }

    // Ensure a readable fallback so UI shows something useful
    if (!locationName) locationName = "Unknown Location";

    const expiresAt = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    );

    const ref = await db.collection("alerts").add({
      type,
      location,
      locationName,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
      status: "active",
      reportedBy,
    });

    console.log("Wrote alert:", { id: ref.id, locationName, location });
    res.json({ ok: true, id: ref.id, locationName });
  } catch (err) {
    console.error("create-alert error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
});


/**
 * GET /hotspots
 * Computes spatial clusters (DBSCAN) from recent alerts and returns hotspot summaries.
 * Query params:
 *  - timeWindowHours (default 72)
 *  - epsMeters (default 200)
 *  - minPoints (default 5)
 *  - trendWindowHours (default = timeWindowHours)
 *
 * Response: { hotspots: [ { id, clusterId, centroid, count, severity, firstSeen, lastSeen, countNow, countPrev, trendScore, topSample } ] }
 */
app.get("/hotspots", async (req, res) => {
  try {
    const timeWindowHours = Number(req.query.timeWindowHours) || 72;
    const epsMeters = Number(req.query.epsMeters) || 200;
    const minPoints = Number(req.query.minPoints) || 5;
    const trendWindowHours = Number(req.query.trendWindowHours) || timeWindowHours;

    const now = Date.now();
    const windowStart = new Date(now - timeWindowHours * 3600 * 1000);
    const prevWindowStart = new Date(now - 2 * trendWindowHours * 3600 * 1000);
    const prevWindowEnd = windowStart;

    // fetch alerts created since prevWindowStart
    const alertsRef = db.collection("alerts");
    const snapshot = await alertsRef
      .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(prevWindowStart))
      .get();

    if (snapshot.empty) {
      return res.json({ hotspots: [] });
    }

    const features = [];
    snapshot.forEach(doc => {
      const d = doc.data();
      if (!d.location || typeof d.location.lat !== "number" || typeof d.location.lng !== "number") return;
      const ts = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().getTime() : null;
      features.push(turf.point([d.location.lng, d.location.lat], { docId: doc.id, ts, type: d.type || null }));
    });

    if (features.length === 0) return res.json({ hotspots: [] });

    const fc = turf.featureCollection(features);

    // clustersDbscan: eps in kilometers (so convert)
    const epsKm = epsMeters / 1000;
    const clustered = turf.clustersDbscan(fc, epsKm, { units: "kilometers", minPoints });

    // aggregate clusters
    const clusters = {};
    clustered.features.forEach(f => {
      const clusterId = f.properties.cluster;
      if (clusterId === undefined || clusterId === null) return; // noise
      if (!clusters[clusterId]) clusters[clusterId] = { features: [], count: 0 };
      clusters[clusterId].features.push(f);
      clusters[clusterId].count += 1;
    });

    const hotspots = [];
    for (const [clusterId, cluster] of Object.entries(clusters)) {
      const fcCluster = turf.featureCollection(cluster.features);
      const centroid = turf.centroid(fcCluster).geometry.coordinates; // [lng, lat]

      let countNow = 0;
      let countPrev = 0;
      let earliest = Infinity, latest = -Infinity;
      for (const f of cluster.features) {
        const ts = f.properties.ts || 0;
        if (ts >= windowStart.getTime()) countNow++;
        if (ts >= prevWindowStart.getTime() && ts < prevWindowEnd.getTime()) countPrev++;
        earliest = Math.min(earliest, ts || Infinity);
        latest = Math.max(latest, ts || -Infinity);
      }

      const densityScore = cluster.count;
      const growth = (countPrev === 0) ? (countNow > 0 ? 1.0 : 0.0) : (countNow - countPrev) / (countPrev || 1);
      const trendScore = growth;
      const severity = densityScore * (1 + Math.max(0, trendScore));

      hotspots.push({
        id: `hotspot-${clusterId}-${Date.now()}`,
        clusterId: Number(clusterId),
        centroid: { lat: centroid[1], lng: centroid[0] },
        count: cluster.count,
        severity: Math.round(severity * 100) / 100,
        firstSeen: earliest === Infinity ? null : new Date(earliest).toISOString(),
        lastSeen: latest === -Infinity ? null : new Date(latest).toISOString(),
        countNow,
        countPrev,
        trendScore: Math.round(trendScore * 100) / 100,
        topSample: cluster.features[0].properties.docId
      });
    }

    // store a snapshot doc for historical inspection
    const batch = db.batch();
    const hotspotsCol = db.collection("hotspots");
    const snapshotDocRef = hotspotsCol.doc(`snapshot-${Date.now()}`);
    batch.set(snapshotDocRef, {
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      params: { timeWindowHours, epsMeters, minPoints },
      hotspots
    });
    await batch.commit();

    res.json({ hotspots });
  } catch (err) {
    console.error("hotspots error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
