
import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../frontend/src/firebase.js";
import { useNavigate, Link } from "react-router-dom";
import "../frontend/src/pages/LoginPage.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const nav = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      nav("/");
    } catch (err) {
      setError(err.message || "Failed to sign in");
    }
  }

  return (
    <div className="auth-screen">
      {/* pulsing red badge (home / emergency) */}
      <Link to="/" className="home-badge" aria-label="Back to Home">🔴</Link>

      {/* small text back (optional) */}
      <Link to="/" className="back-btn small-back" aria-label="Back">⬅ Back</Link>

      {/* centered header (glow) */}
      <header className="header" role="banner">
        <h1 className="glow-title">CAMPUS PULSE</h1>
        <div className="siren" aria-hidden="true" />
      </header>

      {/* auth card */}
      <main className="auth-center">
        <div className="auth-card" role="region" aria-labelledby="login-title">
          <h2 id="login-title">Log in</h2>

          <form className="auth-form" onSubmit={handleLogin}>
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
                placeholder="••••••••"
                required
                autoComplete="current-password"
                aria-label="Password"
              />
            </label>

            {error && <div className="error" role="alert">{error}</div>}

            <div className="form-row">
              <button type="submit" className="submit-btn" aria-label="Log in">Log in</button>
            </div>
          </form>

          <div className="auth-footer">
            Need an account? <Link to="/create-account" className="link">Create one</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
