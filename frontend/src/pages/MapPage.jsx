
import React from "react";
import { Link } from "react-router-dom";
import MapView from "../components/MapView.jsx";
import AlertsFeed from "../components/AlertsFeed.jsx";
import "./MapPage.css";

export default function MapPage() {
  return (
    <div className="map-screen">
      <Link to="/" className="home-badge" title="Return to Home">🔴</Link>

      <div className="header">
        <h1 className="glow-title">Map</h1>
        <div className="siren" />
      </div>

      <div className="center-wrapper">
        <div className="map-wrapper">
          <MapView />
        </div>

        <div className="feed-wrapper">
          <AlertsFeed />
        </div>
      </div>
    </div>
  );
}
