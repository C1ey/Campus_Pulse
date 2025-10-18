/* app.post("/create-alert", async (req, res) => {
  try {
    const { type = "threat", lat, lng, reportedBy = null } = req.body;
    let location = (typeof lat === "number" && typeof lng === "number") ? { lat, lng } : null;

    let locationName = null;

    // 🧭 Reverse geocode if location provided
    if (location) {
      const apiKey = functions.config().google.apikey; // set in Step 1
      if (apiKey) {
        try {
          const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
          const resp = await axios.get(url);
          if (resp.data.status === "OK" && resp.data.results.length) {
            locationName = resp.data.results[0].formatted_address;
          }
        } catch (err) {
          console.warn("Google reverse geocode failed:", err.message);
        }
      }

      // 🧭 Optional fallback: OpenStreetMap Nominatim
      if (!locationName) {
        try {
          const osmUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
          const osmResp = await axios.get(osmUrl, {
            headers: { "User-Agent": "CampusPulse/1.0" }
          });
          if (osmResp.data && (osmResp.data.name || osmResp.data.display_name)) {
            locationName = osmResp.data.display_name;
          }
        } catch (err) {
          console.warn("Nominatim reverse geocode failed:", err.message);
        }
      }
    }

    const expiresAt = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    );

    const ref = await db.collection("alerts").add({
      type,
      location,
      locationName,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
      status: "active",
      reportedBy,
    });

    res.json({ ok: true, id: ref.id, locationName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
*/