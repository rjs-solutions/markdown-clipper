// Clip a single X/Twitter post via X's public syndication JSON endpoint (the
// same feed the official embed widgets use). Pure functions except
// fetchTweet/fetchTweetThread, which take an injectable fetchImpl so tests
// never touch the network. extractAuthorReplyIds is the one DOM-facing
// function, but it stays pure (takes a document) so it is jsdom-testable
// without a browser; the popup is responsible for getting it a live document
// via executeScript.

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

// Syndication text is HTML-escaped (e.g. "&amp;" for "&"). Decode the small
// set of entities that actually show up in tweet bodies so clipped text
// reads naturally instead of leaking markup.
function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Replace inline t.co short links with their real destination using
// entities.urls[]. We render the bare expanded_url rather than a Markdown
// [display_url](expanded_url) link: display_url is often truncated with an
// ellipsis by X ("x.com/alighodsi/stat…"), which reads worse as link text
// than just showing the real URL directly.
function expandInlineLinks(text, entities) {
  const urls = (entities && entities.urls) || [];
  let result = text;
  for (const entry of urls) {
    if (entry.url && entry.expanded_url) {
      result = result.split(entry.url).join(entry.expanded_url);
    }
  }
  return result;
}

function normalizeMedia(mediaDetails) {
  return (mediaDetails || []).map((item) => {
    if (item.type === "photo") {
      return { type: "photo", url: item.media_url_https };
    }
    return { type: item.type, url: item.expanded_url || item.media_url_https };
  });
}

// Normalize the syndication endpoint's raw Tweet JSON into the shape
// buildTweetMarkdown expects. Assumes json is a valid (non-tombstone) Tweet.
export function normalizeTweet(json) {
  // Retweets come back with the reposting account's user + a full
  // retweeted_status object holding the original tweet. Unwrap to the
  // original tweet's content and remember who reposted it.
  if (json.retweeted_status) {
    const original = normalizeTweet(json.retweeted_status);
    return { ...original, repostedBy: (json.user && json.user.screen_name) || null };
  }

  const user = json.user || {};
  const [start, end] = Array.isArray(json.display_text_range)
    ? json.display_text_range
    : [0, (json.text || "").length];
  const rawSlice = String(json.text || "").slice(start, end);
  const expanded = expandInlineLinks(rawSlice, json.entities);
  const text = decodeHtmlEntities(trimTrailingWhitespace(expanded).trim());

  const media = normalizeMedia(json.mediaDetails);

  const links = (json.entities && json.entities.urls) || [];
  const expandedLinks = links.map((entry) => entry.expanded_url).filter(Boolean);

  const handle = user.screen_name;
  const idStr = json.id_str;

  const tweet = {
    author: user.name,
    handle,
    createdAt: json.created_at,
    text,
    links: expandedLinks,
    media,
    permalink: `https://x.com/${handle}/status/${idStr}`
  };

  if (json.quoted_tweet) {
    tweet.quotedTweet = normalizeTweet(json.quoted_tweet);
  }

  // X long-form articles: the tweet text is just a t.co link to the
  // article. Syndication only exposes a title + short preview_text, never
  // the full article body, so this is a preview link, not the whole piece.
  if (json.article) {
    const rawTitle = String(json.article.title || "");
    const rawPreview = String(json.article.preview_text || "");
    tweet.article = {
      title: decodeHtmlEntities(rawTitle).trim(),
      // preview_text sometimes has an embedded line break; join it into one
      // flowing line so it stays a single, valid blockquote line.
      previewText: decodeHtmlEntities(rawPreview).replace(/\s*\n+\s*/g, " ").trim(),
      url: (links[0] && links[0].expanded_url) || null
    };
  }

  return tweet;
}

