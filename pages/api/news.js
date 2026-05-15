const SYSTEM_PROMPT = `You are a factual, nonpartisan news summarizer for nearly.news.
Motto: Clean news. No ads. No spin.
For sports: be fan-friendly, include scores and standings when available.
After searching the web, return ONLY a valid JSON array — no markdown, no backticks, no preamble.
Format: [{"headline":"...","summary":"...","source":"..."}]
Rules: exactly 5 items, summary 2-3 sentences max, neutral language, no HTML in values.`;

const HLB_SYSTEM_PROMPT = `You are the nearly.news Daily Digest (High / Low / Buffalo).
Search the web for TODAY's real news. Pick exactly 3 distinct current stories:
- HIGH (slot "high", emoji 🌟): the most uplifting OR most important story of the day
- LOW (slot "low", emoji 📉): the hardest truth of the day
- BUFFALO (slot "buffalo", emoji 🦬): the day's "wait, WHAT?" story — surprising, weird, unexpectedly heartwarming, or wonder-inducing. Prioritize stories that make the reader feel curious or delighted, not sad. Do NOT pick disaster death tolls, mass tragedies, or grim breaking news as the Buffalo, even if they contain a surprising detail — those belong in Low if anywhere. Good Buffalo examples: bizarre discoveries, plot twists in culture/sports/science, oddly wholesome surprises, head-scratching world records.
Return ONLY a valid JSON array — no markdown, no backticks, no preamble:
[{"slot":"high","label":"High","emoji":"🌟","headline":"...","summary":"2-3 factual sentences","source":"outlet name"},
 {"slot":"low","label":"Low","emoji":"📉","headline":"...","summary":"...","source":"..."},
 {"slot":"buffalo","label":"Buffalo","emoji":"🦬","buffalo_reason":"One punchy sentence on why this is the buffalo — the wonder or 'wait, WHAT?' factor.","headline":"...","summary":"...","source":"..."}]
Exactly 3 items. buffalo_reason is required only on the buffalo item. Neutral factual language unless the user requests a personality voice. No HTML in values.`;

const REWRITE_SYSTEM =
  "You rewrite news with a distinct, obvious personality voice while keeping every fact intact. Follow the user's style instructions fully — never default to neutral wire-service tone. Return only the requested JSON.";

const SOUTHERN_REWRITE_SYSTEM = `You rewrite news in an unmistakable warm Southern voice — like a friendly neighbor telling stories over the back fence with sweet tea in hand.
Use y'all, honey, bless their heart, reckon, ain't, and gentle storytelling rhythm. Be colorful and unhurried; paint the scene, don't read bullet points.
Never sound like plain factual reporting or a wire service. Every headline and summary must feel distinctly Southern.
Keep all facts accurate and unchanged. Return only the requested JSON.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { query, personality, digest } = req.body || {};
  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "Missing or invalid query" });
  }

  const isDigest = digest === true;
  const isRewrite =
    !isDigest &&
    personality &&
    typeof personality === "object" &&
    typeof personality.prompt === "string" &&
    personality.prompt.length > 0;

  const system = isRewrite
    ? personality.id === "southern"
      ? SOUTHERN_REWRITE_SYSTEM
      : REWRITE_SYSTEM
    : isDigest
      ? HLB_SYSTEM_PROMPT
      : SYSTEM_PROMPT;
  const useSearch = !isRewrite;
  const userContent = isRewrite ? `${personality.prompt}\n\n${query}` : query;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured" });
  }

  const messages = [{ role: "user", content: userContent }];
  const bodyBase = {
    model: "claude-sonnet-4-5",
    max_tokens: 1500,
    system,
    ...(useSearch ? { tools: [{ type: "web_search_20250305", name: "web_search" }] } : {}),
  };

  function assistantText(content) {
    if (!Array.isArray(content)) return "";
    return content
      .filter((b) => b && b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("");
  }

  function stripCiteTags(text) {
    return text.replace(/<cite[^>]*>/g, "").replace(/<\/cite>/g, "");
  }

  try {
    for (let turn = 0; turn < 8; turn++) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          ...(useSearch ? { "anthropic-beta": "web-search-2025-03-05" } : {}),
        },
        body: JSON.stringify({ ...bodyBase, messages }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({
          error: `Anthropic API ${response.status}: ${errText.slice(0, 500)}`,
        });
      }

      const data = await response.json();
      messages.push({ role: "assistant", content: data.content });

      const stop = data.stop_reason;
      const text = assistantText(data.content);

      // Finished (including truncated output with usable text).
      if (stop === "end_turn" || stop === "max_tokens") {
        return res.status(200).json({ text: stripCiteTags(text) });
      }

      // Web search is a server tool: the API may pause mid-turn; continue with
      // the same messages (user … assistant partial) — do not send fake tool_result.
      if (stop === "pause_turn") {
        continue;
      }

      // Client-executed tools only (type "tool_use"). Server web search uses
      // "server_tool_use" / "web_search_tool_result" inside the assistant message.
      if (stop === "tool_use") {
        const clientUses = (data.content || []).filter((b) => b.type === "tool_use");
        if (clientUses.length > 0) {
          const results = clientUses.map((b) => ({
            type: "tool_result",
            tool_use_id: b.id,
            content: "Search completed.",
          }));
          messages.push({ role: "user", content: results });
          continue;
        }
        continue;
      }

      if (text) return res.status(200).json({ text: stripCiteTags(text) });
      break;
    }

    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") {
        const fallback = assistantText(messages[i].content);
        if (fallback) return res.status(200).json({ text: stripCiteTags(fallback) });
        break;
      }
    }
    return res.status(502).json({ error: "No response after tool loop" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
