import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";
import {
  isTweetUrl,
  tweetToken,
  normalizeTweet,
  buildTweetMarkdown,
  fetchTweet,
  extractAuthorReplyIds,
  fetchTweetThread
} from "../extension/src/lib/tweet.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "fixtures", "tweets", "similarweb-2077322771260957122.json");
const GOLDEN_PATH = path.join(__dirname, "fixtures", "tweets", "similarweb.golden.md");
const QUOTE_FIXTURE_PATH = path.join(__dirname, "fixtures", "tweets", "quote-2075971270236393668.json");
const QUOTE_GOLDEN_PATH = path.join(__dirname, "fixtures", "tweets", "quote.golden.md");
const ARTICLE_FIXTURE_PATH = path.join(__dirname, "fixtures", "tweets", "article-2076323181154230284.json");
const ARTICLE_GOLDEN_PATH = path.join(__dirname, "fixtures", "tweets", "article.golden.md");
const RETWEET_FIXTURE_PATH = path.join(__dirname, "fixtures", "tweets", "retweet-2076675840327270522.json");
const THREAD_HTML_PATH = path.join(__dirname, "fixtures", "tweets", "similarweb-thread.html");
const THREAD_GOLDEN_PATH = path.join(__dirname, "fixtures", "tweets", "thread.golden.md");
const UPDATE_GOLDENS = process.env.UPDATE_GOLDENS === "1";
const normalizeNewlines = (value) => String(value).replace(/\r\n?/g, "\n");

const fixtureJson = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
const quoteFixtureJson = JSON.parse(fs.readFileSync(QUOTE_FIXTURE_PATH, "utf8"));
const articleFixtureJson = JSON.parse(fs.readFileSync(ARTICLE_FIXTURE_PATH, "utf8"));
const retweetFixtureJson = JSON.parse(fs.readFileSync(RETWEET_FIXTURE_PATH, "utf8"));
const threadHtml = fs.readFileSync(THREAD_HTML_PATH, "utf8");

function assertMatchesGolden(markdown, goldenPath) {
  if (UPDATE_GOLDENS) {
    fs.writeFileSync(goldenPath, markdown);
    return;
  }
  assert.ok(fs.existsSync(goldenPath), `missing golden file: ${goldenPath} (run with UPDATE_GOLDENS=1)`);
  const golden = fs.readFileSync(goldenPath, "utf8");
  assert.equal(normalizeNewlines(markdown), normalizeNewlines(golden));
}

test("isTweetUrl matches x.com, twitter.com, and mobile.twitter.com status URLs", () => {
  assert.deepEqual(isTweetUrl("https://x.com/Similarweb/status/2077322771260957122"), { id: "2077322771260957122" });
  assert.deepEqual(isTweetUrl("https://twitter.com/Similarweb/status/2077322771260957122"), { id: "2077322771260957122" });
  assert.deepEqual(
    isTweetUrl("https://mobile.twitter.com/Similarweb/status/2077322771260957122"),
    { id: "2077322771260957122" }
  );
});

test("isTweetUrl ignores query string and hash", () => {
  assert.deepEqual(
    isTweetUrl("https://x.com/Similarweb/status/2077322771260957122?s=20#reply"),
    { id: "2077322771260957122" }
  );
});

test("isTweetUrl rejects profile, home, search, and non-status URLs", () => {
  assert.equal(isTweetUrl("https://x.com/Similarweb"), null);
  assert.equal(isTweetUrl("https://x.com/home"), null);
  assert.equal(isTweetUrl("https://x.com/search?q=ai"), null);
  assert.equal(isTweetUrl("https://x.com/"), null);
});

test("isTweetUrl rejects non-Twitter hosts", () => {
  assert.equal(isTweetUrl("https://example.com/Similarweb/status/123"), null);
});

test("tweetToken is deterministic and matches the documented algorithm", () => {
  const id = fixtureJson.id_str;
  const expected = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
  assert.equal(tweetToken(id), expected);
  assert.equal(tweetToken(id), tweetToken(id));
});

test("normalizeTweet + buildTweetMarkdown matches the golden file", () => {
  const tweet = normalizeTweet(fixtureJson);
  const markdown = buildTweetMarkdown(tweet);

  if (UPDATE_GOLDENS) {
    fs.writeFileSync(GOLDEN_PATH, markdown);
    return;
  }

  assert.ok(fs.existsSync(GOLDEN_PATH), `missing golden file: ${GOLDEN_PATH} (run with UPDATE_GOLDENS=1)`);
  const golden = fs.readFileSync(GOLDEN_PATH, "utf8");
  assert.equal(normalizeNewlines(markdown), normalizeNewlines(golden));
});

test("normalizeTweet trims the trailing t.co media link via display_text_range", () => {
  const tweet = normalizeTweet(fixtureJson);
  assert.equal(tweet.text.includes("t.co"), false);
  assert.equal(tweet.text.includes("https://"), false);
});

