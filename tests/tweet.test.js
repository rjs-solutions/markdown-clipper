import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isTweetUrl, tweetToken, normalizeTweet, buildTweetMarkdown, fetchTweet } from "../extension/src/lib/tweet.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "fixtures", "tweets", "similarweb-2077322771260957122.json");
const GOLDEN_PATH = path.join(__dirname, "fixtures", "tweets", "similarweb.golden.md");
const QUOTE_FIXTURE_PATH = path.join(__dirname, "fixtures", "tweets", "quote-2075971270236393668.json");
const QUOTE_GOLDEN_PATH = path.join(__dirname, "fixtures", "tweets", "quote.golden.md");
const ARTICLE_FIXTURE_PATH = path.join(__dirname, "fixtures", "tweets", "article-2076323181154230284.json");
const ARTICLE_GOLDEN_PATH = path.join(__dirname, "fixtures", "tweets", "article.golden.md");
const RETWEET_FIXTURE_PATH = path.join(__dirname, "fixtures", "tweets", "retweet-2076675840327270522.json");
const UPDATE_GOLDENS = process.env.UPDATE_GOLDENS === "1";

const fixtureJson = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
const quoteFixtureJson = JSON.parse(fs.readFileSync(QUOTE_FIXTURE_PATH, "utf8"));
const articleFixtureJson = JSON.parse(fs.readFileSync(ARTICLE_FIXTURE_PATH, "utf8"));
const retweetFixtureJson = JSON.parse(fs.readFileSync(RETWEET_FIXTURE_PATH, "utf8"));

function assertMatchesGolden(markdown, goldenPath) {
  if (UPDATE_GOLDENS) {
    fs.writeFileSync(goldenPath, markdown);
    return;
  }
  assert.ok(fs.existsSync(goldenPath), `missing golden file: ${goldenPath} (run with UPDATE_GOLDENS=1)`);
  const golden = fs.readFileSync(goldenPath, "utf8");
  assert.equal(markdown, golden);
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

test("normalizeTweet + buildTweetMarkdown matches the golden file byte-for-byte", () => {
  const tweet = normalizeTweet(fixtureJson);
  const markdown = buildTweetMarkdown(tweet);

  if (UPDATE_GOLDENS) {
    fs.writeFileSync(GOLDEN_PATH, markdown);
    return;
  }

  assert.ok(fs.existsSync(GOLDEN_PATH), `missing golden file: ${GOLDEN_PATH} (run with UPDATE_GOLDENS=1)`);
  const golden = fs.readFileSync(GOLDEN_PATH, "utf8");
  assert.equal(markdown, golden);
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
