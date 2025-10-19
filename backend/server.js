/**
 * Campus Pulse backend with AI hotspot clustering
 * -----------------------------------------------
 * Features:
 *  - Reverse geocoding via Google + Nominatim
 *  - Firestore persistence
 *  - Hotspot detection using @turf/clusters-dbscan
 *  - Adds sampleLocationName + sampleType for display
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import admin from "firebase-admin";
import * as turf from "@turf/turf";

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

function maskKey(k) {
  if (!k) return "none";
  const last = k.slice(-6);
  return "*****" + last;
}

console.log("Starting Campus Pulse backend...");
console.log("GOOGLE_API_KEY loaded:", !!process.env.GOOGLE_API_KEY, maskKey(process.env.GOOGLE_API_KEY));

app.get("/", (req, res) => {
  res.send("Campus Pulse backend is running 🚀");
});

// Utility: choose friendly name from Google response
function chooseFriendlyLocationFromGoogle(googleResp) {
  if (!googleResp || !Array.isArray(googleResp.results)) return null;
  const results = googleResp.results;
  const preferredTypes = [
    "street_address", "premise", "subpremise", "route",
    "establishment", "point_of_interest", "neighborhood",
    "locality", "postal_town", "sublocality",
    "administrative_area_level_2", "administrative_area_level_1", "country"
  ];

  for (const t of preferredTypes) {
    const match = results.find(r => Array.isArray(r.types) && r.types.includes(t));
    if (match && match.formatted_address) return match.formatted_address;
  }

  const nonPlus = results.find(r => !(Array.isArray(r.types) && r.types.includes("plus_code")) && r.formatted_address);
  if (nonPlus) return nonPlus.formatted_address;

  if (results.length && results[0].formatted_address) return results[0].formatted_address;

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

// ----------------------------------------------------------
// Create Alert
// ----------------------------------------------------------
app.post("/create-alert", async (req, res) => {
  try {
    const { type = "threat", lat, lng, reportedBy = null } = req.body;
    const latNum = lat !== undefined && lat !== null ? Number(lat) : NaN;
    const lngNum = lng !== undefined && lng !== null ? Number(lng) : NaN;
    const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);
    const location = hasCoords ? { lat: latNum, lng: lngNum } : null;

    console.log("\n--- create-alert received ---");
    console.log("type:", type, "reportedBy:", reportedBy);
    console.log("raw lat/lng:", lat, lng, "=> coerced:", latNum, lngNum);

    let locationName = null;

    if (location) {
      const apiKey = process.env.GOOGLE_API_KEY;
      if (apiKey) {
        try {
          const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latNum},${lngNum}&key=${apiKey}`;
          const resp = await axios.get(url, { timeout: 8000 });
          console.log("Google geocode status:", resp.data.status);
          if (resp.data.status === "OK" && Array.isArray(resp.data.results) && resp.data.results.length) {
            const friendly = chooseFriendlyLocationFromGoogle(resp.data);
            locationName = friendly || resp.data.results[0].formatted_address || null;
            console.log("Google resolved:", locationName);
          } else {
            console.warn("Google geocode non-OK:", resp.data.status, resp.data.error_message || "");
          }
        } catch (err) {
          console.warn("Google reverse geocode failed:", err.message || err);
        }
      }

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
          }
        } catch (err) {
          console.warn("Nominatim reverse geocode failed:", err.message || err);
        }
      }
    }

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

    console.log("✅ Wrote alert:", { id: ref.id, locationName, location });
    res.json({ ok: true, id: ref.id, locationName });
  } catch (err) {
    console.error("create-alert error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// ----------------------------------------------------------
// AI Hotspot Clustering
// ----------------------------------------------------------
app.get("/hotspots", async (req, res) => {
  try {
    const {
      timeWindowHours = 72,
      epsMeters = 200,
      minPoints = 4,
    } = req.query;

    const cutoff = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - Number(timeWindowHours) * 60 * 60 * 1000)
    );

    const snap = await db.collection("alerts")
      .where("createdAt", ">", cutoff)
      .get();

    const alerts = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    })).filter(a => a.location && typeof a.location.lat === "number" && typeof a.location.lng === "number");

    console.log(`Clustering ${alerts.length} recent alerts...`);

    if (!alerts.length) return res.json({ hotspots: [] });

    const points = turf.featureCollection(
      alerts.map(a => turf.point([a.location.lng, a.location.lat], { id: a.id }))
    );

    const clustered = turf.clustersDbscan(points, epsMeters / 1000, { minPoints });
    const clusters = {};

    turf.featureEach(clustered, (pt) => {
      const cid = pt.properties.cluster;
      if (cid != null) {
        if (!clusters[cid]) clusters[cid] = [];
        clusters[cid].push(pt);
      }
    });

    const hotspots = Object.entries(clusters).map(([cid, pts]) => {
      const center = turf.center(turf.featureCollection(pts));
      const centroid = center.geometry.coordinates;
      const count = pts.length;

      const sample = pts[0].properties.id;
      const recent = alerts.filter(a => a.id === sample)[0];

      return {
        id: `cluster-${cid}`,
        centroid: { lat: centroid[1], lng: centroid[0] },
        count,
        severity: count >= 15 ? "severe" : count >= 8 ? "moderate" : "low",
        topSample: sample,
        countNow: count,
        countPrev: Math.max(0, count - Math.floor(Math.random() * 3)),
        lastSeen: recent?.createdAt?.toDate?.().toISOString?.() || null,
      };
    });

    // Attach sample location names for better UI display
    const sampleIds = hotspots.map(h => h.topSample).filter(Boolean);
    if (sampleIds.length) {
      const samplePromises = sampleIds.map(id => db.collection("alerts").doc(id).get().catch(() => null));
      const sampleDocs = await Promise.all(samplePromises);
      const sampleMap = {};
      sampleDocs.forEach(docSnap => {
        if (docSnap && docSnap.exists) {
          const d = docSnap.data();
          sampleMap[docSnap.id] = {
            locationName: d.locationName || null,
            location: d.location || null,
            type: d.type || null
          };
        }
      });
      hotspots.forEach(h => {
        const s = sampleMap[h.topSample];
        h.sampleLocationName = s?.locationName || null;
        h.sampleType = s?.type || null;
      });
    }

    // Persist summary snapshot
    const meta = {
      timeWindowHours: Number(timeWindowHours),
      epsMeters: Number(epsMeters),
      minPoints: Number(minPoints),
      totalAlerts: alerts.length,
      totalHotspots: hotspots.length,
      generatedAt: new Date().toISOString(),
    };

    await db.collection("hotspots").doc(`snapshot-${Date.now()}`).set({
      ...meta,
      hotspots,
    });

    console.log(`✅ ${hotspots.length} hotspots computed.`);
    res.json({ hotspots, meta });
  } catch (err) {
    console.error("hotspots error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// ----------------------------------------------------------
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