test("normalizeTweet extracts author, handle, media, and permalink", () => {
  const tweet = normalizeTweet(fixtureJson);
  assert.equal(tweet.author, "Similarweb");
  assert.equal(tweet.handle, "Similarweb");
  assert.equal(tweet.permalink, "https://x.com/Similarweb/status/2077322771260957122");
  assert.deepEqual(tweet.media, [{ type: "photo", url: "https://pbs.twimg.com/media/HNQfWBbXcAA2x-W.png" }]);
});

test("fetchTweet normalizes a successful syndication response", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => fixtureJson });
  const tweet = await fetchTweet(fixtureJson.id_str, { fetchImpl });
  assert.equal(tweet.author, "Similarweb");
  assert.equal(tweet.permalink, "https://x.com/Similarweb/status/2077322771260957122");
});

test("fetchTweet throws a clear error on a non-200 response", async () => {
  const fetchImpl = async () => ({ ok: false, status: 404, json: async () => ({}) });
  await assert.rejects(() => fetchTweet("123", { fetchImpl }), /Tweet unavailable or protected/);
});

test("fetchTweet throws a clear error on a tombstone (unavailable/protected) response", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ __typename: "TweetTombstone" }) });
  await assert.rejects(() => fetchTweet("123", { fetchImpl }), /Tweet unavailable or protected/);
});

test("normalizeTweet expands an inline t.co link using entities.urls", () => {
  const json = {
    id_str: "1",
    created_at: "2026-01-01T00:00:00.000Z",
    display_text_range: [0, 40],
    text: "check this out https://t.co/abc123 more",
    user: { name: "Someone", screen_name: "someone" },
    entities: {
      urls: [
        { url: "https://t.co/abc123", expanded_url: "https://example.com/page", display_url: "example.com/page" }
      ]
    }
  };
  const tweet = normalizeTweet(json);
  assert.equal(tweet.text.includes("t.co"), false);
  assert.equal(tweet.text.includes("https://example.com/page"), true);
});

test("normalizeTweet + buildTweetMarkdown matches the quote golden and nests the quoted tweet cleanly", () => {
  const tweet = normalizeTweet(quoteFixtureJson);
  const markdown = buildTweetMarkdown(tweet);

  assertMatchesGolden(markdown, QUOTE_GOLDEN_PATH);

  assert.equal(markdown.includes("t.co"), false);
  assert.match(markdown, /Quoting \*\*Ali Ghodsi\*\* \(@alighodsi\)/);
  assert.match(markdown, />> At 11k employees, our AI costs are going up\./);
  assert.match(markdown, /\[View quoted tweet on X\]\(https:\/\/x\.com\/alighodsi\/status\/2074996561306955958\)/);
});

test("normalizeTweet + buildTweetMarkdown matches the article golden and links the real article URL", () => {
  const tweet = normalizeTweet(articleFixtureJson);
  const markdown = buildTweetMarkdown(tweet);

  assertMatchesGolden(markdown, ARTICLE_GOLDEN_PATH);

  assert.equal(tweet.article.title, "The Reverse Information Paradox");
  assert.match(markdown, /\*\*The Reverse Information Paradox\*\*/);
  assert.match(markdown, /Nobel Prize winning economist Kenneth Arrow/);
  assert.match(
    markdown,
    /\[Read the full article on X\]\(http:\/\/x\.com\/i\/article\/2076319195718090753\)/
  );
  assert.equal(markdown.includes("t.co"), false);
});

test("normalizeTweet renders the real retweet fixture as a normal photo tweet (no retweeted_status present)", () => {
  assert.equal(retweetFixtureJson.retweeted_status, undefined);
  const tweet = normalizeTweet(retweetFixtureJson);
  const markdown = buildTweetMarkdown(tweet);

  assert.equal(tweet.repostedBy, undefined);
  assert.equal(tweet.author, "Rapid Response 47");
  assert.deepEqual(tweet.media, [{ type: "photo", url: "https://pbs.twimg.com/media/HNHVq7nXsAAZEmf.jpg" }]);
  assert.match(markdown, /!\[tweet image\]\(https:\/\/pbs\.twimg\.com\/media\/HNHVq7nXsAAZEmf\.jpg\)/);
});

