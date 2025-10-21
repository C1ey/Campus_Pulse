// backend/server.js
// Campus Pulse backend (cleaned & fixed)
// 2025-10-19

process.env.GOOGLE_CLOUD_DISABLE_TELEMETRY = "1";

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";
import * as turf from "@turf/turf";
import fs from "fs";

import geocodeRouter from "./routes/geocode.js"; // keep if you have this route

dotenv.config(); // load .env

// Config constants (centralized) 
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ? String(process.env.OPENAI_API_KEY).trim() : null;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-3.5-turbo";
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY ? String(process.env.GOOGLE_API_KEY).trim() : null;
const GOOGLE_GENAI_MODEL = process.env.GOOGLE_GENAI_MODEL || "text-bison-001";

console.log("Starting backend...");
console.log("GOOGLE_API_KEY loaded:", !!GOOGLE_API_KEY);
console.log("OPENAI_API_KEY loaded:", !!OPENAI_API_KEY);

// Firebase Admin initialization 
try {
  if (fs.existsSync("./serviceAccount.json")) {
    const sa = JSON.parse(fs.readFileSync("./serviceAccount.json", "utf8"));
    admin.initializeApp({ credential: admin.credential.cert(sa) });
    console.log("Firebase Admin initialized with serviceAccount.json");
  } else {
    admin.initializeApp();
    console.log("Firebase Admin initialized with default credentials");
  }
} catch (e) {
  console.warn("firebase-admin initializeApp() warning:", e?.message || e);
}

const db = admin.firestore();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Optional: mount geocode router if present
if (geocodeRouter) app.use("/api/geocode", geocodeRouter);

// ---- App config / constants used by logic ----
const SUMMARY_INTERVAL_MINUTES = Number(process.env.SUMMARY_INTERVAL_MINUTES || 10);
const SUMMARY_CHUNK_SIZE = Number(process.env.SUMMARY_CHUNK_SIZE || 10);
const ROUTE_TYPES = new Set(["threat", "robbery", "assault", "roadblock", "accident", "violent", "shooting"]);

// ---- Helpers ----
const parseGoogleComponents = (components = []) => {
  const map = {};
  components.forEach(c => {
    (c.types || []).forEach(t => {
      if (!map[t]) map[t] = c.long_name;
    });
  });
  return map;
};

async function reverseGeocodeServer(lat, lng) {
  // Try Google first (if key present)
  if (GOOGLE_API_KEY) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_API_KEY}`;
      const r = await fetch(url);
      if (r.ok) {
        const j = await r.json();
        if (j.status === "OK" && Array.isArray(j.results) && j.results.length) {
          const preferred = [
            "street_address","premise","subpremise","route",
            "establishment","point_of_interest","neighborhood",
            "locality","postal_town","sublocality",
            "administrative_area_level_2","administrative_area_level_1","country"
          ];
          let chosen = null;
          for (const t of preferred) {
            const m = j.results.find(r => Array.isArray(r.types) && r.types.includes(t));
            if (m) { chosen = m; break; }
          }
          chosen = chosen || j.results[0];

          const components = parseGoogleComponents(chosen.address_components || []);
          const roadName = components.route || components.street || components.street_address || null;
          const neighborhood = components.neighborhood || components.sublocality || components.locality || components.postal_town || null;
          const locality = components.locality || components.administrative_area_level_2 || components.administrative_area_level_1 || null;

          return {
            displayName: chosen.formatted_address || null,
            road: roadName,
            neighborhood,
            locality,
            raw: chosen
          };
        }
      }
    } catch (err) { console.warn("Google reverse geocode failed:", err?.message || err); }
  }

  // fallback to OpenStreetMap / Nominatim
  try {
    const osmUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1`;
    const r2 = await fetch(osmUrl, { headers: { "User-Agent": "CampusPulse/1.0 (contact@example.com)" } });
    if (r2.ok) {
      const j2 = await r2.json();
      if (j2) {
        const a = j2.address || {};
        const roadName = a.road || a.cycleway || a.pedestrian || a.footway || a.residential || null;
        const neighborhood = a.neighbourhood || a.suburb || a.village || a.hamlet || a.town || a.city || null;
        const locality = a.city || a.county || a.state || null;
        const displayName = j2.display_name || (neighborhood ? `${neighborhood}, ${locality || ""}`.trim() : null);

        return {
          displayName,
          road: roadName,
          neighborhood,
          locality,
          raw: j2
        };
      }
    }
  } catch (err) { console.warn("Nominatim failed:", err?.message || err); }

  return null;
}

