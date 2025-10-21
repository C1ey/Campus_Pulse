import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generating short human readable summary for a hotspot.
 */
export async function generateHotspotSummary(h) {
  const prompt = `
You are a system summarizing clusters of emergency alerts.

Hotspot data:
- Location: ${h.sampleLocationName || "Unknown"}
- Alert count: ${h.count}
- Trend score: ${h.trendScore ?? "N/A"}
- Type: ${h.sampleType || h.topType || "Unknown"}
- Severity: ${h.severity}

Write a very short summary (1 line, under 20 words), friendly for dashboards.
Example: "Jackson Bay — 12 alerts in 72h (up 80% vs previous 72h). Mostly medical."
  `.trim();

  try {
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini", // lightweight and cheaper than others
      messages: [
        { role: "system", content: "You summarize alert clusters for monitoring dashboards." },
        { role: "user", content: prompt },
      ],
      max_tokens: 40,
      temperature: 0.5,
    });
    return res.choices[0]?.message?.content?.trim() || "";
  } catch (err) {
    console.error("Error generating summary:", err.message);
    return "";
  }
}
