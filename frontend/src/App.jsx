// File: src/App.jsx
import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Home from "/Users/Cley/campus-pulse/frontend/src/pages/Home.jsx";
import MapPage from "/Users/Cley/campus-pulse/frontend/src/pages/MapPage.jsx";
import ContactEmergencyPage from "/Users/Cley/campus-pulse/frontend/src/pages/ContactEmmergencyPage.jsx";
import CreateAccountPage from "/Users/Cley/campus-pulse/frontend/src/pages/CreateAccountPage.jsx";
import LoginPage from "/Users/Cley/campus-pulse/frontend/src/pages/LoginPage.jsx";
import Recent from "/Users/Cley/campus-pulse/frontend/src/pages/Recent.jsx";
import ReportIncidentPage from "/Users/Cley/campus-pulse/frontend/src/pages/ReportIncidentPage.jsx";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/contact-emergency" element={<ContactEmergencyPage />} />
        <Route path="/create-account" element={<CreateAccountPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/recent" element={<Recent />} />
        <Route path="/report" element={<ReportIncidentPage />} />
        {/* add protected routes or admin routes as needed later */}
      </Routes>
    </Router>
  );
}
