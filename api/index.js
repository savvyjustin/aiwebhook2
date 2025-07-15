import axios from "axios";
import * as cheerio from "cheerio";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST requests allowed" });

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "No URL provided" });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;

  try {
    console.log("🔍 Scraping URL...");
const page = await axios.get(url, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
  }
});
const $ = cheerio.load(page.data);
const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 1000);


    console.log("🧵 Creating thread...");
    const threadRes = await axios.post(
      "https://api.openai.com/v1/threads",
      {},
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Beta": "assistants=v2",
        },
      }
    );
    const threadId = threadRes.data.id;
    console.log("✅ Thread ID:", threadId);

    console.log("💬 Posting message...");
    await axios.post(
      `https://api.openai.com/v1/threads/${threadId}/messages`,
      {
        role: "user",
        content: `From the following article, extract:\n\n1. Company name\n2. Disease or condition\n3. Suggested action items\n\nArticle:\n${text}`,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Beta": "assistants=v2",
        },
      }
    );

    console.log("🚀 Running assistant...");
    const runRes = await axios.post(
      `https://api.openai.com/v1/threads/${threadId}/runs`,
      { assistant_id: ASSISTANT_ID },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Beta": "assistants=v2",
        },
      }
    );
    const runId = runRes.data.id;
    console.log("✅ Run ID:", runId);

    console.log("⏳ Polling run status...");
    let runStatus = "queued";
    let attempts = 0;
    while (["queued", "in_progress"].includes(runStatus) && attempts < 10) {
      const statusRes = await axios.get(
        `https://api.openai.com/v1/threads/${threadId}/runs/${runId}`,
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "OpenAI-Beta": "assistants=v2",
          },
        }
      );
      runStatus = statusRes.data.status;
      if (runStatus === "completed") break;
      await new Promise((r) => setTimeout(r, 1500));
      attempts++;
    }

    if (runStatus !== "completed") {
      return res.status(500).json({ error: "Assistant run timed out." });
    }

    console.log("📥 Fetching assistant response...");
    const messagesRes = await axios.get(
      `https://api.openai.com/v1/threads/${threadId}/messages`,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Beta": "assistants=v2",
        },
      }
    );

    const reply = messagesRes.data.data?.[0]?.content?.[0]?.text?.value;
    if (!reply) return res.status(500).json({ reply: "No response from assistant." });

    res.status(200).json({ reply });
  } catch (err) {
    console.error("❌ Server error:", err.message);
    res.status(500).json({ error: err.message });
  }
}
