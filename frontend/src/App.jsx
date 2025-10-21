
import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Home from "../frontend/src/pages/Home.jsx";
import MapPage from "../frontend/src/pages/MapPage.jsx";
import ContactEmergencyPage from "../frontend/src/pages/ContactEmmergencyPage.jsx";
import CreateAccountPage from "../frontend/src/pages/CreateAccountPage.jsx";
import LoginPage from "../frontend/src/pages/LoginPage.jsx";
import Recent from "../frontend/src/pages/Recent.jsx";
import ReportIncidentPage from "../frontend/src/pages/ReportIncidentPage.jsx";

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
