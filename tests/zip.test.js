import { test } from "node:test";
import assert from "node:assert/strict";
import { createZip, crc32 } from "../extension/src/lib/zip.js";

test("crc32 matches the known check value", () => {
  const bytes = new TextEncoder().encode("123456789");
  assert.equal(crc32(bytes), 0xcbf43926);
});

test("createZip produces a zip Blob with the PK signature", async () => {
  const blob = createZip([
    { name: "a.md", data: "# A\n" },
    { name: "folder/b.md", data: "# B\n" }
  ]);
  assert.equal(blob.type, "application/zip");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  // End-of-central-directory signature present near the tail.
  const tail = bytes.slice(-22);
  assert.deepEqual([...tail.slice(0, 4)], [0x50, 0x4b, 0x05, 0x06]);
  // Two entries recorded in EOCD.
  assert.equal(new DataView(tail.buffer, tail.byteOffset).getUint16(10, true), 2);
});
