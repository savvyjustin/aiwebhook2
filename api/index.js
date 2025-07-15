import axios from "axios";
import * as cheerio from "cheerio"; // ✅ FIXED for ES modules
import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;

app.post("/api", async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).send({ error: "Missing 'url' in request body." });
  }

  try {
    console.log("🔍 Scraping URL:", url);

    const page = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
      },
      timeout: 10000,
    });

    console.log("✅ Page fetched");

    const $ = cheerio.load(page.data);
    const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 4000);
    console.log("📦 Extracted text length:", text.length);

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
    console.log("🧵 Thread created:", threadId);

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
        },
      }
    );
    console.log("✉️ Message added to thread");

    // Step 3: Run the assistant
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
    console.log("▶️ Assistant run started:", runId);

    // Step 4: Poll until completed
    let status = "queued";
    while (["queued", "in_progress"].includes(status)) {
      const check = await axios.get(
        `https://api.openai.com/v1/threads/${threadId}/runs/${runId}`,
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "OpenAI-Beta": "assistants=v2",
          },
        }
      );
      status = check.data.status;
      console.log("⏳ Run status:", status);
      if (status !== "completed") await new Promise((r) => setTimeout(r, 1500));
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

    const reply = messagesRes.data.data[0]?.content[0]?.text?.value || "";
    console.log("📝 Assistant reply:", reply);

    const lines = reply.split("\n").map((l) => l.trim());
    const company =
      lines.find((l) => l.startsWith("1"))?.split(":")[1]?.trim() || "";
    const condition =
      lines.find((l) => l.startsWith("2"))?.split(":")[1]?.trim() || "";
    const actions =
      lines.find((l) => l.startsWith("3"))?.split(":")[1]?.trim() || "";

    res.send({ company, condition, actions });
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).send({ error: err.message || "Unknown error occurred" });
  }
});

// Health check route
app.get("/", (_, res) => {
  res.send("✅ AI Webhook is live.");
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