// From a live page's DOM (the tweet's own page, already rendered), find the
// focal author's OTHER tweets on the page -- i.e. their self-reply thread.
// X's syndication endpoint only ever returns the one tweet asked for, so the
// only way to discover a thread's follow-up ids is to read them off the
// rendered timeline. Each rendered tweet is a [data-testid="tweet"] block;
// its author's @handle and its own status id both live inside that block's
// [data-testid="User-Name"] header (the handle from the profile link text,
// the status id from the timestamp permalink, e.g.
// href="/Similarweb/status/2077322774423421089"). Matching on the header
// keeps this from also matching a quoted tweet's own permalink further down
// inside the same block.
//
// Deliberately defensive: X's markup churns, so any shape we don't expect
// (missing header, no matching link) is simply skipped rather than thrown --
// worst case this returns [] and the caller falls back to the focal tweet
// alone.
export function extractAuthorReplyIds(doc, focalId, focalHandle) {
  try {
    const wantedHandle = String(focalHandle || "")
      .replace(/^@/, "")
      .toLowerCase();
    if (!doc || !wantedHandle) {
      return [];
    }

    const seen = new Set();
    const ids = [];
    const tweetBlocks = doc.querySelectorAll('[data-testid="tweet"]');

    for (const block of tweetBlocks) {
      const header = block.querySelector('[data-testid="User-Name"]');
      if (!header) {
        continue;
      }
      const handleMatch = header.textContent.match(/@(\w+)/);
      if (!handleMatch || handleMatch[1].toLowerCase() !== wantedHandle) {
        continue;
      }

      const statusLink = Array.from(header.querySelectorAll("a[href]")).find((anchor) =>
        new RegExp(`^/${handleMatch[1]}/status/\\d+$`, "i").test(anchor.getAttribute("href") || "")
      );
      if (!statusLink) {
        continue;
      }
      const idMatch = statusLink.getAttribute("href").match(/\/status\/(\d+)$/);
      const id = idMatch && idMatch[1];
      if (!id || id === focalId || seen.has(id)) {
        continue;
      }
      seen.add(id);
      ids.push(id);
    }

    return ids;
  } catch {
    return [];
  }
}

function quotePrefix(depth) {
  return ">".repeat(depth);
}

// Push one tweet's body (header, text/article, media) onto `lines` at the
// given blockquote depth. `includeHeader` is false when rendering a quoted
// tweet nested under a "Quoting **author**..." line that already carries
// the author/date, so we don't repeat it.
function pushTweetBody(lines, tweet, depth, { includeHeader = true } = {}) {
  const prefix = quotePrefix(depth);

  if (includeHeader) {
    const date = String(tweet.createdAt || "").slice(0, 10);
    lines.push(`${prefix} **${tweet.author}** (@${tweet.handle}) · ${date}`, prefix);
  }

  if (tweet.article) {
    lines.push(`${prefix} **${tweet.article.title}**`, prefix);
    lines.push(`${prefix} ${tweet.article.previewText}`, prefix);
    lines.push(`${prefix} [Read the full article on X](${tweet.article.url})`);
  } else {
    for (const line of String(tweet.text || "").split("\n")) {
      lines.push(line ? `${prefix} ${line}` : prefix);
    }
  }

  if (tweet.media.length) {
    lines.push(prefix);
    for (const item of tweet.media) {
      if (item.type === "photo") {
        lines.push(`${prefix} ![tweet image](${item.url})`);
      } else {
        lines.push(`${prefix} [Video](${item.url})`);
      }
    }
  }
}

// Format a normalized tweet as clean, quoted Markdown.
export function buildTweetMarkdown(tweet) {
  const lines = [];

  if (tweet.repostedBy) {
    lines.push(`> Reposted by **@${tweet.repostedBy}**`, ">");
  }

  pushTweetBody(lines, tweet, 1, { includeHeader: true });

  if (tweet.quotedTweet) {
    const quoted = tweet.quotedTweet;
    const quotedDate = String(quoted.createdAt || "").slice(0, 10);
    lines.push(">", `> Quoting **${quoted.author}** (@${quoted.handle}) · ${quotedDate}:`);
    pushTweetBody(lines, quoted, 2, { includeHeader: false });
    lines.push(">>", `>> [View quoted tweet on X](${quoted.permalink})`);
  }

  if (Array.isArray(tweet.thread)) {
    for (const followUp of tweet.thread) {
      lines.push(">", "> --- Author's follow-up ---", ">");
      pushTweetBody(lines, followUp, 1, { includeHeader: true });
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

// Fetch the focal tweet plus its author's follow-up replies (found via
// extractAuthorReplyIds) and assemble them into one normalized tweet with a
// `.thread` array. Each reply is fetched the same clean way as the focal
// tweet; a reply that fails to fetch (deleted, protected, transient error)
// is simply skipped so one bad reply never breaks the whole thread.
export async function fetchTweetThread(focalId, replyIds, { fetchImpl = fetch } = {}) {
  const focal = await fetchTweet(focalId, { fetchImpl });
  const thread = [];
  for (const replyId of replyIds || []) {
    try {
      thread.push(await fetchTweet(replyId, { fetchImpl }));
    } catch (error) {
      console.error("Markdown Clipper thread reply fetch failed, skipping:", error);
    }
  }
  focal.thread = thread;
  return focal;
}
