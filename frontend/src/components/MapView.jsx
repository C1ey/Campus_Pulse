

import "./MapPopup.css"; // make sure this is imported

import React, { useState, useEffect, useRef } from "react";
import {
  GoogleMap,
  Marker,
  Circle,
  useLoadScript,
  HeatmapLayer,
  InfoWindow
} from "@react-google-maps/api";
import useAlerts from "../frontend/src/hooks/useAlerts.js";

export default function MapView({ userPos }) {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY || "Insert key, keep quotes",
    libraries: ["visualization"],
  });

  const alerts = useAlerts();

  const [pos, setPos] = useState(userPos || null);
  const [hotspots, setHotspots] = useState([]);
  const [activeHotspot, setActiveHotspot] = useState(null);
  const [loadingHotspots, setLoadingHotspots] = useState(false);
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

  useEffect(() => {
    let mounted = true;
    const base = import.meta.env.VITE_BACKEND_URL || "";

    async function fetchHotspots() {
      setLoadingHotspots(true);
      try {
        const res = await fetch(`${base}/hotspots?timeWindowHours=72&epsMeters=200&minPoints=4`);
        if (!res.ok) {
          console.warn("Failed to fetch hotspots:", res.status, await res.text());
          setHotspots([]);
          return;
        }
        const json = await res.json();
        const hs = (json.hotspots || []).filter(h =>
          h && h.centroid && typeof h.centroid.lat === "number" && typeof h.centroid.lng === "number"
        );
        if (mounted) setHotspots(hs);

        if (mounted && mapRef.current && hs.length) {
          const bounds = new window.google.maps.LatLngBounds();
          hs.forEach(h => bounds.extend(h.centroid));
          if (pos) bounds.extend(pos);
          mapRef.current.fitBounds(bounds);
        }
      } catch (err) {
        console.warn("Error fetching hotspots:", err);
        setHotspots([]);
      } finally {
        setLoadingHotspots(false);
      }
    }

    fetchHotspots();
    const iv = setInterval(fetchHotspots, 30 * 1000);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, [pos]);

  if (!isLoaded) return <div className="map-loading">Loading map...</div>;

  const heatmapData = alerts
    .filter(a => typeof a.location?.lat === "number" && typeof a.location?.lng === "number")
    .map(a => ({
      location: new window.google.maps.LatLng(a.location.lat, a.location.lng),
      weight: 1,
    }));

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
    if (h.radiusMeters && typeof h.radiusMeters === "number") return h.radiusMeters;
    return Math.max(100, Math.min(2500, (h.count || 1) * 120));
  }

  return (
    <div style={{ width: "100%" }}>
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
        style={{ height: "600px", width: "100%" }}
      >
        {/* Alerts */}
        {alerts
          .filter(a => typeof a.location?.lat === "number" && typeof a.location?.lng === "number")
          .map(a => (
            <Marker
              key={a.id}
              position={{ lat: a.location.lat, lng: a.location.lng }}
              label={a.type}
              title={a.locationName || `${a.location.lat.toFixed(4)}, ${a.location.lng.toFixed(4)}`}
            />
          ))}

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

        {/* Hotspot circles + markers */}
        {hotspots.map(h => (
          <React.Fragment key={h.id}>
            <Circle
              center={h.centroid}
              radius={hotspotRadius(h)}
              options={{
                fillColor: hotspotColor(h),
                fillOpacity: 0.18,
                strokeColor: hotspotColor(h),
                strokeOpacity: 0.9,
                strokeWeight: 2,
                zIndex: 1000,
                clickable: true,
              }}
              onClick={() => setActiveHotspot(h)}
            />
            <Marker
              position={h.centroid}
              label={{
                text: String(h.count || ""),
                color: "white",
                fontSize: "12px",
                fontWeight: "bold"
              }}
              onClick={() => setActiveHotspot(h)}
              title={h.sampleLocationName || `Hotspot — ${h.count}`}
            />
          </React.Fragment>
        ))}

        {/* InfoWindow (dark + transparent) */}
        {activeHotspot && (
          <InfoWindow
            position={activeHotspot.centroid}
            onCloseClick={() => setActiveHotspot(null)}
          >
            <div style={{ minWidth: 240 }} className="gm-style-iw">
              <strong>
                {activeHotspot.areaName
                  ? (activeHotspot.areaName.length > 80 ? (activeHotspot.sampleLocationName || activeHotspot.areaName) : activeHotspot.areaName)
                  : (activeHotspot.sampleLocationName || "Hotspot")}
              </strong>

              <div style={{ marginTop: 6 }}>
                <div>Alerts: {activeHotspot.count}</div>
                {activeHotspot.sampleType && <div>Type: {activeHotspot.sampleType}</div>}
                {activeHotspot.lastSeen && <div>Last: {new Date(activeHotspot.lastSeen).toLocaleString()}</div>}
                {activeHotspot.trendScore !== undefined && <div>Trend: {activeHotspot.trendScore}</div>}
              </div>

              {activeHotspot.recommendation && (
                <div className="recommendation">
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Recommendation</div>
                  <div>{activeHotspot.recommendation}</div>
                  {activeHotspot.alternativeRoute && (
                    <div style={{ marginTop: 6, fontSize: 13, color: "#fff" }}>
                      Alternative: <strong>{activeHotspot.alternativeRoute}</strong>
                    </div>
                  )}
                </div>
              )}

              {activeHotspot.summary && (
                <div className="summary">
                  {activeHotspot.summaryVisible ? (
                    <>
                      <div style={{ fontWeight: 700 }}>{activeHotspot.summaryHeading || "Hotspot summary"}</div>
                      <div style={{ marginTop: 6 }}>{activeHotspot.summary}</div>
                    </>
                  ) : (
                    <div>{activeHotspot.summary}</div>
                  )}
                </div>
              )}
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {/* Below-the-map: AI Summaries panel */}
      <div style={{
        marginTop: 12,
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 10,
        alignItems: "start"
      }}>
        <div style={{
          background: "#fff",
          border: "1px solid #e6e6e6",
          borderRadius: 8,
          padding: 12,
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>Hotspot Summaries</strong>
            <div style={{ fontSize: 13, color: "#666" }}>{loadingHotspots ? "Refreshing..." : `${hotspots.length} hotspots`}</div>
          </div>

          <div style={{ marginTop: 8 }}>
            {hotspots.length === 0 && <div style={{ color: "#666" }}>No hotspots detected.</div>}
            {hotspots.map(h => (
              <div key={h.id} style={{ marginBottom: 10, paddingBottom: 8, borderBottom: "1px dashed #eee" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {h.areaName || h.sampleLocationName || `${h.centroid.lat.toFixed(4)}, ${h.centroid.lng.toFixed(4)}`}
                    </div>
                    <div style={{ fontSize: 13, color: "#666" }}>{h.count} alerts • {h.sampleType || "unknown"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, color: "#333" }}>{h.severity}</div>
                    <div style={{ fontSize: 12, color: "#999" }}>{h.trendScore > 0 ? `↑ ${h.trendScore}` : (h.trendScore < 0 ? `↓ ${Math.abs(h.trendScore)}` : "stable")}</div>
                  </div>
                </div>

                <div style={{ marginTop: 8 }}>
                  {h.recommendation ? (
                    <div style={{ background: "#fffbe6", padding: 8, borderRadius: 6, color: "#222", marginBottom: 6 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Recommendation</div>
                      <div>{h.recommendation}</div>
                      {h.alternativeRoute && <div style={{ marginTop: 6, fontSize: 13, color: "#444" }}>Alt: <strong>{h.alternativeRoute}</strong></div>}
                    </div>
                  ) : null}

                  {h.summary ? (
                    <div>
                      {h.summaryVisible ? (
                        <div style={{ background: "#fafafa", padding: 8, borderRadius: 6, color: "#222" }}>
                          <div style={{ fontWeight: 700 }}>{h.summaryHeading || "Hotspot summary"}</div>
                          <div style={{ marginTop: 6 }}>{h.summary}</div>
                        </div>
                      ) : (
                        <div style={{ background: "#fafafa", padding: 8, borderRadius: 6, color: "#222" }}>{h.summary}</div>
                      )}
                    </div>
                  ) : (
                    <div style={{ color: "#999", fontStyle: "italic" }}>Summary pending — refresh will show it when ready.</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
