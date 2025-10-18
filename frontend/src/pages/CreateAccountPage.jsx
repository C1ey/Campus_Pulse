// File: src/pages/CreateAccountPage.jsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  updateProfile
} from "firebase/auth";
import { auth } from "/Users/Cley/campus-pulse/frontend/src/firebase.js";
import "./CreateAccountPage.css";

export default function CreateAccountPage() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);

    if (!displayName.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      // update profile display name
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: displayName.trim() });
      } else if (userCred.user) {
        await updateProfile(userCred.user, { displayName: displayName.trim() });
      }
      // navigate to home (where Emergency button lives)
      navigate("/");
    } catch (err) {
      // friendly mapping of some common errors
      const msg = (err && err.code) ? err.code : err.message || "Failed to create account";
      if (msg.includes("auth/email-already-in-use")) {
        setError("An account with that email already exists.");
      } else if (msg.includes("auth/invalid-email")) {
        setError("Invalid email address.");
      } else {
        setError(err.message || "Failed to create account. Try again.");
      }
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen create-screen">
      {/* pulsing red home badge */}
      <Link to="/" className="home-badge" aria-label="Back to Home">🔴</Link>

      {/* small textual back (optional) */}
      <Link to="/login" className="back-btn small-back" aria-label="Back to Login">⬅ Back</Link>

      {/* header */}
      <header className="header" role="banner">
        <h1 className="glow-title">CAMPUS PULSE</h1>
        <div className="siren" aria-hidden="true" />
      </header>

      <main className="auth-center">
        <div className="auth-card">
          <h2>Create Account</h2>

          <form className="auth-form" onSubmit={handleCreate}>
            <label className="field">
              <span className="field-label">Full name</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                required
                aria-label="Full name"
              />
            </label>

            <label className="field">
              <span className="field-label">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@school.edu"
                required
                autoComplete="email"
                aria-label="Email"
              />
            </label>

            <label className="field">
              <span className="field-label">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                aria-label="Password"
              />
            </label>

            <label className="field">
              <span className="field-label">Confirm Password</span>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat password"
                required
                aria-label="Confirm password"
              />
            </label>

            {error && <div className="error" role="alert">{error}</div>}

            <div className="form-row">
              <button type="submit" className="submit-btn" disabled={loading}>
                {loading ? "Creating..." : "Create account"}
              </button>
            </div>
          </form>

          <div className="auth-footer">
            Already have an account?{" "}
            <Link to="/login" className="link">Log in</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
