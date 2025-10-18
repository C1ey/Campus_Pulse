// src/hooks/useVoiceTrigger.js
import { useEffect } from "react";
import { sendAlert } from "../services/alertsService";

export default function useVoiceTrigger(enabled = true, getUserLocation) {
  useEffect(() => {
    if (!enabled || !("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const text = event.results[event.results.length - 1][0].transcript.toLowerCase();
      if (text.includes("pulse")) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
          const location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          await sendAlert({ type: "medical", location, reportedBy: null });
        });
      }
    };
    recognition.onerror = () => { /* handle */ };
    recognition.start();
    return () => recognition.stop();
  }, [enabled, getUserLocation]);
}
