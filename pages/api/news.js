const SYSTEM_PROMPT = `You are a factual, nonpartisan news summarizer for nearly.news.
Motto: Clean news. No ads. No spin.
For sports: be fan-friendly, include scores and standings when available.
After searching the web, return ONLY a valid JSON array — no markdown, no backticks, no preamble.
Format: [{"headline":"...","summary":"...","source":"..."}]
Rules: exactly 5 items, summary 2-3 sentences max, neutral language, no HTML in values.`;

const REWRITE_SYSTEM =
  "You rewrite news with personality while keeping all facts intact. Return only the requested JSON.";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { query, personality } = req.body || {};
  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "Missing or invalid query" });
  }

  const isRewrite =
    personality &&
    typeof personality === "object" &&
    typeof personality.prompt === "string" &&
    personality.prompt.length > 0;

  const system = isRewrite ? REWRITE_SYSTEM : SYSTEM_PROMPT;
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
        return res.status(200).json({ text });
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

      if (text) return res.status(200).json({ text });
      break;
    }

    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") {
        const fallback = assistantText(messages[i].content);
        if (fallback) return res.status(200).json({ text: fallback });
        break;
      }
    }
    return res.status(502).json({ error: "No response after tool loop" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
