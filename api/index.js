import axios from "axios";
import cheerio from "cheerio";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "No URL provided" });

  try {
    const page = await axios.get(url);
    const $ = cheerio.load(page.data);
    const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 5000);

    const headers = {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "OpenAI-Beta": "assistants=v2",
      "Content-Type": "application/json"
    };

    const threadRes = await axios.post(
      "https://api.openai.com/v1/threads",
      {},
      { headers }
    );
    const threadId = threadRes.data.id;

    await axios.post(
      `https://api.openai.com/v1/threads/${threadId}/messages`,
      {
        role: "user",
        content: `Please analyze the following article and extract:\n\n1. Company name\n2. Condition or disease\n3. Suggested action items\n\nText:\n${text}`
      },
      { headers }
    );

    const runRes = await axios.post(
      `https://api.openai.com/v1/threads/${threadId}/runs`,
      { assistant_id: process.env.OPENAI_ASSISTANT_ID },
      { headers }
    );
    const runId = runRes.data.id;

    let status = "queued";
    while (["queued", "in_progress"].includes(status)) {
      const statusRes = await axios.get(
        `https://api.openai.com/v1/threads/${threadId}/runs/${runId}`,
        { headers }
      );
      status = statusRes.data.status;
      if (status !== "completed") await new Promise(r => setTimeout(r, 1500));
    }

    const messagesRes = await axios.get(
      `https://api.openai.com/v1/threads/${threadId}/messages`,
      { headers }
    );
    const reply = messagesRes.data.data[0].content[0].text.value;
    const lines = reply.split("\n").filter(l => l.trim());

    const company = lines.find(l => l.startsWith("1."))?.split(":")[1]?.trim() || "";
    const condition = lines.find(l => l.startsWith("2."))?.split(":")[1]?.trim() || "";
    const actions = lines.find(l => l.startsWith("3."))?.split(":")[1]?.trim() || "";

    res.status(200).json({ company, condition, actions });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: err.message || "Assistants API failed" });
  }
}

