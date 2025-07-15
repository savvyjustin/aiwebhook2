import { readFile } from "fs/promises";
import cheerio from "cheerio";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "No URL provided" });

  try {
    // Fetch the page
    const response = await fetch(url);
    const html = await response.text();

    // Scrape it
    const $ = cheerio.load(html);
    const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 5000);

    // Make call to OpenAI Assistant API (mock for now)
    const company = "Biogen";
    const condition = "Alzheimer's disease";
    const actions = "Notify the research team and prepare outreach.";

    res.status(200).json({ company, condition, actions });
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: "Failed to process the request" });
  }
}