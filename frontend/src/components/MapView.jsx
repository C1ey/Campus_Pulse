// File: src/components/MapView.jsx
import React, { useState, useEffect } from "react";
import { GoogleMap, Marker, useLoadScript, HeatmapLayer } from "@react-google-maps/api";
import useAlerts from "/Users/Cley/campus-pulse/frontend/src/hooks/useAlerts.js";

export default function MapView({ userPos }) {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: "AIzaSyC8ibsuh1rUksnXY6JQYhDV86YXltlsuik", // replace in prod or move to env
    libraries: ["visualization"],
  });
  const alerts = useAlerts();
  const [pos, setPos] = useState(userPos || null);

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

  if (!isLoaded) return <div className="map-loading">Loading map...</div>;

  // build heatmap only from alerts that have numeric lat/lng
  const heatmapData = alerts
    .filter(a => typeof a.location?.lat === "number" && typeof a.location?.lng === "number")
    .map(a => ({
      location: new window.google.maps.LatLng(a.location.lat, a.location.lng),
      weight: 1,
    }));

  return (
    <GoogleMap
      mapContainerClassName="google-map-container"
      center={pos || { lat: 18, lng: -20 }}
      zoom={2}
      options={{
        fullscreenControl: false,
        streetViewControl: false,
        mapTypeControl: false,
      }}
    >
      {alerts
        .filter(a => typeof a.location?.lat === "number" && typeof a.location?.lng === "number")
        .map(a => {
          // Build display place for marker title
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

      {heatmapData.length > 0 && <HeatmapLayer data={heatmapData} />}
    </GoogleMap>
  );
}
