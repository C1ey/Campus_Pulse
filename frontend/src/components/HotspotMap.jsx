// frontend/src/components/HotspotMap.jsx
import React, { useEffect, useState } from "react";
import { GoogleMap, Circle, Marker } from "@react-google-maps/api";

export default function HotspotMap({ center }) {
  const [hotspots, setHotspots] = useState([]);

  useEffect(() => {
    async function fetchHotspots() {
      const base = import.meta.env.VITE_BACKEND_URL || "";
      const res = await fetch(`${base}/hotspots?timeWindowHours=72&epsMeters=200&minPoints=4`);
      const json = await res.json();
      setHotspots(json.hotspots || []);
    }
    fetchHotspots();
    const iv = setInterval(fetchHotspots, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(iv);
  }, []);

  return (
    <GoogleMap zoom={13} center={center} mapContainerStyle={{ width: "100%", height: "600px" }}>
      {hotspots.map(h => {
        const radius = Math.max(50, Math.min(2000, h.count * 40)); // visual scaling
        const color = h.trendScore > 0.5 ? "#ff3b30" : (h.severity > 5 ? "#ff9500" : "#ffcc00");
        return (
          <React.Fragment key={h.id}>
            <Circle
              center={h.centroid}
              radius={radius}
              options={{ fillColor: color, fillOpacity: 0.25, strokeOpacity: 0.6, strokeWeight: 1 }}
            />
            <Marker position={h.centroid} label={{
              text: `${h.count}`,
              color: "white",
              fontSize: "12px",
              fontWeight: "bold"
            }} />
          </React.Fragment>
        );
      })}
    </GoogleMap>
  );
}
