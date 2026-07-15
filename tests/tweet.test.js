import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isTweetUrl, tweetToken, normalizeTweet, buildTweetMarkdown, fetchTweet } from "../extension/src/lib/tweet.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "fixtures", "tweets", "similarweb-2077322771260957122.json");
const GOLDEN_PATH = path.join(__dirname, "fixtures", "tweets", "similarweb.golden.md");
const UPDATE_GOLDENS = process.env.UPDATE_GOLDENS === "1";

const fixtureJson = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));

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