function extractStreetFromDisplayName(displayName) {
  if (!displayName || typeof displayName !== "string") return null;
  const numStreet = displayName.match(/^\s*\d+\s+([^,]+)/);
  if (numStreet && numStreet[1]) return numStreet[1].trim();
  const roadMatch = displayName.match(/([A-Za-z0-9\s]+(?:Drive|Dr|Road|Rd|Street|St|Avenue|Ave|Lane|Ln|Alley|Ally|Court|Ct|Close|Boulevard|Blvd))/i);
  if (roadMatch) return roadMatch[1].trim();
  return null;
}

async function findNearbyRoadVariants(lat, lng, primaryRoad) {
  const deltas = [
    [0.0006, 0], [-0.0006, 0], [0, 0.0006], [0, -0.0006], [0.0006, 0.0006], [-0.0006, -0.0006]
  ];
  const found = new Set();
  for (const [dLat, dLng] of deltas) {
    try {
      const r = await reverseGeocodeServer(lat + dLat, lng + dLng);
      if (!r) continue;
      const candidate = r.road || extractStreetFromDisplayName(r.displayName) || r.neighborhood || null;
      if (candidate && (!primaryRoad || candidate.toLowerCase() !== String(primaryRoad).toLowerCase())) {
        found.add(candidate);
        if (found.size >= 3) break;
      }
    } catch (e) {
      // ignore
    }
  }
  return Array.from(found);
}

// OpenAI chat wrapper
async function callOpenAIChat(messages, max_tokens = 120) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: OPENAI_MODEL, messages, max_tokens, temperature: 0.0 })
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`OpenAI error ${resp.status}: ${txt}`);
  }
  const body = await resp.json();
  return body;
}

