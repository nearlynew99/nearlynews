import { useState, useRef, useEffect } from "react";

// ── Brand ─────────────────────────────────────────────────────
const C = {
  ink:     "#0f0d0a",
  inkSoft: "#1a1612",
  inkMid:  "#221e18",
  paper:   "#f5f0e8",
  orange:  "#e85d04",
  mid:     "#4a3f2f",
  light:   "#9a8f7f",
  rule:    "#2a2018",
  ruleL:   "#d5cfc4",
};

// ── Daily Digest (High / Low / Buffalo) ─────────────────────
const DIGEST_NAMES = {
  plain:    "Daily Scoop",
  witty:    "Daily Dish",
  snarky:   "Daily Tea",
  southern: "Daily Biscuit",
  british:  "Daily Dispatch",
};

function getDigestName(personalityId) {
  return DIGEST_NAMES[personalityId] || DIGEST_NAMES.plain;
}

const HLB_SLOTS = [
  { slot: "high",    label: "High",    emoji: "🌟", color: "#c9a227" },
  { slot: "low",     label: "Low",     emoji: "📉", color: "#6a7a9a" },
  { slot: "buffalo", label: "Buffalo", emoji: "🦬", color: "#9a6b4a" },
];

// ── Categories ────────────────────────────────────────────────
const CATEGORIES = [
  { id: "hlb",           label: "HLB",        icon: "🦬", color: "#c47a1a", isHLB: true },
  { id: "local",         label: "Charleston", icon: "⚓", color: "#1a6b5a" },
  { id: "state",         label: "S. Carolina", icon: "🌴", color: "#2d5a8e" },
  { id: "national",      label: "National",   icon: "🇺🇸", color: "#c47a1a" },
  { id: "international", label: "World",      icon: "🌐", color: "#7a3a9a" },
  { id: "sports",        label: "Sports",     icon: "🏆", color: C.orange, hasSubs: true },
  { id: "custom",        label: "My Feeds",   icon: "★",  color: "#c0a020", isCustom: true },
];

const SPORT_SUBS = [
  { id: "clemson",    label: "Clemson",  icon: "🐾", color: C.orange,  q: "Clemson Tigers football basketball recruiting news today" },
  { id: "acc_sec",    label: "ACC/SEC",  icon: "🏈", color: "#c0392b", q: "ACC SEC college football basketball conference news today" },
  { id: "college_fb", label: "CFB",      icon: "🎓", color: "#7a3a9a", q: "college football top 25 rankings recruiting news today" },
  { id: "celtics",    label: "Celtics",  icon: "☘️", color: "#007a33", q: "Boston Celtics NBA news game results standings today" },
  { id: "bears",      label: "Bears",    icon: "🐻", color: "#4a6aaa", q: "Chicago Bears NFL news roster moves today" },
  { id: "braves",     label: "Braves",   icon: "⚾", color: "#ce1141", q: "Atlanta Braves MLB news game results standings today" },
];

const CAT_QUERIES = {
  local:         "Charleston South Carolina local news today",
  state:         "South Carolina state news politics today",
  national:      "top US national news headlines today",
  international: "top international world news today",
};

const PERSONALITIES = [
  { id: "plain",    label: "Plain",    icon: "📰", desc: "Just the facts",    prompt: null },
  { id: "witty",    label: "Witty",    icon: "😄", desc: "Light & clever",    prompt: "Rewrite with light, clever wit — like a funny friend texting the news. Keep all facts intact. Return ONLY JSON: {\"headline\":\"...\",\"summary\":\"...\"}" },
  { id: "snarky",   label: "Snarky",   icon: "😏", desc: "Dry eye-roll",      prompt: "Rewrite with dry, world-weary snark. Subtle eye-rolls, facts only. Return ONLY JSON: {\"headline\":\"...\",\"summary\":\"...\"}" },
  { id: "southern", label: "Southern", icon: "🌿", desc: "Sweet tea & y'all", prompt: "Rewrite this news like a friendly Southern neighbor leaning over the picket fence with sweet tea in hand — warm, unhurried, storytelling charm. Use a genuine Southern voice throughout: y'all, honey, bless their heart (kind or gently exasperated), reckon, ain't, fit to be tied, porch-swing cadence, and colorful asides. Paint the scene; don't just list facts like a wire report. Headline and summary must feel unmistakably Southern — never dry, neutral, or Plain-mode flat. Keep every fact accurate and unchanged. Return ONLY JSON: {\"headline\":\"...\",\"summary\":\"...\"}" },
  { id: "british",  label: "British",  icon: "🎩", desc: "Your Daily Dispatch", prompt: "Rewrite in dry British wit — understated, proper, slightly sardonic, as if reporting for the BBC after a long day. Your Daily Dispatch. Keep all facts intact. Return ONLY JSON: {\"headline\":\"...\",\"summary\":\"...\"}" },
];