test("normalizeTweet unwraps a synthetic retweeted_status and buildTweetMarkdown prefixes the reposter", () => {
  const json = {
    id_str: "999",
    created_at: "2026-02-02T00:00:00.000Z",
    user: { name: "Reposter", screen_name: "reposter_handle" },
    retweeted_status: {
      id_str: "111",
      created_at: "2026-01-01T00:00:00.000Z",
      display_text_range: [0, 13],
      text: "Original text",
      user: { name: "Original Author", screen_name: "original_author" }
    }
  };

  const tweet = normalizeTweet(json);
  assert.equal(tweet.author, "Original Author");
  assert.equal(tweet.handle, "original_author");
  assert.equal(tweet.repostedBy, "reposter_handle");
  assert.equal(tweet.permalink, "https://x.com/original_author/status/111");

  const markdown = buildTweetMarkdown(tweet);
  assert.match(markdown, /^> Reposted by \*\*@reposter_handle\*\*/);
  assert.match(markdown, /\*\*Original Author\*\* \(@original_author\)/);
  assert.match(markdown, /Original text/);
});

test("extractAuthorReplyIds finds only the focal author's own self-reply in the real thread fixture", () => {
  const dom = new JSDOM(threadHtml, { virtualConsole: new VirtualConsole() });
  const ids = extractAuthorReplyIds(dom.window.document, "2077322771260957122", "Similarweb");
  assert.deepEqual(ids, ["2077322774423421089"]);
});

test("extractAuthorReplyIds is case-insensitive on the handle and excludes the focal tweet itself", () => {
  const dom = new JSDOM(threadHtml, { virtualConsole: new VirtualConsole() });
  const ids = extractAuthorReplyIds(dom.window.document, "2077322771260957122", "similarweb");
  assert.deepEqual(ids, ["2077322774423421089"]);
});

test("extractAuthorReplyIds returns [] on a document with no matching tweets", () => {
  const dom = new JSDOM("<!doctype html><html><body><div>nothing here</div></body></html>");
  assert.deepEqual(extractAuthorReplyIds(dom.window.document, "123", "Similarweb"), []);
});

test("extractAuthorReplyIds degrades to [] instead of throwing on a malformed/missing document", () => {
  assert.deepEqual(extractAuthorReplyIds(null, "123", "Similarweb"), []);
  assert.deepEqual(extractAuthorReplyIds(undefined, "123", "Similarweb"), []);
});

test("buildTweetMarkdown renders a follow-up thread under a divider and keeps the focal tweet intact, matching the thread golden", () => {
  const focal = normalizeTweet(fixtureJson);
  const followUp = {
    author: "Similarweb",
    handle: "Similarweb",
    createdAt: "2026-07-15T00:00:00.000Z",
    text: "Source: Similarweb AI Traffic Tracker",
    links: ["https://similarweb.com/ai-traffic"],
    media: [],
    permalink: "https://x.com/Similarweb/status/2077322774423421089"
  };
  focal.thread = [followUp];

  const markdown = buildTweetMarkdown(focal);

  if (UPDATE_GOLDENS) {
    fs.writeFileSync(THREAD_GOLDEN_PATH, markdown);
  } else {
    assert.ok(fs.existsSync(THREAD_GOLDEN_PATH), `missing golden file: ${THREAD_GOLDEN_PATH} (run with UPDATE_GOLDENS=1)`);
    const golden = fs.readFileSync(THREAD_GOLDEN_PATH, "utf8");
    assert.equal(normalizeNewlines(markdown), normalizeNewlines(golden));
  }

  assert.match(markdown, /Gen AI website traffic share update/);
  assert.match(markdown, /--- Author's follow-up ---/);
  assert.match(markdown, /Source: Similarweb AI Traffic Tracker/);
  assert.match(markdown, /\[View on X\]\(https:\/\/x\.com\/Similarweb\/status\/2077322771260957122\)/);
});

test("fetchTweetThread assembles the focal tweet with a one-item thread from an injected fetchImpl", async () => {
  const replyJson = {
    __typename: "Tweet",
    id_str: "2077322774423421089",
    created_at: "2026-07-15T00:00:00.000Z",
    display_text_range: [0, 38],
    text: "Source: Similarweb AI Traffic Tracker",
    user: { name: "Similarweb", screen_name: "Similarweb" }
  };
  const fetchImpl = async (url) => {
    if (url.includes(fixtureJson.id_str)) {
      return { ok: true, json: async () => fixtureJson };
    }
    if (url.includes(replyJson.id_str)) {
      return { ok: true, json: async () => replyJson };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const tweet = await fetchTweetThread(fixtureJson.id_str, [replyJson.id_str], { fetchImpl });
  assert.equal(tweet.author, "Similarweb");
  assert.equal(tweet.thread.length, 1);
  assert.equal(tweet.thread[0].text, "Source: Similarweb AI Traffic Tracker");
});

test("fetchTweetThread skips a reply that fails to fetch and still returns the focal tweet", async () => {
  const fetchImpl = async (url) => {
    if (url.includes(fixtureJson.id_str)) {
      return { ok: true, json: async () => fixtureJson };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  const tweet = await fetchTweetThread(fixtureJson.id_str, ["999999999"], { fetchImpl });
  assert.equal(tweet.author, "Similarweb");
  assert.equal(tweet.thread.length, 0);
});
