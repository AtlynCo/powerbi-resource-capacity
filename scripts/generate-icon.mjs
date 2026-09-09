import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const size = 20;
const pixels = Buffer.alloc(size * size * 4);
const colors = {
  background: [19, 44, 67, 255],
  rail: [217, 230, 239, 255],
  available: [71, 196, 180, 255],
  near: [244, 189, 80, 255],
  overload: [232, 116, 85, 255]
};

function rectangle(x, y, width, height, color) {
  for (let row = y; row < y + height; row++) {
    for (let column = x; column < x + width; column++) {
      pixels.set(color, (row * size + column) * 4);
    }
  }
}

rectangle(0, 0, size, size, colors.background);
for (const [x, y] of [[0, 0], [1, 0], [0, 1], [19, 0], [18, 0], [19, 1],
  [0, 19], [1, 19], [0, 18], [19, 19], [18, 19], [19, 18]]) {
  pixels.set([0, 0, 0, 0], (y * size + x) * 4);
}
for (const [x, width] of [[4, 3], [9, 3], [14, 2]]) {
  rectangle(x, 3, width, 2, colors.rail);
}
rectangle(2, 7, 2, 10, colors.rail);
rectangle(16, 7, 2, 10, colors.rail);
for (const [x, y, color] of [
  [6, 7, "available"], [11, 7, "available"],
  [6, 11, "available"], [11, 11, "near"],
  [6, 15, "overload"], [11, 15, "available"]
]) {
  rectangle(x, y, 3, 3, colors[color]);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0);
header.writeUInt32BE(size, 4);
header[8] = 8;
header[9] = 6;
const scanlines = Buffer.alloc(size * (size * 4 + 1));
for (let y = 0; y < size; y++) {
  pixels.copy(scanlines, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
}
const image = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(scanlines, { level: 9 })),
  chunk("IEND", Buffer.alloc(0))
]);
const assets = resolve(dirname(fileURLToPath(import.meta.url)), "..", "assets");
mkdirSync(assets, { recursive: true });
writeFileSync(resolve(assets, "icon.png"), image);
console.log(`Generated original ${size}x${size} RGBA capacity icon (${image.length} bytes).`);