// Suggested feeds for quick-add
const SUGGESTED_FEEDS = [
  { name: "Tiger Illustrated",    url: "https://www.on3.com/sites/tiger-illustrated/feed/",        icon: "🐾", category: "Clemson" },
  { name: "247Sports Clemson",    url: "https://247sports.com/college/clemson/rss.xml",             icon: "🐾", category: "Clemson" },
  { name: "Bleacher Report",      url: "https://bleacherreport.com/articles/feed",                  icon: "🏆", category: "Sports" },
  { name: "The Athletic",         url: "https://theathletic.com/rss/",                              icon: "📰", category: "Sports" },
  { name: "Post & Courier",       url: "https://www.postandcourier.com/search/?f=rss&t=article",   icon: "⚓", category: "Local" },
  { name: "Substack (your subs)", url: "",                                                           icon: "✉️", category: "Newsletter", placeholder: "paste your substack RSS URL" },
];

// ── News API (Anthropic via /api/news) ──────────────────────────
async function callNewsApi(query, personality = null, { digest = false } = {}) {
  const res = await fetch("/api/news", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, personality, digest }),
  });
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`API ${res.status}: ${raw.slice(0, 200)}`);
  }
  if (!res.ok || data.error) {
    throw new Error(data.error || `API ${res.status}: ${raw.slice(0, 200)}`);
  }
  if (typeof data.text !== "string") {
    throw new Error("Invalid API response: missing text");
  }
  return data.text;
}

function parseJSON(text) {
  const clean = text.replace(/```json|```/gi, "").trim();
  const s = clean.indexOf("["), e = clean.lastIndexOf("]");
  if (s === -1 || e === -1) throw new Error("No JSON array in response");
  return JSON.parse(clean.slice(s, e + 1));
}

async function fetchNews(query) {
  const text = await callNewsApi(
    `Search the web RIGHT NOW for today's top news about: "${query}"
Find 5 current real stories. Return ONLY this JSON array:
[{"headline":"...","summary":"2-3 sentence factual summary","source":"outlet name"}]`,
    null
  );
  return parseJSON(text);
}

function parseHLB(text) {
  const arr = parseJSON(text);
  return HLB_SLOTS.map((meta, i) => {
    const item = arr.find((x) => x.slot === meta.slot) || arr[i];
    if (!item?.headline) throw new Error("Incomplete digest response");
    return {
      ...meta,
      headline: item.headline,
      summary: item.summary || "",
      source: item.source || "News",
      ...(meta.slot === "buffalo" && item.buffalo_reason
        ? { buffalo_reason: item.buffalo_reason }
        : {}),
    };
  });
}

function buildHLBQuery(personality) {
  let q = `Search the web RIGHT NOW for today's top news worldwide.
Identify exactly 3 distinct real stories as:
🌟 HIGH — the most uplifting OR most important story of the day
📉 LOW — the hardest truth of the day
🦬 BUFFALO — surprising, weird, unexpectedly heartwarming, or "wait, WHAT?" with wonder (curious/delighted, not sad; no disaster death tolls or grim tragedies)
Return exactly 3 items with slots "high", "low", and "buffalo". The buffalo item must include buffalo_reason: one punchy sentence on the wonder or "wait, WHAT?" factor.`;
  if (personality?.prompt) {
    q += `\n\nWrite every headline and summary in this voice (keep all facts accurate):\n${personality.prompt}`;
  }
  return q;
}

async function fetchHLB(personality) {
  const text = await callNewsApi(buildHLBQuery(personality), null, { digest: true });
  return parseHLB(text);
}

async function fetchCustomFeed(feed) {
  // Try to get stories from a custom URL via Claude web search
  const text = await callNewsApi(
    `Search the web for the latest stories from this source: "${feed.name}" (${feed.url})
Find the 5 most recent articles. Return ONLY this JSON array:
[{"headline":"...","summary":"2-3 sentence factual summary","source":"${feed.name}"}]`,
    null
  );
  return parseJSON(text);
}

async function rewriteStory(story, personality) {
  if (!personality.prompt) return story;
  const text = await callNewsApi(
    `Headline: ${story.headline}\nSummary: ${story.summary}`,
    personality
  );
  const clean = text.replace(/```json|```/gi, "").trim();
  const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
  if (s === -1) return story;
  try { return { ...story, ...JSON.parse(clean.slice(s, e + 1)) }; }
  catch { return story; }
}

