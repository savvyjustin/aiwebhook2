import axios from "axios";
import * as cheerio from "cheerio";
import dotenv from "dotenv";

dotenv.config();

// Vercel-style API handler
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "No URL provided" });

  try {
    console.log("🔍 Scraping URL:", url);

    // ✅ Axios with User-Agent
    const page = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml"
      },
      timeout: 10000,
    });

    const $ = cheerio.load(page.data);
    const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 5000);

    console.log("📄 Scraped text length:", text.length);

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;

    // Step 1: Create thread
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
    console.log("🧵 Thread ID:", threadId);

    // Step 2: Add user message
    await axios.post(
      `https://api.openai.com/v1/threads/${threadId}/messages`,
      {
        role: "user",
        content: `Please analyze the following article and extract:\n\n1. Company name\n2. Condition or disease\n3. Suggested action items\n\nText:\n${text}`,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Beta": "assistants=v2",
          "Content-Type": "application/json",
        },
      }
    );

    // Step 3: Run assistant
    const runRes = await axios.post(
      `https://api.openai.com/v1/threads/${threadId}/runs`,
      { assistant_id: ASSISTANT_ID },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Beta": "assistants=v2",
          "Content-Type": "application/json",
        },
      }
    );

    const runId = runRes.data.id;
    console.log("🏃 Run ID:", runId);

    // Step 4: Poll run status
    let runStatus = "queued";
    while (["queued", "in_progress"].includes(runStatus)) {
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
      console.log("⏳ Run status:", runStatus);
      if (runStatus === "completed") break;
      await new Promise((r) => setTimeout(r, 1500));
    }

    // Step 5: Get result
    const messagesRes = await axios.get(
      `https://api.openai.com/v1/threads/${threadId}/messages`,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Beta": "assistants=v2",
        },
      }
    );

    const allMessages = messagesRes.data.data;
    const replyMessage = allMessages.find((msg) => msg.role === "assistant");
    const reply = replyMessage?.content?.[0]?.text?.value || "No reply.";

    console.log("🧠 Assistant reply:", reply);

    const lines = reply.split("\n").filter((l) => l.trim());
    const company = lines.find((l) => l.startsWith("1."))?.split(":")[1]?.trim() || "";
    const condition = lines.find((l) => l.startsWith("2."))?.split(":")[1]?.trim() || "";
    const actions = lines.find((l) => l.startsWith("3."))?.split(":")[1]?.trim() || "";

    return res.status(200).json({ company, condition, actions });
  } catch (err) {
    console.error("❌ Error:", err.message);
    return res.status(500).json({ error: err.message || "Unexpected failure." });
  }
}
