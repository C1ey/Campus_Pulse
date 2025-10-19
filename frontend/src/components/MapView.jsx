// File: src/components/MapView.jsx
import React, { useState, useEffect, useRef } from "react";
import {
  GoogleMap,
  Marker,
  Circle,
  useLoadScript,
  HeatmapLayer,
  InfoWindow
} from "@react-google-maps/api";
import useAlerts from "/Users/Cley/campus-pulse/frontend/src/hooks/useAlerts.js";

export default function MapView({ userPos }) {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: "AIzaSyC8ibsuh1rUksnXY6JQYhDV86YXltlsuik", // move to env in prod
    libraries: ["visualization"],
  });

  const alerts = useAlerts();
  const [pos, setPos] = useState(userPos || null);

  // hotspots state & UI
  const [hotspots, setHotspots] = useState([]);
  const [activeHotspot, setActiveHotspot] = useState(null); // for InfoWindow
  const mapRef = useRef(null);

  useEffect(() => {
    if (!userPos && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
        (err) => console.debug("Geolocation error:", err)
      );
    } else {
      setPos(userPos);
    }
  }, [userPos]);

  // fetch hotspots periodically and log them
  useEffect(() => {
    let mounted = true;
    const base = import.meta.env.VITE_BACKEND_URL || ""; // set in .env for dev/prod

    async function fetchHotspots() {
      try {
        const res = await fetch(`${base}/hotspots?timeWindowHours=72&epsMeters=200&minPoints=4`);
        if (!res.ok) {
          console.warn("Failed to fetch hotspots:", res.status, await res.text());
          return;
        }
        const json = await res.json();
        const hs = (json.hotspots || []).filter(h =>
          h && h.centroid && typeof h.centroid.lat === "number" && typeof h.centroid.lng === "number"
        );
        console.log("Hotspots fetched:", hs);
        if (mounted) setHotspots(hs);
        // auto-fit map to hotspots + user
        if (mounted && mapRef.current && hs.length) {
          const bounds = new window.google.maps.LatLngBounds();
          hs.forEach(h => bounds.extend(h.centroid));
          if (pos) bounds.extend(pos);
          mapRef.current.fitBounds(bounds);
        }
      } catch (err) {
        console.warn("Error fetching hotspots:", err);
      }
    }

    fetchHotspots();
    const iv = setInterval(fetchHotspots, 5 * 60 * 1000); // every 5 min
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, [pos]);

  if (!isLoaded) return <div className="map-loading">Loading map...</div>;

  // heatmap from alerts
  const heatmapData = alerts
    .filter(a => typeof a.location?.lat === "number" && typeof a.location?.lng === "number")
    .map(a => ({
      location: new window.google.maps.LatLng(a.location.lat, a.location.lng),
      weight: 1,
    }));

  // color mapping (if severity is string) or numeric
  function hotspotColor(h) {
    // If server uses severity strings
    if (typeof h.severity === "string") {
      if (h.severity === "severe") return "#c62828"; // red
      if (h.severity === "moderate") return "#ef6c00"; // orange
      return "#fbc02d"; // yellow
    }
    // if numeric severity
    const s = Number(h.severity || 0);
    if (s > 10) return "#c62828";
    if (s > 5) return "#ef6c00";
    return "#fbc02d";
  }

  // radius calculation (meters) — adjust multiplier to taste
  function hotspotRadius(h) {
    // if server provides radiusMeters, prefer it
    if (h.radiusMeters && typeof h.radiusMeters === "number") return h.radiusMeters;
    // else scale by count (with clamping)
    const M = Math.max(100, Math.min(2500, (h.count || 1) * 120));
    return M;
  }

  return (
    <GoogleMap
      mapContainerClassName="google-map-container"
      center={pos || { lat: 18, lng: -20 }}
      zoom={pos ? 13 : 2}
      onLoad={map => (mapRef.current = map)}
      options={{
        fullscreenControl: false,
        streetViewControl: false,
        mapTypeControl: false,
      }}
    >
      {/* Alerts markers */}
      {alerts
        .filter(a => typeof a.location?.lat === "number" && typeof a.location?.lng === "number")
        .map(a => {
          const place = a.locationName || a.location?.name || `${a.location.lat.toFixed(4)}, ${a.location.lng.toFixed(4)}`;
          return (
            <Marker
              key={a.id}
              position={{ lat: a.location.lat, lng: a.location.lng }}
              label={a.type}
              title={place}
            />
          );
        })}

      {/* User position */}
      {pos && (
        <Marker
          position={pos}
          icon={{
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 6,
            fillColor: "#222",
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
          }}
          title="Your location"
        />
      )}

      {/* Heatmap */}
      {heatmapData.length > 0 && <HeatmapLayer data={heatmapData} />}

      {/* Hotspot circles & markers */}
      {hotspots.map(h => {
        const center = h.centroid;
        const radius = hotspotRadius(h);
        const color = hotspotColor(h);
        return (
          <React.Fragment key={h.id}>
            <Circle
              center={center}
              radius={radius}
              options={{
                fillColor: color,
                fillOpacity: 0.18,
                strokeColor: color,
                strokeOpacity: 0.9,
                strokeWeight: 2,
                zIndex: 1000,
                clickable: true,
              }}
              onClick={() => setActiveHotspot(h)}
            />
            <Marker
              position={center}
              label={{
                text: String(h.count || ""),
                color: "white",
                fontSize: "12px",
                fontWeight: "bold"
              }}
              onClick={() => setActiveHotspot(h)}
              title={`Hotspot (${h.count} alerts)`}
            />
          </React.Fragment>
        );
      })}

      {/* InfoWindow for clicked hotspot */}
      {activeHotspot && (
        <InfoWindow
          position={activeHotspot.centroid}
          onCloseClick={() => setActiveHotspot(null)}
        >
          <div style={{ minWidth: 180 }}>
            <strong>{activeHotspot.sampleLocationName || "Hotspot"}</strong>
            <div>Alerts: {activeHotspot.count}</div>
            {activeHotspot.sampleType && <div>Type: {activeHotspot.sampleType}</div>}
            {activeHotspot.lastSeen && <div>Last: {new Date(activeHotspot.lastSeen).toLocaleString()}</div>}
            {activeHotspot.severity && <div>Severity: {String(activeHotspot.severity)}</div>}
            {activeHotspot.trendScore !== undefined && <div>Trend: {activeHotspot.trendScore}</div>}
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}