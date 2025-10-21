//October 19, 2025
//Pulse

// backend/routes/hotspots.js
import express from "express";
import admin from "firebase-admin";
import db from "../firebase.js";
import { distanceBetween } from "../utils/geo.js";
import fetch from "node-fetch";

const router = express.Router();
console.log("[DEBUG] hotspots route initialized");

/*DBSCAN clustering */
function dbscan(points, epsMeters = 40, minPoints = 3) {
  const clusters = [];
  const visited = new Set();

  function regionQuery(p) {
    return points.filter(q => distanceBetween(p, q) <= epsMeters);
  }

  function expandCluster(p, neighbors, cluster) {
    cluster.push(p);
    for (let i = 0; i < neighbors.length; i++) {
      const n = neighbors[i];
      if (!visited.has(n)) {
        visited.add(n);
        const nNeighbors = regionQuery(n);
        if (nNeighbors.length >= minPoints) {
          for (const nn of nNeighbors) {
            if (!neighbors.includes(nn)) neighbors.push(nn);
          }
        }
      }
      if (!cluster.includes(n)) cluster.push(n);
    }
  }

  for (const p of points) {
    if (visited.has(p)) continue;
    visited.add(p);

    const neighbors = regionQuery(p);
    if (neighbors.length < minPoints) continue;
    const cluster = [];
    clusters.push(cluster);
    expandCluster(p, neighbors, cluster);
  }

  return clusters;
}

/* Reverse-geocode helpers (Google first, Nominatim fallback as this is way easier than to keep adjusting for API change, had issue with google token) */

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || null;

function parseGoogleComponents(components = []) {
  const map = {};
  components.forEach(c => {
    (c.types || []).forEach(t => {
      if (!map[t]) map[t] = c.long_name;
    });
  });
  return map;
}

async function reverseGeocodeServer(lat, lng) {
  // Try Google Geocoding
  if (GOOGLE_API_KEY) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(lat)},${encodeURIComponent(lng)}&key=${encodeURIComponent(GOOGLE_API_KEY)}`;
      const r = await fetch(url);
      if (r.ok) {
        const j = await r.json();
        if (j.status === "OK" && Array.isArray(j.results) && j.results.length) {
          // prefer street/route/premise/neighborhood/locality results
          const preferredTypes = ["street_address", "premise", "subpremise", "route", "establishment", "point_of_interest", "neighborhood", "locality", "postal_town", "sublocality"];
          let chosen = null;
          for (const t of preferredTypes) {
            const m = j.results.find(r => Array.isArray(r.types) && r.types.includes(t));
            if (m) { chosen = m; break; }
          }
          chosen = chosen || j.results[0];
          const comps = parseGoogleComponents(chosen.address_components || []);
          let road = comps.route || comps.street_address || comps.street || null;
          const neighbourhood = comps.neighborhood || comps.sublocality || comps.locality || comps.postal_town || null;
          const locality = comps.locality || comps.administrative_area_level_2 || comps.administrative_area_level_1 || null;
          let displayName = chosen.formatted_address || null;

         //Rocky Point, Clarendon, resole this coordinate
          if (typeof displayName === "string" && /Unnamed/i.test(displayName)) {
            displayName = displayName.replace(/Unnamed/ig, "Rocky Point");
          }
          if (typeof road === "string" && /Unnamed/i.test(road)) {
            road = "Rocky Point";
          }

          return { displayName, road, neighbourhood, locality, raw: chosen };
        }
      }
    } catch (e) {
      console.warn("[reverseGeocodeServer] Google failed:", e?.message || e);
    }
  }

  // Fallback
  try {
    const osmUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&addressdetails=1`;
    const r2 = await fetch(osmUrl, { headers: { "User-Agent": "CampusPulse/1.0 (contact@example.com)" } });
    if (r2.ok) {
      const j2 = await r2.json();
      if (j2) {
        const a = j2.address || {};
        let road = a.road || a.residential || a.cycleway || a.pedestrian || null;
        const neighbourhood = a.neighbourhood || a.suburb || a.town || a.village || a.city || null;
        const locality = a.city || a.county || a.state || null;
        let displayName = j2.display_name || null;

        if (typeof displayName === "string" && /Unnamed/i.test(displayName)) {
          displayName = displayName.replace(/Unnamed/ig, "Rocky Point");
        }
        if (typeof road === "string" && /Unnamed/i.test(road)) {
          road = "Rocky Point";
        }

        return { displayName, road, neighbourhood, locality, raw: j2 };
      }
    }
  } catch (e) {
    console.warn("[reverseGeocodeServer] Nominatim failed:", e?.message || e);
  }

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