function timeAgo(ts) {
  if (!ts) return "";
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

// ── Sub-components ────────────────────────────────────────────

function LogoMark({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="14" fill={C.ink}/>
      <rect width="100" height="5" rx="2" fill={C.orange}/>
      <circle cx="50" cy="48" r="28" fill={C.orange}/>
      <text x="50" y="58" textAnchor="middle" fontFamily="Georgia,serif" fontStyle="italic" fontWeight="700" fontSize="36" fill="#f5f0e8">n</text>
    </svg>
  );
}

function Spinner({ color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "52px 0", gap: "16px" }}>
      <div style={{ position: "relative", width: "40px", height: "40px" }}>
        <div style={{ position: "absolute", inset: 0, border: "2px solid rgba(255,255,255,0.05)", borderRadius: "50%" }}/>
        <div style={{ position: "absolute", inset: 0, border: "2px solid transparent", borderTop: `2px solid ${color}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
      </div>
      <div style={{ color: C.light, fontSize: "11px", fontFamily: "monospace", letterSpacing: "0.12em", textTransform: "uppercase" }}>Searching the web…</div>
      <div style={{ color: C.rule, fontSize: "10px", fontFamily: "monospace" }}>~15 seconds — live search</div>
    </div>
  );
}

function HLBCard({ item, onOpen }) {
  const [reasonRevealed, setReasonRevealed] = useState(false);
  const story = { ...item, hlbSlot: item.slot, hlbLabel: item.label, hlbEmoji: item.emoji };
  return (
    <div
      onClick={() => onOpen(story)}
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderLeft: `4px solid ${item.color}`, borderRadius: "8px", padding: "18px 20px", marginBottom: "14px", cursor: "pointer", transition: "background 0.15s" }}
      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
      onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        <span style={{ fontSize: "22px", lineHeight: 1 }}>{item.emoji}</span>
        <span style={{ fontSize: "11px", fontFamily: "monospace", letterSpacing: "0.16em", textTransform: "uppercase", color: item.color, fontWeight: 700 }}>{item.label}</span>
      </div>
      {item.slot === "buffalo" && item.buffalo_reason && (
        <div style={{ marginBottom: "10px" }} onClick={e => e.stopPropagation()}>
          {!reasonRevealed ? (
            <button
              type="button"
              onClick={() => setReasonRevealed(true)}
              style={{ background: "rgba(154,107,74,0.12)", border: "1px dashed rgba(154,107,74,0.35)", borderRadius: "5px", padding: "8px 12px", width: "100%", textAlign: "left", cursor: "pointer", fontSize: "11px", fontFamily: "monospace", letterSpacing: "0.04em", color: item.color, lineHeight: 1.5 }}
            >
              Why is this the buffalo? 🦬 tap to reveal
            </button>
          ) : (
            <div className="buffalo-reveal" style={{ fontSize: "12px", color: C.light, lineHeight: "1.6", fontFamily: "Georgia,serif", fontStyle: "italic", opacity: 0.9 }}>
              <span style={{ fontStyle: "normal", fontFamily: "monospace", fontSize: "9px", letterSpacing: "0.08em", textTransform: "uppercase", color: item.color, opacity: 0.85 }}>Why it&apos;s the buffalo: </span>
              {item.buffalo_reason}
            </div>
          )}
        </div>
      )}
      <div style={{ fontSize: "15px", fontWeight: "700", color: "#e8e0d0", lineHeight: "1.45", fontFamily: "Georgia,serif", marginBottom: "8px" }}>
        {item.headline}
      </div>
      {item.summary && (
        <div style={{ fontSize: "13px", color: C.light, lineHeight: "1.75", marginBottom: "10px" }}>
          {item.summary.length > 280 ? item.summary.slice(0, 280) + "…" : item.summary}
        </div>
      )}
      <div style={{ fontSize: "10px", fontFamily: "monospace", letterSpacing: "0.05em", textTransform: "uppercase", color: C.rule }}>
        {item.source} · tap to read
      </div>
    </div>
  );
}

function NewsCard({ story, color, onOpen }) {
  return (
    <div
      onClick={() => onOpen(story)}
      style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderLeft: `3px solid ${color}`, borderRadius: "6px", padding: "15px 17px", marginBottom: "10px", cursor: "pointer", transition: "background 0.15s" }}
      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.055)"}
      onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.025)"}
    >
      <div style={{ fontSize: "14px", fontWeight: "700", color: "#e8e0d0", lineHeight: "1.45", fontFamily: "Georgia,serif", marginBottom: "7px" }}>
        {story.headline}
      </div>
      {story.summary && (
        <div style={{ fontSize: "12px", color: C.light, lineHeight: "1.7", marginBottom: "8px" }}>
          {story.summary.length > 220 ? story.summary.slice(0, 220) + "…" : story.summary}
        </div>
      )}
      <div style={{ fontSize: "10px", fontFamily: "monospace", letterSpacing: "0.05em", textTransform: "uppercase", display: "flex", gap: "8px" }}>
        <span style={{ color, opacity: 0.8 }}>{story.source}</span>
        <span style={{ color: C.rule }}>· tap to read</span>
      </div>
    </div>
  );
}

function StoryModal({ story, personality, color, onClose }) {
  const [display,   setDisplay]   = useState(story);
  const [rewriting, setRewriting] = useState(false);
  const [rewrote,   setRewrote]   = useState(false);

  async function apply() {
    if (!personality.prompt || rewriting) return;
    setRewriting(true);
    try { const r = await rewriteStory(story, personality); setDisplay(r); setRewrote(true); }
    finally { setRewriting(false); }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.inkSoft, border: "1px solid rgba(255,255,255,0.1)", borderTop: `3px solid ${color}`, borderRadius: "10px", maxWidth: "580px", width: "100%", padding: "28px", maxHeight: "88vh", overflowY: "auto" }}>
        {display.hlbEmoji && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
            <span style={{ fontSize: "20px" }}>{display.hlbEmoji}</span>
            <span style={{ fontSize: "10px", fontFamily: "monospace", letterSpacing: "0.16em", textTransform: "uppercase", color }}>{display.hlbLabel}</span>
          </div>
        )}
        <div style={{ fontSize: "10px", color: C.light, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: "12px", fontFamily: "monospace" }}>{display.source}</div>
        <div style={{ fontSize: "18px", fontWeight: "700", color: "#e8e0d0", lineHeight: "1.45", marginBottom: "14px", fontFamily: "Georgia,serif" }}>{display.headline}</div>
        <div style={{ fontSize: "14px", color: C.light, lineHeight: "1.8", marginBottom: "24px" }}>{display.summary}</div>
        {personality.prompt && !rewrote && (
          <div onClick={apply} style={{ background: rewriting ? "rgba(255,255,255,0.03)" : `${color}18`, border: `1px solid ${color}33`, borderRadius: "6px", padding: "10px 14px", marginBottom: "16px", cursor: rewriting ? "wait" : "pointer", fontSize: "12px", color: rewriting ? C.light : color, fontFamily: "monospace", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: "8px" }}>
            {rewriting ? <><span style={{ animation: "pulse 1s infinite" }}>✦</span> Rewriting in {personality.label} mode…</> : <>{personality.icon} Read in {personality.label} mode</>}
          </div>
        )}
        {rewrote && (
          <div style={{ background: `${color}12`, border: `1px solid ${color}22`, borderRadius: "5px", padding: "7px 11px", marginBottom: "14px", fontSize: "10px", color, fontFamily: "monospace", letterSpacing: "0.06em" }}>
            {personality.icon} {personality.label} mode applied
          </div>
        )}
        <button onClick={onClose} style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", color: C.light, padding: "9px 18px", borderRadius: "4px", fontSize: "11px", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>← Back</button>
      </div>
    </div>
  );
}

// ── Custom Feeds Panel ────────────────────────────────────────
function CustomFeedsPanel({ feeds, onAdd, onRemove, onClose }) {
  const [name,   setName]   = useState("");
  const [url,    setUrl]    = useState("");
  const [adding, setAdding] = useState(false);
  const [err,    setErr]    = useState(null);

  const inputStyle = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "5px",
    padding: "10px 12px",
    color: "#e8e0d0",
    fontSize: "12px",
    fontFamily: "monospace",
    width: "100%",
    outline: "none",
    letterSpacing: "0.02em",
  };

  function handleAdd() {
    if (!name.trim() || !url.trim()) { setErr("Name and URL are required."); return; }
    if (!url.startsWith("http")) { setErr("URL must start with http:// or https://"); return; }
    onAdd({ name: name.trim(), url: url.trim(), icon: "★", addedAt: Date.now() });
    setName(""); setUrl(""); setErr(null);
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 500, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "20px", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.inkSoft, border: "1px solid rgba(255,255,255,0.1)", borderTop: `3px solid #c0a020`, borderRadius: "10px", maxWidth: "560px", width: "100%", padding: "28px", marginTop: "20px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
          <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontWeight: 700, fontSize: "20px", color: "#e8e0d0" }}>
            My Feeds <span style={{ color: "#c0a020" }}>★</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.light, fontSize: "18px", cursor: "pointer", padding: "0 4px" }}>×</button>
        </div>
        <div style={{ fontSize: "12px", color: C.light, marginBottom: "24px", lineHeight: 1.6 }}>
          Bring every subscription you own. We don't cache or redistribute — this is your personal reader.
        </div>

        {/* Add new feed */}
        <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", padding: "18px", marginBottom: "20px" }}>
          <div style={{ fontSize: "10px", color: "#c0a020", letterSpacing: "0.2em", textTransform: "uppercase", fontFamily: "monospace", marginBottom: "14px" }}>Add a feed</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Feed name  (e.g. Tiger Illustrated)"
              style={inputStyle}
            />
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="RSS or site URL  (e.g. https://on3.com/sites/tiger-illustrated/feed/)"
              style={inputStyle}
            />
            {err && <div style={{ fontSize: "11px", color: "#c08080", fontFamily: "monospace" }}>{err}</div>}
            <button
              onClick={handleAdd}
              style={{ background: "#c0a020", border: "none", borderRadius: "5px", padding: "10px", color: C.ink, fontSize: "12px", fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", fontWeight: 700 }}
            >
              + Add Feed
            </button>
          </div>
        </div>

        {/* Quick-add suggestions */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "10px", color: C.light, letterSpacing: "0.18em", textTransform: "uppercase", fontFamily: "monospace", marginBottom: "12px" }}>Quick add</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {SUGGESTED_FEEDS.map((s, i) => {
              const already = feeds.some(f => f.url === s.url && s.url);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "6px", padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "14px" }}>{s.icon}</span>
                    <div>
                      <div style={{ fontSize: "12px", color: "#e8e0d0", fontFamily: "monospace" }}>{s.name}</div>
                      <div style={{ fontSize: "9px", color: C.light, letterSpacing: "0.08em" }}>{s.category}</div>
                    </div>
                  </div>
                  {already ? (
                    <span style={{ fontSize: "10px", color: "#c0a020", fontFamily: "monospace", letterSpacing: "0.06em" }}>ADDED ✓</span>
                  ) : s.url ? (
                    <button
                      onClick={() => onAdd({ ...s, addedAt: Date.now() })}
                      style={{ background: "rgba(192,160,32,0.15)", border: "1px solid rgba(192,160,32,0.3)", borderRadius: "4px", color: "#c0a020", fontSize: "10px", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", padding: "4px 10px", cursor: "pointer" }}
                    >
                      + Add
                    </button>
                  ) : (
                    <button
                      onClick={() => { setName(s.name); setUrl(""); }}
                      style={{ background: "rgba(192,160,32,0.1)", border: "1px solid rgba(192,160,32,0.2)", borderRadius: "4px", color: "#908040", fontSize: "10px", fontFamily: "monospace", letterSpacing: "0.06em", padding: "4px 10px", cursor: "pointer" }}
                    >
                      Configure
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* My feeds list */}
        {feeds.length > 0 && (
          <div>
            <div style={{ fontSize: "10px", color: C.light, letterSpacing: "0.18em", textTransform: "uppercase", fontFamily: "monospace", marginBottom: "10px" }}>Your feeds ({feeds.length})</div>
            {feeds.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(192,160,32,0.05)", border: "1px solid rgba(192,160,32,0.15)", borderRadius: "6px", padding: "10px 14px", marginBottom: "6px" }}>
                <div>
                  <div style={{ fontSize: "12px", color: "#e8e0d0", fontFamily: "monospace" }}>{f.icon} {f.name}</div>
                  <div style={{ fontSize: "9px", color: C.light, marginTop: "2px", fontFamily: "monospace", opacity: 0.7 }}>{f.url.slice(0, 48)}{f.url.length > 48 ? "…" : ""}</div>
                </div>
                <button
                  onClick={() => onRemove(i)}
                  style={{ background: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "4px", color: "#8a5050", fontSize: "10px", fontFamily: "monospace", letterSpacing: "0.06em", padding: "3px 8px", cursor: "pointer" }}
                >
                  remove
                </button>
              </div>
            ))}
          </div>
        )}

        {feeds.length === 0 && (
          <div style={{ textAlign: "center", color: C.rule, fontSize: "12px", fontFamily: "monospace", padding: "12px 0", fontStyle: "italic" }}>
            No custom feeds yet — add one above
          </div>
        )}

        {/* Superfan note */}
        <div style={{ marginTop: "20px", background: "rgba(192,160,32,0.06)", border: "1px solid rgba(192,160,32,0.15)", borderRadius: "6px", padding: "12px 14px" }}>
          <div style={{ fontSize: "10px", color: "#c0a020", letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "monospace", marginBottom: "4px" }}>★ Superfan feature</div>
          <div style={{ fontSize: "11px", color: C.light, lineHeight: 1.6 }}>Custom feeds are a Superfan ($20/mo) feature. You already pay for great content — we just make it a joy to read.</div>
        </div>

        <button onClick={onClose} style={{ marginTop: "18px", background: "none", border: "1px solid rgba(255,255,255,0.08)", color: C.light, padding: "9px 18px", borderRadius: "4px", fontSize: "11px", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", width: "100%" }}>Done</button>
      </div>
    </div>
  );
}

// ── Custom Feed Sub-tabs ──────────────────────────────────────
function CustomFeedView({ feeds, onManage, onOpenStory, color }) {
  const [activeFeed, setActiveFeed]   = useState(feeds[0] || null);
  const [loading,    setLoading]      = useState(false);
  const [error,      setError]        = useState(null);
  const cacheRef   = useRef({});
  const [, rerender] = useState(0);

  const stories = activeFeed ? (cacheRef.current[activeFeed.url] || []) : [];

  async function load(feed, force = false) {
    if (!feed) return;
    const key = feed.url;
    if (!force && cacheRef.current[key]?.length) return;
    setLoading(true); setError(null);
    try {
      const items = await fetchCustomFeed(feed);
      cacheRef.current[key] = items;
      rerender(n => n + 1);
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  }

  useEffect(() => { if (activeFeed) load(activeFeed); }, [activeFeed?.url]);
  useEffect(() => { if (feeds.length && !activeFeed) setActiveFeed(feeds[0]); }, [feeds]);

  if (feeds.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "52px 24px" }}>
        <div style={{ fontSize: "32px", marginBottom: "16px" }}>★</div>
        <div style={{ color: "#e8e0d0", fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: "18px", marginBottom: "10px" }}>No custom feeds yet</div>
        <div style={{ color: C.light, fontSize: "13px", lineHeight: 1.7, marginBottom: "24px" }}>
          Bring your subscriptions — Tiger Illustrated, The Athletic, your local paper, any newsletter with an RSS feed.
        </div>
        <button onClick={onManage} style={{ background: "#c0a020", border: "none", borderRadius: "5px", padding: "12px 24px", color: C.ink, fontSize: "12px", fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", fontWeight: 700 }}>
          + Add Your First Feed
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Feed selector tabs */}
      <div style={{ display: "flex", padding: "0 20px", background: "rgba(192,160,32,0.04)", borderBottom: "1px solid rgba(192,160,32,0.1)", overflowX: "auto", scrollbarWidth: "none" }}>
        {feeds.map((f, i) => (
          <button key={i}
            onClick={() => setActiveFeed(f)}
            style={{ background: "none", border: "none", borderBottom: activeFeed?.url === f.url ? "2px solid #c0a020" : "2px solid transparent", padding: "8px 14px 6px", color: activeFeed?.url === f.url ? "#e8e0d0" : "#4a4035", fontSize: "10px", fontFamily: "monospace", letterSpacing: "0.07em", textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "5px" }}>
            {f.icon} {f.name}
          </button>
        ))}
        <button onClick={onManage} style={{ background: "none", border: "none", borderBottom: "2px solid transparent", padding: "8px 14px 6px", color: "#c0a020", fontSize: "10px", fontFamily: "monospace", letterSpacing: "0.07em", cursor: "pointer", whiteSpace: "nowrap" }}>
          + Manage
        </button>
      </div>

      {/* Stories */}
      <div style={{ padding: "14px 20px", maxWidth: "680px", margin: "0 auto" }}>
        {loading && <Spinner color="#c0a020"/>}
        {!loading && error && (
          <div style={{ background: "rgba(180,50,50,0.1)", border: "1px solid rgba(180,50,50,0.2)", borderRadius: "6px", padding: "14px", color: "#c08080", fontSize: "12px", lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, marginBottom: "6px" }}>Couldn't load {activeFeed?.name}</div>
            <div style={{ fontSize: "10px", fontFamily: "monospace", opacity: 0.7 }}>{error}</div>
            <button onClick={() => load(activeFeed, true)} style={{ marginTop: "10px", background: "rgba(180,50,50,0.2)", border: "none", borderRadius: "4px", color: "#d09090", padding: "5px 12px", fontSize: "10px", fontFamily: "monospace", cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase" }}>Try Again</button>
          </div>
        )}
        {!loading && !error && stories.map((s, i) => (
          <NewsCard key={i} story={s} color="#c0a020" onOpen={onOpenStory}/>
        ))}
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────
export default function NearlyNews() {
  const [activeCatId,   setActiveCatId]   = useState("hlb");
  const [activeSportId, setActiveSportId] = useState("clemson");
  const [personality,   setPersonality]   = useState(PERSONALITIES[0]);
  const [showPicker,    setShowPicker]    = useState(false);
  const [showFeeds,     setShowFeeds]     = useState(false);
  const [customFeeds,   setCustomFeeds]   = useState([]);
  const [openStory,     setOpenStory]     = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);

  const cacheRef   = useRef({});
  const updatedRef = useRef({});
  const [, rerender] = useState(0);
  const initRef = useRef(false);

  const activeCat   = CATEGORIES.find(c => c.id === activeCatId);
  const activeSport = SPORT_SUBS.find(s => s.id === activeSportId);
  const isHLB       = activeCat?.isHLB;
  const isCustom    = activeCat?.isCustom;
  const digestName  = getDigestName(personality.id);
  const feedKey     = isHLB ? `hlb-${personality.id}` : activeCat?.hasSubs ? activeSportId : activeCatId;
  const activeColor = isCustom ? "#c0a020" : isHLB ? activeCat.color : activeCat?.hasSubs ? activeSport.color : activeCat?.color;
  const activeLabel = isCustom ? "My Feeds" : isHLB ? digestName : activeCat?.hasSubs ? activeSport.label : activeCat?.label;
  const stories     = cacheRef.current[feedKey] || [];
  const updated     = updatedRef.current[feedKey];

  function getQuery() {
    return activeCat.hasSubs ? activeSport.q : CAT_QUERIES[activeCatId];
  }

  async function load(force = false) {
    if (isCustom) return;
    const key = feedKey;
    const age = Date.now() - (updatedRef.current[key] || 0);
    if (!force && cacheRef.current[key]?.length && age < 12 * 60 * 1000) return;
    setLoading(true); setError(null);
    try {
      const items = isHLB ? await fetchHLB(personality) : await fetchNews(getQuery());
      cacheRef.current[key] = items;
      updatedRef.current[key] = Date.now();
    } catch (e) {
      setError(e.message || "Couldn't load stories.");
    } finally {
      setLoading(false);
      rerender(n => n + 1);
    }
  }

  useEffect(() => { if (!initRef.current) { initRef.current = true; load(); } }, []);
  useEffect(() => { if (initRef.current && !isCustom) load(); }, [activeCatId, activeSportId]);
  useEffect(() => { if (initRef.current && isHLB) load(); }, [personality.id]);

  function addFeed(feed) {
    setCustomFeeds(prev => [...prev.filter(f => f.url !== feed.url), feed]);
  }
  function removeFeed(idx) {
    setCustomFeeds(prev => prev.filter((_, i) => i !== idx));
  }

  return (
    <div style={{ minHeight: "100vh", background: C.ink, fontFamily: "system-ui,sans-serif", paddingBottom: "56px" }}>
      <style>{`
        @keyframes spin   { to{transform:rotate(360deg)} }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
        @keyframes buffaloReveal { from{opacity:0;transform:translateY(-6px);max-height:0} to{opacity:1;transform:none;max-height:200px} }
        .buffalo-reveal { animation: buffaloReveal 0.4s ease forwards; overflow: hidden; }
        * { box-sizing:border-box; }
        ::-webkit-scrollbar { width:3px; height:3px; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.08); border-radius:2px; }
        input::placeholder { color:#4a4035; }
        input:focus { border-color:rgba(255,255,255,0.2) !important; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ background: C.ink, borderBottom: `3px solid ${C.orange}`, padding: "0 20px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <LogoMark size={36}/>
            <div>
              <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontWeight: 700, fontSize: "20px", letterSpacing: "-0.02em", lineHeight: 1 }}>
                <span style={{ color: "#f0ece4" }}>nearly</span><span style={{ color: C.orange }}>news</span>
              </div>
              <div style={{ fontSize: "9px", color: C.rule, letterSpacing: "0.18em", textTransform: "uppercase", marginTop: "2px" }}>Clean. Yours. Fair.</div>
            </div>
          </div>

          {/* Personality picker */}
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowPicker(!showPicker)}
              style={{ background: showPicker ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)", border: `1px solid ${showPicker ? C.orange + "55" : "rgba(255,255,255,0.08)"}`, borderRadius: "20px", padding: "6px 14px", color: "#c0b8a8", fontSize: "11px", fontFamily: "monospace", letterSpacing: "0.05em", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
              {personality.icon} {personality.label} <span style={{ opacity: 0.4, fontSize: "8px" }}>▾</span>
            </button>
            {showPicker && (
              <div style={{ position: "absolute", right: 0, top: "38px", background: "#1c1814", border: "1px solid rgba(255,255,255,0.1)", borderTop: `2px solid ${C.orange}`, borderRadius: "8px", padding: "6px", zIndex: 200, minWidth: "170px", animation: "fadeUp 0.15s ease" }}>
                {PERSONALITIES.map(p => (
                  <button key={p.id} onClick={() => { setPersonality(p); setShowPicker(false); }}
                    style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", background: personality.id === p.id ? `${C.orange}18` : "none", border: "none", borderRadius: "5px", padding: "8px 10px", color: personality.id === p.id ? "#e8e0d0" : "#6a6050", fontSize: "11px", fontFamily: "monospace", cursor: "pointer", textAlign: "left", letterSpacing: "0.04em" }}>
                    <span>{p.icon}</span>
                    <div>
                      <div>{p.label}</div>
                      <div style={{ fontSize: "9px", opacity: 0.5, marginTop: "1px" }}>{p.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main category tabs */}
        <div style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none", marginTop: "2px" }}>
          {CATEGORIES.map(cat => {
            const isActive = cat.id === activeCatId;
            const col = cat.hasSubs ? C.orange : cat.color;
            return (
              <button key={cat.id} onClick={() => { setActiveCatId(cat.id); setShowPicker(false); if (cat.isCustom) setShowFeeds(false); }}
                style={{ background: "none", border: "none", borderBottom: isActive ? `2px solid ${col}` : "2px solid transparent", padding: "11px 15px 9px", color: isActive ? "#e8e0d0" : "#4a4035", fontSize: "11px", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap", transition: "color 0.15s", display: "flex", alignItems: "center", gap: "5px" }}>
                <span style={{ fontSize: "13px" }}>{cat.icon}</span>
                {cat.isHLB ? digestName : cat.label}
                {cat.isCustom && customFeeds.length > 0 && (
                  <span style={{ background: `${cat.color}25`, color: cat.color, fontSize: "9px", padding: "1px 5px", borderRadius: "8px" }}>{customFeeds.length}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sports sub-tabs */}
      {activeCat.hasSubs && (
        <div style={{ display: "flex", padding: "0 20px", background: "rgba(255,255,255,0.012)", borderBottom: "1px solid rgba(255,255,255,0.04)", overflowX: "auto", scrollbarWidth: "none" }}>
          {SPORT_SUBS.map(sub => (
            <button key={sub.id} onClick={() => setActiveSportId(sub.id)}
              style={{ background: "none", border: "none", borderBottom: sub.id === activeSportId ? `2px solid ${sub.color}` : "2px solid transparent", padding: "7px 12px 5px", color: sub.id === activeSportId ? "#d0c8b8" : "#3a3028", fontSize: "10px", fontFamily: "monospace", letterSpacing: "0.07em", textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap", transition: "color 0.15s", display: "flex", alignItems: "center", gap: "4px" }}>
              {sub.icon} {sub.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Custom Feeds View ── */}
      {isCustom && (
        <CustomFeedView feeds={customFeeds} onManage={() => setShowFeeds(true)} onOpenStory={setOpenStory} color="#c0a020"/>
      )}

      {/* ── High / Low / Buffalo Digest ── */}
      {isHLB && (
        <div style={{ padding: "18px 20px", maxWidth: "680px", margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: activeColor, display: "inline-block", boxShadow: `0 0 6px ${activeColor}`, animation: loading ? "pulse 1s infinite" : "none" }}/>
              <span style={{ fontSize: "10px", color: "#4a4035", letterSpacing: "0.14em", textTransform: "uppercase", fontFamily: "monospace" }}>
                Your {digestName}
                {updated && !loading && <span style={{ color: "#3a3028", marginLeft: "8px" }}>· {timeAgo(updated)}</span>}
              </span>
            </div>
            <button onClick={() => load(true)} disabled={loading}
              style={{ background: "none", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "4px", color: loading ? "#3a3028" : "#5a5045", fontSize: "10px", padding: "3px 10px", cursor: loading ? "not-allowed" : "pointer", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {loading ? "loading…" : "↻ refresh"}
            </button>
          </div>
          <div style={{ fontSize: "11px", color: C.light, fontFamily: "monospace", letterSpacing: "0.06em", marginBottom: "18px", opacity: 0.85 }}>
            🌟 High · 📉 Low · 🦬 Buffalo — today's three stories that matter
          </div>

          {loading && <Spinner color={activeColor}/>}

          {!loading && error && (
            <div style={{ background: "rgba(180,50,50,0.1)", border: "1px solid rgba(180,50,50,0.25)", borderRadius: "7px", padding: "16px 18px", color: "#c08080", lineHeight: 1.65 }}>
              <div style={{ fontWeight: 700, marginBottom: "6px", fontSize: "13px" }}>Couldn't load your {digestName}</div>
              <div style={{ fontSize: "11px", opacity: 0.7, fontFamily: "monospace", marginBottom: "12px", wordBreak: "break-all" }}>{error}</div>
              <button onClick={() => load(true)} style={{ background: "rgba(180,50,50,0.2)", border: "none", borderRadius: "4px", color: "#d09090", padding: "6px 14px", fontSize: "11px", fontFamily: "monospace", cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase" }}>Try Again</button>
            </div>
          )}

          {!loading && !error && stories.length > 0 && (
            <div style={{ animation: "fadeUp 0.35s ease" }}>
              {stories.map((item) => (
                <HLBCard key={item.slot} item={item} onOpen={setOpenStory}/>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Standard Feed View ── */}
      {!isCustom && !isHLB && (
        <div style={{ padding: "18px 20px", maxWidth: "680px", margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: activeColor, display: "inline-block", boxShadow: `0 0 6px ${activeColor}`, animation: loading ? "pulse 1s infinite" : "none" }}/>
              <span style={{ fontSize: "10px", color: "#4a4035", letterSpacing: "0.14em", textTransform: "uppercase", fontFamily: "monospace" }}>
                {activeLabel}
                {stories.length > 0 && !loading && <span style={{ background: `${activeColor}20`, color: activeColor, padding: "1px 6px", borderRadius: "8px", fontSize: "9px", marginLeft: "8px" }}>{stories.length}</span>}
                {updated && !loading && <span style={{ color: "#3a3028", marginLeft: "8px" }}>· {timeAgo(updated)}</span>}
              </span>
            </div>
            <button onClick={() => load(true)} disabled={loading}
              style={{ background: "none", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "4px", color: loading ? "#3a3028" : "#5a5045", fontSize: "10px", padding: "3px 10px", cursor: loading ? "not-allowed" : "pointer", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", transition: "color 0.15s" }}
              onMouseEnter={e => { if (!loading) e.target.style.color = "#c0b8a8"; }}
              onMouseLeave={e => { e.target.style.color = loading ? "#3a3028" : "#5a5045"; }}>
              {loading ? "loading…" : "↻ refresh"}
            </button>
          </div>

          {personality.id !== "plain" && stories.length > 0 && !loading && (
            <div style={{ background: `${activeColor}10`, border: `1px solid ${activeColor}25`, borderRadius: "5px", padding: "8px 12px", marginBottom: "14px", fontSize: "11px", color: `${activeColor}cc`, fontFamily: "monospace", letterSpacing: "0.05em", animation: "fadeUp 0.3s ease" }}>
              {personality.icon} {personality.label} mode — tap any story to apply
            </div>
          )}

          {loading && <Spinner color={activeColor}/>}

          {!loading && error && (
            <div style={{ background: "rgba(180,50,50,0.1)", border: "1px solid rgba(180,50,50,0.25)", borderRadius: "7px", padding: "16px 18px", color: "#c08080", lineHeight: 1.65 }}>
              <div style={{ fontWeight: 700, marginBottom: "6px", fontSize: "13px" }}>Couldn't load stories</div>
              <div style={{ fontSize: "11px", opacity: 0.7, fontFamily: "monospace", marginBottom: "12px", wordBreak: "break-all" }}>{error}</div>
              <button onClick={() => load(true)} style={{ background: "rgba(180,50,50,0.2)", border: "none", borderRadius: "4px", color: "#d09090", padding: "6px 14px", fontSize: "11px", fontFamily: "monospace", cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase" }}>Try Again</button>
            </div>
          )}

          {!loading && !error && stories.length > 0 && (
            <div style={{ animation: "fadeUp 0.35s ease" }}>
              {stories.map((s, i) => <NewsCard key={i} story={s} color={activeColor} onOpen={setOpenStory}/>)}
            </div>
          )}

          {!loading && !error && stories.length === 0 && (
            <div style={{ textAlign: "center", color: "#3a3028", fontSize: "12px", padding: "52px 0", fontFamily: "monospace", letterSpacing: "0.08em" }}>Tap refresh to load stories.</div>
          )}
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "8px 20px", background: "rgba(10,8,6,0.97)", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: "9px", color: "#1e1a14", letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "monospace" }}>nearly.news · beta</div>
        <div style={{ fontSize: "9px", color: "#1e1a14", letterSpacing: "0.08em", fontFamily: "monospace" }}>Clean. Yours. Fair.</div>
      </div>

      {/* ── Modals ── */}
      {openStory && <StoryModal story={openStory} personality={personality} color={openStory.color || activeColor} onClose={() => setOpenStory(null)}/>}
      {showFeeds && <CustomFeedsPanel feeds={customFeeds} onAdd={addFeed} onRemove={removeFeed} onClose={() => setShowFeeds(false)}/>}
    </div>
  );
}
