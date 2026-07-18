import { test } from "node:test";
import assert from "node:assert/strict";
import { createZip, createZipWriter, crc32 } from "../extension/src/lib/zip.js";

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

test("createZipWriter produces byte-identical output to createZip for the same files", async () => {
  const files = [
    { name: "a.md", data: "# A\n" },
    { name: "folder/b.md", data: "# B\nsome more content here\n" }
  ];

  const fromCreateZip = new Uint8Array(await createZip(files).arrayBuffer());

  const writer = createZipWriter();
  for (const file of files) {
    writer.add(file.name, file.data);
  }
  const fromWriter = new Uint8Array(await writer.finish().arrayBuffer());

  assert.deepEqual([...fromWriter], [...fromCreateZip]);
});

test("createZipWriter output carries the PK local + central + EOCD signatures and correct CRCs", async () => {
  const writer = createZipWriter();
  writer.add("a.md", "# A\n");
  writer.add("folder/b.md", "# B\n");
  const blob = writer.finish();
  assert.equal(blob.type, "application/zip");
  const bytes = new Uint8Array(await blob.arrayBuffer());

  // Local file header signature at the very start.
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(14, true), crc32(new TextEncoder().encode("# A\n")));

  // End-of-central-directory signature near the tail, with two entries.
  const tail = bytes.slice(-22);
  assert.deepEqual([...tail.slice(0, 4)], [0x50, 0x4b, 0x05, 0x06]);
  assert.equal(new DataView(tail.buffer, tail.byteOffset).getUint16(10, true), 2);

  // Central directory signature is present somewhere before the EOCD.
  const centralSig = [0x50, 0x4b, 0x01, 0x02];
  let found = false;
  for (let i = 0; i < bytes.length - 4; i += 1) {
    if (bytes[i] === centralSig[0] && bytes[i + 1] === centralSig[1] && bytes[i + 2] === centralSig[2] && bytes[i + 3] === centralSig[3]) {
      found = true;
      break;
    }
  }
  assert.ok(found, "central directory file header signature present");
});

test("createZipWriter supports adding entries incrementally, releasing each between add() calls", async () => {
  const writer = createZipWriter();
  writer.add("one.md", "one");
  const afterOne = writer.finish();
  assert.ok(afterOne instanceof Blob);

  const writer2 = createZipWriter();
  writer2.add("one.md", "one");
  writer2.add("two.md", "two");
  const blob = writer2.finish();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const tail = bytes.slice(-22);
  assert.equal(new DataView(tail.buffer, tail.byteOffset).getUint16(8, true), 2);
});
