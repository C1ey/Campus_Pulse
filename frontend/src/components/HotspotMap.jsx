//October 19, 2025
//Pulse + AI


import React, { useEffect, useState, useRef } from "react";
import {
  GoogleMap,
  Circle,
  Marker,
  InfoWindow,
  useLoadScript
} from "@react-google-maps/api";

/**
 * - Fetch hotspots from /hotspots endpoint (backend)
 * - Draws circles + marker for each hotspot
 * - Shows InfoWindow with AI-generated summary when available
 *
 * ENV:
 * - VITE_BACKEND_URL (optional) -> base URL for backend, e.g. http://localhost:5001
 * - VITE_GOOGLE_MAPS_KEY (optional) -> Google Maps API key for useLoadScript
 *
 * Usage:
 * <HotspotMap center={{ lat: 17.7680, lng: -77.2382 }} />
 */
export default function HotspotMap({ center = { lat: 17.7680, lng: -77.2382 } }) {
  const [hotspots, setHotspots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeHotspot, setActiveHotspot] = useState(null);
  const mapRef = useRef(null);

  // Load Google Maps JS (use Vite env var or fallback)
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY || "Insert Key Here and keep quotes",
    libraries: ["visualization"],
  });

  const base = import.meta.env.VITE_BACKEND_URL || "";

  async function fetchHotspots() {
    setLoading(true);
    try {
      const res = await fetch(`${base}/hotspots?timeWindowHours=72&epsMeters=200&minPoints=4`);
      if (!res.ok) {
        console.warn("Failed to fetch hotspots:", res.status, await res.text());
        setHotspots([]);
        setLoading(false);
        return;
      }
      const json = await res.json();
      const hs = (json.hotspots || []).filter(h =>
        h && h.centroid && typeof h.centroid.lat === "number" && typeof h.centroid.lng === "number"
      );
      setHotspots(hs);




      // Auto-fit map bounds to hotspots + center
      if (mapRef.current && hs.length) {
        const bounds = new window.google.maps.LatLngBounds();
        hs.forEach(h => bounds.extend(h.centroid));
        if (center) bounds.extend(center);
        mapRef.current.fitBounds(bounds);
      }
    } catch (err) {
      console.warn("Error fetching hotspots:", err);
      setHotspots([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchHotspots();
    const iv = setInterval(fetchHotspots, 5 * 60 * 1000); // refresh every 5 minutes
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // helpers for visuals
  function hotspotColor(h) {
    if (typeof h.severity === "string") {
      if (h.severity === "severe") return "#c62828";
      if (h.severity === "moderate") return "#ef6c00";
      return "#fbc02d";
    }
    const s = Number(h.severity || 0);
    if (s > 10) return "#c62828";
    if (s > 5) return "#ef6c00";
    return "#fbc02d";
  }

  function hotspotRadius(h) {
    if (typeof h.radiusMeters === "number") return h.radiusMeters;
    // scale by count
    const base = Math.max(80, Math.min(2500, (h.count || 1) * 120));
    return base;
  }

  if (loadError) return <div className="map-error">Failed to load Google Maps.</div>;
  if (!isLoaded) return <div className="map-loading">Loading map...</div>;

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 8 }}>
        <button
          onClick={fetchHotspots}
          disabled={loading}
          style={{ padding: "6px 10px", borderRadius: 6, cursor: "pointer" }}
          title="Refresh hotspots"
        >
          {loading ? "Refreshing..." : "Refresh Hotspots"}
        </button>
        <div style={{ alignSelf: "center", color: "#666", fontSize: 13 }}>
          {hotspots.length} hotspots
        </div>
      </div>

      <GoogleMap
        zoom={center ? 13 : 2}
        center={center}
        mapContainerStyle={{ width: "100%", height: "600px" }}
        onLoad={map => (mapRef.current = map)}
        options={{ fullscreenControl: false, streetViewControl: false, mapTypeControl: false }}
      >
        {hotspots.map(h => {
          const centerPt = { lat: h.centroid.lat, lng: h.centroid.lng };
          const radius = hotspotRadius(h);
          const color = hotspotColor(h);
          return (
            <React.Fragment key={h.id}>
              <Circle
                center={centerPt}
                radius={radius}
                options={{
                  fillColor: color,
                  fillOpacity: 0.18,
                  strokeColor: color,
                  strokeOpacity: 0.95,
                  strokeWeight: 2,
                  zIndex: 1000,
                }}
                onClick={() => setActiveHotspot(h)}
              />
              <Marker
                position={centerPt}
                label={{
                  text: String(h.count || ""),
                  color: "white",
                  fontSize: "12px",
                  fontWeight: "bold"
                }}
                onClick={() => setActiveHotspot(h)}
                title={h.sampleLocationName || `Hotspot — ${h.count} alerts`}
              />
            </React.Fragment>
          );
        })}

        {/* InfoWindow for selected hotspot */}
        {activeHotspot && (
          <InfoWindow
            position={{ lat: activeHotspot.centroid.lat, lng: activeHotspot.centroid.lng }}
            onCloseClick={() => setActiveHotspot(null)}
          >
            <div style={{ minWidth: 220 }}>
              <strong style={{ display: "block", marginBottom: 6 }}>
                {activeHotspot.sampleLocationName || "Hotspot"}
              </strong>

              {/* show AI summary if available; otherwise show details + hint */}
              {activeHotspot.summary ? (
                <div style={{ fontStyle: "italic", marginBottom: 6 }}>{activeHotspot.summary}</div>
              ) : (
                <>
                  <div>Alerts: <strong>{activeHotspot.count}</strong></div>
                  {activeHotspot.sampleType && <div>Type: {activeHotspot.sampleType}</div>}
                  {activeHotspot.lastSeen && <div>Last: {new Date(activeHotspot.lastSeen).toLocaleString()}</div>}
                  <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>
                    Summary: {activeHotspot.summary === null ? "None available" : "Pending — refresh shortly"}
                  </div>
                </>
              )}
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  );
}
