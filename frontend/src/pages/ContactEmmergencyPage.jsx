
import React from "react";
import { Link } from "react-router-dom";
import "../pages/ContactEmmergencyPages.css";

export default function ContactEmmergencyPage() {
  return (
    <div className="contact-screen">
      {/* top-left pulsing red circle that goes back to Home (Emergency button is on Home) */}
      <Link to="/" className="home-badge" aria-label="Back to Emergency">
        🔴
      </Link>

      {/* centered header */}
      <div className="header" role="banner">
        <h1 className="glow-title">Contact Emergency</h1>
        <div className="siren" aria-hidden="true" />
      </div>

      {/* main centered area */}
      <div className="contact-area">
        <div className="contact-cards">

          {/* Campus Police */}
          <div className="contact-card" role="group" aria-label="Campus Police contact">
            <div className="card-icon">
              <span className="icon-fallback" aria-hidden="true">🚓</span>
            </div>

            <div className="card-body">
              <h3>Campus Police</h3>
              <p className="phone">(555) 555-5555</p>
            </div>

            <div className="card-action">
              <button
                className="call-btn"
                onClick={() => window.open("tel:5555555555")}
                aria-label="Call Campus Police"
              >
                Call
              </button>
            </div>
          </div>

          {/* Ambulance */}
          <div className="contact-card" role="group" aria-label="Ambulance contact">
            <div className="card-icon">
              <span className="icon-fallback" aria-hidden="true">🚑</span>
            </div>

            <div className="card-body">
              <h3>Ambulance</h3>
              <p className="phone">911</p>
            </div>

            <div className="card-action">
              <button
                className="call-btn"
                onClick={() => window.open("tel:911")}
                aria-label="Call Ambulance"
              >
                Call
              </button>
            </div>
          </div>

          {/* Fire Brigade */}
          <div className="contact-card" role="group" aria-label="Fire Brigade contact">
            <div className="card-icon">
              <span className="icon-fallback" aria-hidden="true">🚒</span>
            </div>

            <div className="card-body">
              <h3>Fire Brigade</h3>
              <p className="phone">911</p>
            </div>

            <div className="card-action">
              <button
                className="call-btn"
                onClick={() => window.open("tel:911")}
                aria-label="Call Fire Brigade"
              >
                Call
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
