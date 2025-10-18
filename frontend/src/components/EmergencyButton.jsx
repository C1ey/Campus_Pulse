// File: src/components/EmergencyButton.jsx
import React, { useState, useEffect } from "react";
import { sendAlert } from "/Users/Cley/campus-pulse/frontend/src/services/alertsServices.js";
import { getAuth, onAuthStateChanged } from "firebase/auth";

/* Geolocation with timeout (unchanged) */
function getCurrentPositionPromise(options = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Geolocation timeout")), timeoutMs);
    if (!navigator.geolocation) {
      clearTimeout(timer);
      return reject(new Error("Geolocation not supported"));
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(timer); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      (err) => { clearTimeout(timer); reject(err); },
      options
    );
  });
}

/* Reverse geocode (unchanged) */
async function reverseGeocode(lat, lng) {
  const googleKey = process.env.REACT_APP_GOOGLE_GEOCODING_API_KEY;
  if (googleKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${googleKey}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Google geocode network error");
      const json = await res.json();
      if (json.status === "OK" && json.results && json.results.length) {
        const best = json.results.find(r =>
          r.types && (r.types.includes("point_of_interest") || r.types.includes("establishment"))
        ) || json.results[0];
        return best.formatted_address || null;
      }
    } catch (err) {
      console.warn("Google reverse geocode failed:", err);
      // fall through to Nominatim
    }
  }

  try {
    const endpoint = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
    const r = await fetch(endpoint, { headers: { "Accept": "application/json", "Referer": window.location.origin }});
    if (!r.ok) throw new Error("Nominatim failed");
    const j = await r.json();
    return j.name || j.display_name || null;
  } catch (err) {
    console.warn("Nominatim reverse geocode failed:", err);
    return null;
  }
}

/* wrap promise with timeout (unchanged) */
function withTimeout(promise, ms = 10000, msg = "Timeout") {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms))
  ]);
}

export default function EmergencyButton() {
  const [sending, setSending] = useState(false);
  const [authUser, setAuthUser] = useState(null);

  useEffect(() => {
    // Track auth state so we can log it and wait briefly if needed.
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUser(u);
      console.log("Auth state changed:", u ? { uid: u.uid, isAnonymous: u.isAnonymous } : null);
    });
    return () => unsub();
  }, []);

  async function handleClick() {
    setSending(true);

    try {
      // If your app performs anonymous sign-in at startup, allow a short window
      // for it to complete before sending. If no auth is present after the wait,
      // we still continue but will log it.
      if (!authUser) {
        console.log("No auth user yet — waiting 1s for possible anon sign-in...");
        await new Promise((res) => setTimeout(res, 1000));
      }
      const userAfterWait = getAuth().currentUser;
      console.log("Sending alert as user:", userAfterWait ? userAfterWait.uid : "NOT_AUTHENTICATED");

      // 1) get coords (10s)
      let coords = null;
      try {
        coords = await getCurrentPositionPromise({ enableHighAccuracy: true }, 10000);
      } catch (err) {
        console.warn("Geolocation failed:", err);
        // If permission denied, give a clearer hint to the user
        if (err && err.code === 1) {
          // PERMISSION_DENIED
          alert("Location permission was denied. Please enable location in your browser/site settings or continue without location.");
        }
        // proceed with null coords (we still allow server to handle)
      }

      // 2) reverse geocode (8s) if coords present
      let locationName = null;
      if (coords) {
        try {
          locationName = await withTimeout(reverseGeocode(coords.lat, coords.lng), 8000, "Reverse geocode timed out");
        } catch (rgErr) {
          console.warn("Reverse geocode error:", rgErr);
          locationName = null;
        }
      }

      // 3) build payload - ensure reportedBy is set from actual auth user if available
      const user = getAuth().currentUser;
      const payload = {
        type: "threat",
        location: coords,             // {lat,lng} or null
        locationName: locationName,   // human-readable string or null
        reportedBy: user ? user.uid : null
      };

      // If your Firestore create rule requires request.auth.uid == request.resource.data.reportedBy
      // and there is no auth user, the write will be rejected. Log a clear message.
      if (!user) {
        console.warn("No authenticated user when sending alert. Firestore may reject the write if rules require auth.");
      }

      // 4) send to backend / firestore with timeout (10s)
      await withTimeout(sendAlert(payload), 10000, "sendAlert timed out");

      console.log("Alert sent", payload);
      alert("Alert sent successfully.");
    } catch (err) {
      console.error("Failed to send alert:", err);
      alert("Failed to send alert: " + (err.message || err));
    } finally {
      setSending(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      className="emergency-btn"
      aria-label="Send emergency alert"
      disabled={sending}
    >
      {sending ? "Sending..." : "PULSE"}
    </button>
  );
}
