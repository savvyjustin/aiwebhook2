export const config = {
  runtime: "edge",
};

import * as cheerio from "cheerio";

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

    const company = "Biogen";
    const condition = "Alzheimer's disease";
    const actions = "Notify the research team and prepare outreach.";

    return new Response(
      JSON.stringify({ company, condition, actions }),
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
