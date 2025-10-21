//October 19, 2025
//Pulse

import express from "express";

const router = express.Router();
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || null;

// this helper parses Google address components into a map
function parseGoogleComponents(components = []) {
  const map = {};
  components.forEach(c => {
    (c.types || []).forEach(t => {
      if (!map[t]) map[t] = c.long_name;
    });
  });
  return map;
}


function sanitizeUnnamed(displayName, road, addressObj = {}) {
  let dn = displayName;
  let r = road;
  if (typeof dn === "string" && /Unnamed/i.test(dn)) {
    // prefer any usable address fields in addressObj
    const fallback =
      addressObj.village ||
      addressObj.town ||
      addressObj.hamlet ||
      addressObj.suburb ||
      addressObj.neighbourhood ||
      addressObj.county ||
      "Rocky Point";
    dn = dn.replace(/Unnamed Road/ig, fallback).replace(/Unnamed/ig, fallback);
  }
  if (typeof r === "string" && /Unnamed/i.test(r)) {
    r = addressObj.village || addressObj.town || "Rocky Point";
  }
  return { displayName: dn, road: r };
}

async function reverseGeocodeServer(lat, lng) {
  // try Google Geocoding first when key present
  if (GOOGLE_API_KEY) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(lat)},${encodeURIComponent(lng)}&key=${encodeURIComponent(GOOGLE_API_KEY)}`;
      const r = await fetch(url);
      if (r.ok) {
        const j = await r.json();
        if (j.status === "OK" && Array.isArray(j.results) && j.results.length) {
          // prefer a result with a street/route/premise/neighborhood or fallback to first
          const preferredTypes = ["street_address","premise","subpremise","route","establishment","point_of_interest","neighborhood","locality","postal_town","sublocality"];
          let chosen = null;
          for (const t of preferredTypes) {
            const m = j.results.find(rr => Array.isArray(rr.types) && rr.types.includes(t));
            if (m) { chosen = m; break; }
          }
          chosen = chosen || j.results[0];

          const comps = parseGoogleComponents(chosen.address_components || []);
          const road = comps.route || comps.street_address || comps.street || null;
          const neighbourhood = comps.neighborhood || comps.sublocality || comps.locality || comps.postal_town || null;
          const locality = comps.locality || comps.administrative_area_level_2 || comps.administrative_area_level_1 || null;
          let displayName = chosen.formatted_address || null;

          // sanitize "Unnamed"
          const sanitized = sanitizeUnnamed(displayName, road, comps);
          displayName = sanitized.displayName;
          const sanitizedRoad = sanitized.road;

          return { provider: "google", displayName, road: sanitizedRoad, neighbourhood, locality, raw: chosen };
        }
      } else {
        // thee keep trying fallback
        const txt = await r.text().catch(() => "");
        console.warn("[geocode] Google responded non-ok:", r.status, txt);
      }
    } catch (err) {
      console.warn("[geocode] Google geocode error:", err?.message || err);
    }
  }

  // fallback: Nominatim (OpenStreetMap)
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&addressdetails=1`;
    const r2 = await fetch(url, { headers: { "User-Agent": "CampusPulse/1.0 (contact@example.com)" } });
    if (r2.ok) {
      const j2 = await r2.json();
      const address = j2.address || {};
      const road = address.road || address.residential || address.cycleway || address.pedestrian || null;
      const neighbourhood = address.neighbourhood || address.suburb || address.village || address.hamlet || address.town || address.city || null;
      const locality = address.city || address.county || address.state || null;
      let displayName = j2.display_name || (neighbourhood ? `${neighbourhood}, ${locality || ""}`.trim() : null);

      // sanitize "Unnamed"
      const sanitized = sanitizeUnnamed(displayName, road, address);
      displayName = sanitized.displayName;
      const sanitizedRoad = sanitized.road;

      return { provider: "nominatim", displayName, road: sanitizedRoad, neighbourhood, locality, raw: j2 };
    } else {
      const txt = await r2.text().catch(() => "");
      console.warn("[geocode] Nominatim responded non-ok:", r2.status, txt);
    }
  } catch (err) {
    console.warn("[geocode] Nominatim error:", err?.message || err);
  }

  return null;
}

// GET /api/reverse-geocode?lat=...&lng=...
router.get("/reverse-geocode", async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: "lat and lng query params required (numbers)" });
    }

    const result = await reverseGeocodeServer(lat, lng);
    if (!result) return res.status(500).json({ error: "reverse geocode failed" });

    return res.json(result);
  } catch (err) {
    console.error("[geocode] error:", err);
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
