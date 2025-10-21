//October 19, 2025
//Pulse


import React, { useState, useEffect } from "react";
import { sendAlert } from "../services/alertsServices.js";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom"; // << import useNavigate

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

function withTimeout(promise, ms = 10000, msg = "Timeout") {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms))
  ]);
}

export default function EmergencyButton() {
  const [sending, setSending] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const navigate = useNavigate(); // << initialize navigate

  useEffect(() => {
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
      if (!authUser) {
        console.log("No auth user yet — waiting 1s for possible anon sign-in...");
        await new Promise((res) => setTimeout(res, 1000));
      }
      const userAfterWait = getAuth().currentUser;
      console.log("Sending alert as user:", userAfterWait ? userAfterWait.uid : "NOT_AUTHENTICATED");

      let coords = null;
      try {
        coords = await getCurrentPositionPromise({ enableHighAccuracy: true }, 10000);
      } catch (err) {
        console.warn("Geolocation failed:", err);
        if (err && err.code === 1) alert("Location permission was denied. Please enable location or continue without location.");
      }

      let locationName = null;
      if (coords) {
        try {
          locationName = await withTimeout(reverseGeocode(coords.lat, coords.lng), 8000, "Reverse geocode timed out");
        } catch (rgErr) {
          console.warn("Reverse geocode error:", rgErr);
          locationName = null;
        }
      }

      const user = getAuth().currentUser;
      const payload = {
        type: "threat",
        location: coords,
        locationName: locationName,
        reportedBy: user ? user.uid : null
      };

      if (!user) console.warn("No authenticated user when sending alert. Firestore may reject the write if rules require auth.");

      await withTimeout(sendAlert(payload), 10000, "sendAlert timed out");

      console.log("Alert sent", payload);
      alert("Alert sent successfully.");

      // << Navigate to the Contact Emergency page after sending alert
      navigate("/contact-emergency");

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
      {sending ? "Sending..." : "SOS"}
    </button>
  );
}
