// File: src/pages/ReportIncidentPage.jsx
import React, { useState } from "react";
import { sendAlert } from "/Users/Cley/campus-pulse/frontend/alertsService.js";
import { Link, useNavigate } from "react-router-dom";
import "./ReportIncidentPage.css";

export default function ReportIncidentPage() {
  const [type, setType] = useState("");
  const [sending, setSending] = useState(false);
  const [locationText, setLocationText] = useState("");
  const [coords, setCoords] = useState(null);
  const [description, setDescription] = useState("");
  const nav = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setSending(true);

    // If we have coords use them; otherwise try to get them now
    const send = async (loc) => {
      try {
        await sendAlert({
          type: type || "unspecified",
          location: loc,
          description,
          reportedBy: null,
        });
        setSending(false);
        nav("/recent");
      } catch (err) {
        console.error(err);
        setSending(false);
        alert("Failed to send report.");
      }
    };

    if (coords) {
      await send({ lat: coords.lat, lng: coords.lng });
    } else {
      // try to get geolocation
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const l = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCoords(l);
          setLocationText(`${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}`);
          await send(l);
        },
        (err) => {
          console.error(err);
          setSending(false);
          alert("Could not get location. Try allowing location or fill in location manually.");
        }
      );
    }
  }

  function handleUseCurrentLocation() {
    // attempt to get geolocation and fill the input
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const l = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(l);
        setLocationText(`${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}`);
      },
      (err) => {
        console.error(err);
        alert("Unable to get current location. Please allow location access or enter location manually.");
      }
    );
  }

  return (
    <div className="report-incident-page">
     <Link to="/" className="home-badge" title="Return to Home">
    🔴
    </Link>

      <Link to="/" className="back-btn">⬅ Back</Link>

      <div className="header">
        <h1 className="glow-title">Report Incident</h1>
        <div className="siren" title="Emergency">
          {/* simple siren icon — uses inline SVG for crisp look */}
          <svg width="46" height="34" viewBox="0 0 46 34" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M23 2C18 2 10 6 8 12H38C36 6 28 2 23 2Z" fill="white" opacity="0.95"/>
            <rect x="10" y="12" width="26" height="16" rx="6" fill="white" opacity="0.9"/>
            <circle cx="32" cy="20" r="3.2" fill="#222" />
          </svg>
        </div>
      </div>

      <form className="form-container" onSubmit={handleSubmit}>

        <div className="row">
          <div className="label">Incident Type</div>
          <div className="controls">
            <select
              aria-label="Incident Type"
              className="pill-select"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">Choose...</option>
              <option value="medical">Medical</option>
              <option value="fire">Fire</option>
              <option value="threat">Threat</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div className="row">
          <div className="label">Location</div>
          <div className="controls">
            <input
              type="text"
              placeholder="Enter location or use current"
              className="input-pill"
              value={locationText}
              onChange={(e) => {
                setLocationText(e.target.value);
                setCoords(null);
              }}
            />
            <button
              type="button"
              className="location-pill"
              onClick={handleUseCurrentLocation}
              title="Use my current location"
            >
              <span className="pin">📍</span>
              My Current Location
            </button>
          </div>
        </div>

        <div className="desc-label">Incident Description</div>

        <textarea
          className="textarea-pill"
          placeholder="Describe what happened..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div style={{ height: 20 }} />

        <div className="submit-row">
          <button type="submit" className="send-pill" disabled={sending}>
            {sending ? "Sending..." : "Send Report"}
          </button>
        </div>
      </form>
    </div>
  );
}
