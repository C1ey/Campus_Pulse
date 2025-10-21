
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./App.css";

// Firebase auth helpers
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";

/**
 * Ensure anonymous auth for visitors:
 * - If no user is present, sign in anonymously.
 * - If a user exists (already signed in or previously anonymous), do nothing.
 * This satisfies Firestore rules that require request.auth != null for creates.
 */
function ensureAnonymousAuth() {
  const auth = getAuth();

  // onAuthStateChanged will fire immediately with current auth state.
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (user) {
      console.log("Firebase auth: existing user:", user.uid, user.isAnonymous ? "(anonymous)" : "");
      unsubscribe(); // we only needed to check once here
      return;
    }

    // no user -> sign in anonymously
    signInAnonymously(auth)
      .then((cred) => {
        console.log("Signed in anonymously:", cred.user.uid);
        unsubscribe();
      })
      .catch((err) => {
        console.error("Anonymous sign-in failed:", err);
        unsubscribe();
      });
  });
}

// Run it early
ensureAnonymousAuth();

const root = createRoot(document.getElementById("root"));
root.render(<App />);
