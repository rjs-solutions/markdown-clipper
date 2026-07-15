// Clip a single X/Twitter post via X's public syndication JSON endpoint (the
// same feed the official embed widgets use). Pure functions except
// fetchTweet, which takes an injectable fetchImpl so tests never touch the
// network. Author self-reply threads are out of scope here (Phase B).

const TWEET_HOSTS = new Set(["x.com", "twitter.com", "mobile.twitter.com"]);

// Match /<handle>/status/<id> on a known X/Twitter host. Query string and
// hash are ignored. Returns null for profile/home/search/non-status URLs.
export function isTweetUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
  if (!TWEET_HOSTS.has(host)) {
    return null;
  }
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 3) {
    return null;
  }
  const [handle, statusWord, id] = parts;
  if (!handle || statusWord !== "status" || !/^\d+$/.test(id)) {
    return null;
  }
  return { id };
}

// react-tweet's syndication token algorithm.
export function tweetToken(id) {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

// Trim trailing whitespace from each line without touching leading emoji/
// symbols or collapsing intentional blank lines between paragraphs.
function trimTrailingWhitespace(text) {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n");
}

// Normalize the syndication endpoint's raw Tweet JSON into the shape
// buildTweetMarkdown expects. Assumes json is a valid (non-tombstone) Tweet.
export function normalizeTweet(json) {
  const user = json.user || {};
  const [start, end] = Array.isArray(json.display_text_range)
    ? json.display_text_range
    : [0, (json.text || "").length];
  const text = trimTrailingWhitespace(String(json.text || "").slice(start, end)).trim();

  const media = (json.mediaDetails || []).map((item) => {
    if (item.type === "photo") {
      return { type: "photo", url: item.media_url_https };
    }
    return { type: item.type, url: item.expanded_url || item.media_url_https };
  });

  const links = (json.entities && json.entities.urls) || [];
  const expandedLinks = links.map((entry) => entry.expanded_url).filter(Boolean);

  const handle = user.screen_name;
  const idStr = json.id_str;

  return {
    author: user.name,
    handle,
    createdAt: json.created_at,
    text,
    links: expandedLinks,
    media,
    permalink: `https://x.com/${handle}/status/${idStr}`
  };
}

// Format a normalized tweet as clean, quoted Markdown.
export function buildTweetMarkdown(tweet) {
  const date = String(tweet.createdAt || "").slice(0, 10);
  const lines = [`> **${tweet.author}** (@${tweet.handle}) · ${date}`, ">"];

  for (const line of String(tweet.text || "").split("\n")) {
    lines.push(line ? `> ${line}` : ">");
  }

  if (tweet.media.length) {
    lines.push(">");
    for (const item of tweet.media) {
      if (item.type === "photo") {
        lines.push(`> ![tweet image](${item.url})`);
      } else {
        lines.push(`> [Video](${item.url})`);
      }
    }
  }

  lines.push(">", `> [View on X](${tweet.permalink})`);
  return lines.join("\n");
}

// Fetch + normalize a tweet by id. Throws a clear Error when the tweet is
// missing, protected, or the endpoint doesn't return a usable Tweet.
export async function fetchTweet(id, { fetchImpl = fetch } = {}) {
  const token = tweetToken(id);
  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${token}`;
  const response = await fetchImpl(url);
  if (!response || !response.ok) {
    throw new Error("Tweet unavailable or protected");
  }
  const json = await response.json();
  if (!json || json.__typename !== "Tweet") {
    throw new Error("Tweet unavailable or protected");
  }
  return normalizeTweet(json);
}
