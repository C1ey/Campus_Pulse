// File: src/pages/Home.jsx
import React from "react";
import { Link } from "react-router-dom";
import EmergencyButton from "/Users/Cley/campus-pulse/frontend/src/components/EmergencyButton.jsx";

export default function Home() {
  const refreshPage = () => window.location.reload();

  return (
    <div className="home-screen">
      {/* use header-left so CSS matches */}
      <div className="header-left">
        <h1 className="glow-title">CAMPUS<br />PULSE</h1>
        <div className="pulse-icon" onClick={refreshPage} title="Refresh">
          🔴
        </div>
      </div>

      <div className="center-area">
        <EmergencyButton />
      </div>

      <div className="side-menu">
        <Link className="side-btn" to="/report">Report Incident</Link>
        <Link className="side-btn" to="/map">Map</Link>
        <Link className="side-btn" to="/contact-emergency">Contact Emergency</Link>
        <Link className="side-btn" to="/recent">Recent Reports</Link>
        <Link className="side-btn" to="/login">Log In</Link>
      </div>
    </div>
  );
}
