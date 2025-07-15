export const config = {
  runtime: "edge",
};

import * as cheerio from "cheerio";

const OPENAI_API_KEY = "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";
const ASSISTANT_ID = "asst_M4xZQylcC0UhrHRgwEAsOI6b";

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
    });
  }

  try {
    const { url } = await req.json();
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);
    const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 5000);

    // Step 1: Create a thread
    const threadRes = await fetch("https://api.openai.com/v1/threads", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "assistants=v2",
        "Content-Type": "application/json",
      },
    });
    const { id: threadId } = await threadRes.json();

    // Step 2: Add user message
    await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "assistants=v2",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role: "user",
        content: `Please extract the following from this article:\n\n1. Company name\n2. Disease or condition\n3. Suggested action items.\n\nText:\n${text}`,
      }),
    });

    // Step 3: Run assistant
    const runRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "assistants=v2",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        assistant_id: ASSISTANT_ID,
      }),
    });
    const { id: runId } = await runRes.json();

    // Step 4: Poll for completion
    let status = "queued";
    while (["queued", "in_progress"].includes(status)) {
      await new Promise((res) => setTimeout(res, 1500));
      const check = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Beta": "assistants=v2",
        },
      });
      const data = await check.json();
      status = data.status;
    }

    // Step 5: Get final messages
    const msgRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "assistants=v2",
      },
    });
    const messages = await msgRes.json();
    const reply =
      messages?.data?.[0]?.content?.[0]?.text?.value ||
      "No response from assistant.";

    return new Response(
      JSON.stringify({ reply }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Unexpected error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
