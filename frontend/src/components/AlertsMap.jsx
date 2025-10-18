// File: src/components/AlertsMap.jsx

/*import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { getActiveAlerts } from "../services/alertsService";
import "leaflet/dist/leaflet.css";

function AlertsMap() {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    async function fetchAlerts() {
      const active = await getActiveAlerts();
      setAlerts(active);
    }
    fetchAlerts();

    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <MapContainer
      center={[18.0, -76.8]} // Default: Kingston, Jamaica
      zoom={15}
      style={{ height: "500px", width: "100%" }}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {alerts.map((alert) => (
        <Marker
          key={alert.id}
          position={[alert.location.lat, alert.location.lng]}
        >
          <Popup>{alert.type}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

export default AlertsMap;*/