// Google GenAI / Text-Bison wrapper
async function callGoogleGenAI(promptText, maxOutputTokens = 120) {
  const key = GOOGLE_API_KEY;
  if (!key) throw new Error("GOOGLE_API_KEY not set for Google GenAI");

  const url = `https://generativelanguage.googleapis.com/v1beta2/models/${encodeURIComponent(GOOGLE_GENAI_MODEL)}:generateText?key=${encodeURIComponent(key)}`;
  const body = { prompt: { text: promptText }, temperature: 0.0, candidateCount: 1, maxOutputTokens };

  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Google GenAI error ${r.status}: ${await r.text().catch(() => "")}`);

  const j = await r.json();
  return j?.candidates?.[0]?.content || j?.candidates?.[0]?.output || JSON.stringify(j);
}

function extractJsonArrayFromText(s) {
  if (!s || typeof s !== "string") return null;
  const first = s.indexOf("[");
  const last = s.lastIndexOf("]");
  const candidate = first !== -1 && last !== -1 ? s.slice(first, last + 1) : s;
  try { const parsed = JSON.parse(candidate); return Array.isArray(parsed) ? parsed : null; } catch { return null; }
}

function toFeatureCollectionFromAlerts(alerts) {
  const features = alerts.map(a => turf.point([a.location.lng, a.location.lat], { id: a.id, createdAt: a.createdAt, type: a.type, locationName: a.locationName }));
  return turf.featureCollection(features);
}

async function generateBatchedSummaries(hotspots, latestRef, snapshotRef, chunkSize = SUMMARY_CHUNK_SIZE) {
  const allSummaries = [];
  if ((!OPENAI_API_KEY) && (!GOOGLE_API_KEY)) return allSummaries;

  for (let i = 0; i < hotspots.length; i += chunkSize) {
    const chunk = hotspots.slice(i, i + chunkSize);

    for (const h of chunk) {
      const primary = h.nearbyRoad || extractStreetFromDisplayName(h.areaName) || null;
      let variants = [];
      try { variants = await findNearbyRoadVariants(h.centroid.lat, h.centroid.lng, primary); } catch (e) { variants = []; }

      h.nearbyRoadVariants = variants;
      if (variants.length > 0) {
        const alt = variants[0];
        if (h.areaName && h.areaName.toLowerCase().includes(String(alt).toLowerCase()) === false) {
          h.recommendation = `Avoid ${h.areaName || primary || "this area"}; take ${alt} instead.`;
        } else if (primary) {
          h.recommendation = `Avoid ${primary}; take ${alt} instead.`;
        } else {
          h.recommendation = `Avoid ${h.areaName || "this area"}; take ${alt} instead.`;
        }
        h.alternativeRoute = alt;
      } else {
        h.alternativeRoute = null;
      }

      const areaLabel = h.areaName || h.sampleLocationName || `coords ${h.centroid.lat.toFixed(4)},${h.centroid.lng.toFixed(4)}`;
      h.summary = h.summary || `${areaLabel} reported ${h.countNow} recent incident(s)`;
      h.summaryHeading = "Hotspot summary";
      h.summaryVisible = true;
    }

    const aiTargets = chunk.filter(h => h.needsRoute === "yes" && !h.alternativeRoute);
    let aiText = null;
    if (aiTargets.length > 0) {
      const lines = aiTargets.map(h => {
        const area = h.areaName || h.sampleLocationName || `coords:${h.centroid.lat.toFixed(4)},${h.centroid.lng.toFixed(4)}`;
        return `id:${h.id}|area:"${area}"|countNow:${h.countNow}|type:${h.sampleType||"unknown"}`;
      }).join("\n");

      const system = "You are a concise safety assistant. Return a JSON array of objects with keys id, summary, recommendation, alternativeRoute. Keep each value very short (≤20 words). For recommendation use the pattern: 'Avoid AREA; take ALT instead.' Use ALT as a nearby road or nearby town name.";
      const userPrompt = `Hotspots:\n${lines}\nReturn only a valid JSON array.`;

      try {
        if (OPENAI_API_KEY) {
          const resp = await callOpenAIChat([{ role: "system", content: system }, { role: "user", content: userPrompt }], 120);
          aiText = resp?.choices?.[0]?.message?.content;
        }
        if ((!aiText || !aiText.trim()) && GOOGLE_API_KEY) {
          aiText = await callGoogleGenAI(`${system}\n\n${userPrompt}`, 120);
        }
      } catch (err) {
        console.warn("[summaries] AI call failed:", err?.message || err);
        aiText = null;
      }
    }

    const parsedArr = extractJsonArrayFromText(aiText);
    const mapById = {};
    if (parsedArr) parsedArr.forEach(it => { if (it?.id) mapById[it.id] = it; });

    const latestSnap = await latestRef.get();
    const latestData = latestSnap.exists ? latestSnap.data() : { hotspots: [] };
    const latestHs = Array.isArray(latestData.hotspots) ? latestData.hotspots : [];

    for (const h of chunk) {
      const ai = mapById[h.id];
      if (ai) {
        h.summary = ai.summary || h.summary;
        h.recommendation = ai.recommendation || h.recommendation;
        h.alternativeRoute = ai.alternativeRoute || h.alternativeRoute;
      }
      if (!h.summary) {
        const areaLabel = h.areaName || h.sampleLocationName || `coords ${h.centroid.lat.toFixed(4)},${h.centroid.lng.toFixed(4)}`;
        h.summary = `${areaLabel} reported ${h.countNow} recent incident(s)`;
      }
      h.summaryHeading = h.summaryHeading || "Hotspot summary";
      h.summaryVisible = true;

      const idx = latestHs.findIndex(x => x.id === h.id);
      if (idx !== -1) latestHs[idx] = { ...latestHs[idx], ...h };
      else latestHs.push(h);

      allSummaries.push(h);
    }

    await latestRef.set({ createdAt: admin.firestore.FieldValue.serverTimestamp(), hotspots: latestHs }, { merge: true });

    for (const h of chunk) {
      try { await snapshotRef.update({ hotspots: admin.firestore.FieldValue.arrayUnion(h) }); }
      catch { await snapshotRef.set({ createdAt: admin.firestore.FieldValue.serverTimestamp(), hotspots: [h] }, { merge: true }); }
    }

    await new Promise(r => setTimeout(r, 300));
  }

  return allSummaries;
}

/* ---------- API Endpoints ---------- */

// health
app.get("/", (req, res) => res.send("Campus Pulse backend running 🚀"));

// create-alert
app.post("/create-alert", async (req, res) => {
  try {
    const { type = "threat", lat, lng, reportedBy = null } = req.body;
    const latNum = Number(lat), lngNum = Number(lng);
    const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);
    const location = hasCoords ? { lat: latNum, lng: lngNum } : null;
    let locationName = null;
    if (hasCoords) {
      try { locationName = await reverseGeocodeServer(latNum, lngNum); } catch (_) { locationName = null; }
    }

    const docRef = await db.collection("alerts").add({
      type,
      location,
      locationName: locationName?.displayName || null,
      status: "active",
      reportedBy,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log("create-alert saved:", docRef.id);
    res.json({ ok: true, id: docRef.id, locationName: locationName?.displayName || null });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// hotspots
app.get("/hotspots", async (req, res) => {
  try {
    const timeWindowHours = Number(req.query.timeWindowHours) || 72;
    const epsMeters = Number(req.query.epsMeters) || 200;
    const minPoints = Number(req.query.minPoints) || 4;

    const now = Date.now();
    const windowStart = new Date(now - timeWindowHours * 3600 * 1000);
    const prevWindowStart = new Date(now - 2 * timeWindowHours * 3600 * 1000);

    const alertsRef = db.collection("alerts");
    const snap = await alertsRef.where("createdAt", ">=", admin.firestore.Timestamp.fromDate(prevWindowStart)).get();

    const alerts = [];
    snap.forEach(doc => {
      const d = doc.data();
      if (!d?.location?.lat || !d?.location?.lng) return;
      const createdAt = d.createdAt?.toDate?.()?.getTime() || d.createdAt || null;
      alerts.push({ id: doc.id, type: d.type, locationName: d.locationName, location: d.location, createdAt });
    });

    if (!alerts.length) {
      const latestRef = db.collection("hotspots").doc("latest");
      await latestRef.set({ createdAt: admin.firestore.FieldValue.serverTimestamp(), hotspots: [] }, { merge: true });
      return res.json({ hotspots: [] });
    }

    const fc = toFeatureCollectionFromAlerts(alerts);
    const epsKm = Math.max(0.001, epsMeters / 1000);
    const clustered = turf.clustersDbscan(fc, epsKm, { units: "kilometers", minPoints });

    const clusters = {};
    clustered.features.forEach(f => {
      const cid = f.properties.cluster;
      if (cid == null) return;
      if (!clusters[cid]) clusters[cid] = [];
      clusters[cid].push(f);
    });

    const hotspotEntries = await Promise.all(Object.entries(clusters).map(async ([cid, pts]) => {
      const props = pts.map(p => p.properties);
      const clusterFc = turf.featureCollection(pts.map(p => turf.point(p.geometry.coordinates)));
      const centroidCoords = turf.centroid(clusterFc).geometry.coordinates;

      let countNow = 0, countPrev = 0;
      let earliest = Infinity, latestTs = -Infinity;
      props.forEach(p => {
        const ts = p.createdAt || 0;
        if (ts >= windowStart.getTime()) countNow++;
        if (ts >= prevWindowStart.getTime() && ts < windowStart.getTime()) countPrev++;
        earliest = Math.min(earliest, ts || Infinity);
        latestTs = Math.max(latestTs, ts || -Infinity);
      });

      const types = {};
      props.forEach(p => { if (p.type) types[p.type] = (types[p.type] || 0) + 1; });
      const topType = Object.entries(types).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;

      const sample = props[0] || {};
      const trendScore = countPrev === 0 ? (countNow > 0 ? 1 : 0) : (countNow - countPrev) / (countPrev || 1);

      // reverse geocode centroid
      let resolved = null;
      try { resolved = await reverseGeocodeServer(centroidCoords[1], centroidCoords[0]).catch(() => null); } catch (e) { resolved = null; }

      const areaName = resolved?.displayName || sample.locationName || null;
      const primaryRoad = resolved?.road || extractStreetFromDisplayName(areaName) || null;

      let nearbyRoad = null;
      try {
        const variants = await findNearbyRoadVariants(centroidCoords[1], centroidCoords[0], primaryRoad);
        if (variants.length > 0) nearbyRoad = variants[0];
      } catch (e) {
        nearbyRoad = null;
      }

      const needsRoute = ROUTE_TYPES.has(String(topType || "").toLowerCase()) ? "yes" : "no";

      return {
        id: `hotspot-${cid}`,
        clusterId: Number(cid),
        centroid: { lat: centroidCoords[1], lng: centroidCoords[0] },
        count: props.length,
        countNow,
        countPrev,
        trendScore: Math.round(trendScore * 100) / 100,
        severity: props.length,
        sampleLocationName: sample.locationName || null,
        sampleType: topType,
        firstSeen: earliest === Infinity ? null : new Date(earliest).toISOString(),
        lastSeen: latestTs === -Infinity ? null : new Date(latestTs).toISOString(),
        areaName,
        primaryRoad,
        nearbyRoad,
        needsRoute,
        summary: null,
        summaryHeading: null,
        summaryVisible: null,
        recommendation: null,
        alternativeRoute: null
      };
    }));

    const hotspots = hotspotEntries;
    const latestRef = db.collection("hotspots").doc("latest");
    const snapshotRef = db.collection("hotspots_snapshots").doc(`snapshot-${Date.now()}`);
    await latestRef.set({ createdAt: admin.firestore.FieldValue.serverTimestamp(), params: { timeWindowHours, epsMeters, minPoints }, hotspots }, { merge: true });
    await snapshotRef.set({ createdAt: admin.firestore.FieldValue.serverTimestamp(), params: { timeWindowHours, epsMeters, minPoints }, hotspots }, { merge: true });

    const summaries = await generateBatchedSummaries(hotspots, latestRef, snapshotRef, SUMMARY_CHUNK_SIZE);
    res.json({ hotspots: summaries.length ? summaries : hotspots });

  } catch (err) { res.status(500).json({ error: String(err) }); }
});

/* ---------- start server (only when run directly) ---------- */
if (import.meta.url === `file://${process.cwd()}/backend/server.js` || !process.env.FUNCTION_TARGET) {
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

// export app so it can be mounted by Cloud Functions / Cloud Run wrapper if needed
export default app;