// Try small nearby offsets to find other nearby road names (cheap: few reverse-geocodes(search algo))
async function findNearbyRoadVariants(lat, lng, primaryRoad) {
  // deltas cover around +/- 60-120m depending on latitude; increase if needed
  const deltas = [
    [0.0006, 0], [-0.0006, 0], [0, 0.0006], [0, -0.0006], [0.0006, 0.0003], [-0.0006, -0.0003]
  ];
  const found = new Set();
  for (const [dLat, dLng] of deltas) {
    try {
      const r = await reverseGeocodeServer(lat + dLat, lng + dLng);
      if (!r) continue;
      const candidate = r.road || extractStreetFromDisplayName(r.displayName) || r.neighbourhood || null;
      if (candidate && (!primaryRoad || candidate.toLowerCase() !== String(primaryRoad).toLowerCase())) {
        found.add(candidate);
        if (found.size >= 3) break;
      }
    } catch (err) {
      // ignore single failures
    }
  }
  return Array.from(found);
}

/* Gemini or OpenAI call helper (unchanged, used only as fallback) */
async function callGeminiForHotspots(hotspots) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set for Gemini/OpenAI requests");

  // Build a compact prompt using the resolved area/primaryRoad info if available
  const messages = hotspots.map(h => {
    const area = h.areaName || h.sampleLocationName || `${h.centroid.lat.toFixed(4)},${h.centroid.lng.toFixed(4)}`;
    const primary = h.primaryRoad || "";
    const nearbyVariants = (h.nearbyRoadVariants || []).slice(0,3).join(", ");
    return {
      role: "user",
      content:
        `Hotspot id:${h.id} at ${area} (centroid ${h.centroid.lat.toFixed(4)},${h.centroid.lng.toFixed(4)}). ` +
        `PrimaryRoad:"${primary}". NearbyCandidates:"${nearbyVariants}". ${h.count} events. ` +
        `Output JSON object with id, summary (<=18 words), recommendation (pattern: "Avoid AREA; take ALT instead." <=10 words), alternativeRoute (ALT).`
    };
  });

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a concise campus safety assistant. Return only valid JSON array." },
        ...messages
      ],
      max_tokens: 360,
      temperature: 0.2
    })
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Gemini/OpenAI error ${resp.status}: ${txt}`);
  }

  const data = await resp.json();
  return data;
}

/* GET /hotspots  */
router.get("/", async (req, res) => {
  try {
    const timeWindowHours = Number(req.query.timeWindowHours) || 72;
    const epsMeters = Number(req.query.epsMeters) || 400;
    const minPoints = 3; // 3 events to form a hotspot
    const chunkSize = Number(req.query.chunkSize) || 10;

    const windowStart = new Date(Date.now() - timeWindowHours * 3600 * 1000);
    console.log(`[hotspots] params: timeWindowHours=${timeWindowHours}, epsMeters=${epsMeters}, minPoints=${minPoints}`);

    // Fetch alerts
    const alertsRef = db.collection("alerts");
    const snap = await alertsRef
      .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(windowStart))
      .get();

    const rawAlerts = [];
    snap.forEach(d => rawAlerts.push({ id: d.id, ...d.data() }));

    if (!rawAlerts.length) return res.json({ hotspots: [] });

    // Filter geolocated alerts
    const points = rawAlerts.filter(a => a.location?.lat && a.location?.lng)
      .map(a => {
        const ts = a.createdAt || a.timestamp || a.time;
        let createdAtMs = Date.now();
        if (ts) {
          if (typeof ts.toDate === "function") createdAtMs = ts.toDate().getTime();
          else if (ts instanceof Date) createdAtMs = ts.getTime();
          else if (typeof ts === "number") createdAtMs = ts;
        }
        return {
          lat: Number(a.location.lat),
          lng: Number(a.location.lng),
          type: a.type || "unknown",
          severity: Number(a.severity || 1),
          createdAtMs,
          locationName: a.locationName || null,
          id: a.id
        };
      });

    if (!points.length) return res.json({ hotspots: [] });

    // Run clustering
    const clusters = dbscan(points, epsMeters, minPoints);
    console.log(`[hotspots] clusters found: ${clusters.length}`);

    // Build hotspots asynchronously so we can reverse-geocode centroid for each cluster
    const hotspots = await Promise.all(clusters.map(async (cluster, idx) => {
      const count = cluster.length;
      const avgLat = cluster.reduce((s, p) => s + p.lat, 0) / count;
      const avgLng = cluster.reduce((s, p) => s + p.lng, 0) / count;
      const types = {};
      cluster.forEach(p => (types[p.type] = (types[p.type] || 0) + 1));
      const sampleType = Object.entries(types).sort((a,b)=>b[1]-a[1])[0]?.[0] || "unknown";
      const sampleLocationName = cluster.map(p=>p.locationName).find(Boolean) || null;
      const severity = Math.round(cluster.reduce((s,p)=>s+Number(p.severity||1),0)/count*10)/10;
      const lastSeen = new Date(Math.max(...cluster.map(p=>p.createdAtMs))).toISOString();

      // centroid
      const centroid = { lat: avgLat, lng: avgLng };

      // Resolve centroid place/road (cheap: 1 reverse geocode)
      let resolved = null;
      try {
        resolved = await reverseGeocodeServer(centroid.lat, centroid.lng).catch(()=>null);
      } catch (e) { resolved = null; }

      const areaName = resolved?.displayName || sampleLocationName || null;
      const primaryRoad = resolved?.road || extractStreetFromDisplayName(areaName) || null;

      // Find nearby adjacent roads (a few small reverse-geocodes)
      let nearbyRoadVariants = [];
      try {
        nearbyRoadVariants = await findNearbyRoadVariants(centroid.lat, centroid.lng, primaryRoad);
      } catch (e) { nearbyRoadVariants = []; }

      // Pick first suitable alternate that is not equal to primary
      const alternate = nearbyRoadVariants.find(v => v && (!primaryRoad || v.toLowerCase() !== String(primaryRoad).toLowerCase())) || null;

      // Heuristic recommendation (always populate so UI sees it)
      let recommendation = null;
      let alternativeRoute = null;
      if (alternate) {
        // If primary is a road/address, avoid that; otherwise avoid areaName
        if (primaryRoad) {
          recommendation = `Avoid ${primaryRoad}; take ${alternate} instead.`;
        } else if (areaName) {
          // try to pick a short area name for message (avoid huge displayName)
          const shortArea = (areaName.length > 60) ? (resolved?.neighbourhood || sampleLocationName || `coords ${centroid.lat.toFixed(4)},${centroid.lng.toFixed(4)}`) : areaName;
          recommendation = `Avoid ${shortArea}; take ${alternate} instead.`;
        } else {
          recommendation = `Avoid this area; take ${alternate} instead.`;
        }
        alternativeRoute = alternate;
      } else {
        // No variant found leave for LLM fallback, but still give a minimal heuristic
        const shortArea = areaName && areaName.length > 60 ? (resolved?.neighbourhood || sampleLocationName || `coords ${centroid.lat.toFixed(4)},${centroid.lng.toFixed(4)}`) : areaName;
        recommendation = `Avoid ${shortArea || `coords ${centroid.lat.toFixed(4)},${centroid.lng.toFixed(4)}`}; choose a nearby main road.`;
        alternativeRoute = null; // indicates we may want LLM to produce a precise alt
      }

      // Ensure UI visible summary and heading flag
      const summaryLabel = (areaName && areaName.length > 0) ? `${areaName} reported ${count} recent incident(s)` : `${centroid.lat.toFixed(4)}, ${centroid.lng.toFixed(4)} reported ${count} recent incident(s)`;

      return {
        id: `cluster_${idx}`,
        centroid,
        count,
        severity,
        sampleType,
        sampleLocationName,
        lastSeen,
        rawPoints: cluster,
        areaName,
        primaryRoad,
        nearbyRoadVariants,
        alternativeRoute,     
        recommendation,       
        summary: summaryLabel,
        summaryHeading: "Hotspot summary",
        summaryVisible: true
      };
    }));

    // Write latest hotspots immediately for frontend (so UI won't be greyed out)
    const latestRef = db.collection("hotspots").doc("latest");
    await latestRef.set({ createdAt: admin.firestore.FieldValue.serverTimestamp(), hotspots }, { merge: true });

    // Snapshot doc
    const snapshotRef = db.collection("hotspots_snapshots").doc(`snapshot-${Date.now()}`);
    await snapshotRef.set({ createdAt: admin.firestore.FieldValue.serverTimestamp(), hotspots }, { merge: true });

    // Return the immediate heuristic results to front-end (no need to wait for LLM)
    res.json({ hotspots });

    // Background: generate Gemini/OpenAI summaries for any remaining hotspots 
    (async () => {
      try {
        const META_DOC_ID = "meta";
        const SUMMARY_MIN_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
        const metaRef = db.collection("hotspots").doc(META_DOC_ID);
        const metaSnap = await metaRef.get();
        const lastMs = metaSnap.exists && metaSnap.data().lastSummariesAt?.toDate
          ? metaSnap.data().lastSummariesAt.toDate().getTime()
          : 0;
        const nowMs = Date.now();
        if (nowMs - lastMs < SUMMARY_MIN_INTERVAL_MS) return;

        await metaRef.set({ lastSummariesAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

        // Chunk hotspots for Gemini/OpenAI, but only include those with no alternativeRoute (heuristic failed to find an exact adjoining road)
        for (let i = 0; i < hotspots.length; i += chunkSize) {
          const chunk = hotspots.slice(i, i + chunkSize);

          // filter to ones where alternativeRoute is null (we want Gemini to suggest a specific adjoining road/town)
          const needAi = chunk.filter(h => !h.alternativeRoute);
          if (!needAi.length) {
            console.log(`[summaries] chunk ${i}-${i+chunk.length-1} skipped (no AI needed)`);
            continue;
          }

          try {
            const geminiResp = await callGeminiForHotspots(needAi);
            const aiText = geminiResp.choices?.[0]?.message?.content || "";
            const first = aiText.indexOf("[");
            const last = aiText.lastIndexOf("]");
            const jsonText = first !== -1 && last !== -1 ? aiText.slice(first, last + 1) : aiText;
            let parsed = JSON.parse(jsonText);

            if (!Array.isArray(parsed)) continue;

            // Map by id
            const mapById = {};
            parsed.forEach(p => { if (p?.id) mapById[p.id] = p; });

            // Update latest doc with AI improved text
            const latestSnap = await latestRef.get();
            const latestData = latestSnap.exists ? latestSnap.data() : { hotspots: [] };
            const updatedLatest = (Array.isArray(latestData.hotspots) ? latestData.hotspots : []).map(h => {
              if (mapById[h.id]) {
                return {
                  ...h,
                  summary: mapById[h.id].summary || h.summary,
                  recommendation: mapById[h.id].recommendation || h.recommendation,
                  alternativeRoute: mapById[h.id].alternativeRoute || h.alternativeRoute
                };
              }
              return h;
            });
            await latestRef.set({ hotspots: updatedLatest }, { merge: true });

            // Append to snapshot
            for (const it of parsed) {
              const obj = { id: it.id, summary: it.summary, recommendation: it.recommendation, alternativeRoute: it.alternativeRoute, ts: new Date().toISOString() };
              await snapshotRef.update({ hotspots: admin.firestore.FieldValue.arrayUnion(obj) }).catch(async () => {
                await snapshotRef.set({ createdAt: admin.firestore.FieldValue.serverTimestamp(), hotspots: [obj] }, { merge: true });
              });
            }

            console.log(`[summaries] Gemini chunk (${i}..${i+chunk.length-1}) processed`);
          } catch (err) {
            console.warn("[summaries] Gemini chunk failed:", err?.message || err);
          }
        }
      } catch (err) {
        console.warn("[summaries] background process failed:", err?.message || err);
      }
    })();

  } catch (err) {
    console.error("[hotspots] error:", err);
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
