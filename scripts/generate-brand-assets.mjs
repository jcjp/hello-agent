import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { deflateSync } from "node:zlib";

function crc32(buffer) {
  let crc = ~0;

  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return ~crc >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length, 0);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([size, typeBuffer, data, crc]);
}

function encodePng(width, height, pixels) {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
  ]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));

  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function createCanvas(width, height) {
  return {
    width,
    height,
    pixels: Buffer.alloc(width * height * 4, 0)
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fillPixel(canvas, x, y, color) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  const index = (y * canvas.width + x) * 4;
  const alpha = color[3] / 255;
  const inv = 1 - alpha;

  canvas.pixels[index] = Math.round(
    color[0] * alpha + canvas.pixels[index] * inv
  );
  canvas.pixels[index + 1] = Math.round(
    color[1] * alpha + canvas.pixels[index + 1] * inv
  );
  canvas.pixels[index + 2] = Math.round(
    color[2] * alpha + canvas.pixels[index + 2] * inv
  );
  canvas.pixels[index + 3] = Math.round(
    clamp(color[3] + canvas.pixels[index + 3] * inv, 0, 255)
  );
}

function fillRect(canvas, x, y, width, height, color) {
  const startX = Math.max(0, Math.floor(x));
  const startY = Math.max(0, Math.floor(y));
  const endX = Math.min(canvas.width, Math.ceil(x + width));
  const endY = Math.min(canvas.height, Math.ceil(y + height));

  for (let py = startY; py < endY; py += 1) {
    for (let px = startX; px < endX; px += 1) {
      fillPixel(canvas, px, py, color);
    }
  }
}

function fillRoundedRect(canvas, x, y, width, height, radius, color) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const startX = Math.max(0, Math.floor(x));
  const startY = Math.max(0, Math.floor(y));
  const endX = Math.min(canvas.width, Math.ceil(x + width));
  const endY = Math.min(canvas.height, Math.ceil(y + height));

  for (let py = startY; py < endY; py += 1) {
    for (let px = startX; px < endX; px += 1) {
      const dx =
        px < x + r ? x + r - px : px > x + width - r ? px - (x + width - r) : 0;
      const dy =
        py < y + r
          ? y + r - py
          : py > y + height - r
            ? py - (y + height - r)
            : 0;

      if (dx * dx + dy * dy <= r * r) {
        fillPixel(canvas, px, py, color);
      }
    }
  }
}

function fillCircle(canvas, cx, cy, radius, color) {
  const startX = Math.max(0, Math.floor(cx - radius));
  const startY = Math.max(0, Math.floor(cy - radius));
  const endX = Math.min(canvas.width, Math.ceil(cx + radius));
  const endY = Math.min(canvas.height, Math.ceil(cy + radius));
  const rr = radius * radius;

  for (let py = startY; py < endY; py += 1) {
    for (let px = startX; px < endX; px += 1) {
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy <= rr) {
        fillPixel(canvas, px, py, color);
      }
    }
  }
}

function fillRing(
  canvas,
  cx,
  cy,
  radius,
  thickness,
  color,
  { start = 0, end = Math.PI * 2 } = {}
) {
  const startX = Math.max(0, Math.floor(cx - radius));
  const startY = Math.max(0, Math.floor(cy - radius));
  const endX = Math.min(canvas.width, Math.ceil(cx + radius));
  const endY = Math.min(canvas.height, Math.ceil(cy + radius));
  const inner = (radius - thickness) * (radius - thickness);
  const outer = radius * radius;

  for (let py = startY; py < endY; py += 1) {
    for (let px = startX; px < endX; px += 1) {
      const dx = px - cx;
      const dy = py - cy;
      const distance = dx * dx + dy * dy;
      const angle = Math.atan2(dy, dx);
      const normalized = angle < 0 ? angle + Math.PI * 2 : angle;

      if (
        distance <= outer &&
        distance >= inner &&
        normalized >= start &&
        normalized <= end
      ) {
        fillPixel(canvas, px, py, color);
      }
    }
  }
}

function fillDiamond(canvas, cx, cy, size, color) {
  const startX = Math.max(0, Math.floor(cx - size));
  const startY = Math.max(0, Math.floor(cy - size));
  const endX = Math.min(canvas.width, Math.ceil(cx + size));
  const endY = Math.min(canvas.height, Math.ceil(cy + size));

  for (let py = startY; py < endY; py += 1) {
    for (let px = startX; px < endX; px += 1) {
      if (Math.abs(px - cx) + Math.abs(py - cy) <= size) {
        fillPixel(canvas, px, py, color);
      }
    }
  }
}

function fillBackground(canvas) {
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const gx = x / canvas.width;
      const gy = y / canvas.height;
      const base = [
        Math.round(7 + 12 * gx + 8 * gy),
        Math.round(17 + 26 * gx + 8 * (1 - gy)),
        Math.round(31 + 32 * gy + 18 * gx),
        255
      ];

      const glowA = Math.max(
        0,
        1 -
          Math.hypot(x - canvas.width * 0.15, y - canvas.height * 0.16) /
            (canvas.width * 0.35)
      );
      const glowB = Math.max(
        0,
        1 -
          Math.hypot(x - canvas.width * 0.85, y - canvas.height * 0.8) /
            (canvas.width * 0.28)
      );

      base[0] += Math.round(48 * glowA + 62 * glowB);
      base[1] += Math.round(92 * glowA + 54 * glowB);
      base[2] += Math.round(108 * glowA + 12 * glowB);

      const index = (y * canvas.width + x) * 4;
      canvas.pixels[index] = clamp(base[0], 0, 255);
      canvas.pixels[index + 1] = clamp(base[1], 0, 255);
      canvas.pixels[index + 2] = clamp(base[2], 0, 255);
      canvas.pixels[index + 3] = 255;
    }
  }
}

function drawBrandMark(canvas, x, y, scale) {
  fillRoundedRect(
    canvas,
    x,
    y,
    192 * scale,
    192 * scale,
    42 * scale,
    [255, 255, 255, 20]
  );
  fillRing(
    canvas,
    x + 72 * scale,
    y + 74 * scale,
    46 * scale,
    14 * scale,
    [103, 232, 249, 255],
    {
      start: Math.PI * 0.15,
      end: Math.PI * 1.75
    }
  );
  fillRect(
    canvas,
    x + 102 * scale,
    y + 56 * scale,
    18 * scale,
    56 * scale,
    [19, 36, 59, 255]
  );
  fillDiamond(
    canvas,
    x + 142 * scale,
    y + 142 * scale,
    26 * scale,
    [245, 158, 11, 255]
  );
  fillCircle(
    canvas,
    x + 26 * scale,
    y + 162 * scale,
    11 * scale,
    [245, 158, 11, 255]
  );
  fillCircle(
    canvas,
    x + 146 * scale,
    y + 32 * scale,
    8 * scale,
    [103, 232, 249, 210]
  );
}

function generateOgImage() {
  const canvas = createCanvas(1200, 630);
  fillBackground(canvas);

  fillRoundedRect(canvas, 52, 52, 1096, 526, 34, [10, 20, 36, 222]);
  fillRoundedRect(canvas, 52, 52, 1096, 526, 34, [255, 255, 255, 10]);

  for (let x = 80; x < 1120; x += 28) {
    fillRect(canvas, x, 88, 1, 210, [255, 255, 255, 14]);
  }
  for (let y = 88; y < 312; y += 28) {
    fillRect(canvas, 80, y, 960, 1, [255, 255, 255, 14]);
  }

  fillRect(canvas, 100, 112, 42, 3, [103, 232, 249, 255]);
  fillRoundedRect(canvas, 100, 144, 430, 58, 16, [245, 247, 251, 240]);
  fillRoundedRect(canvas, 100, 216, 380, 58, 16, [245, 247, 251, 220]);
  fillRoundedRect(canvas, 100, 304, 560, 22, 11, [184, 196, 214, 164]);
  fillRoundedRect(canvas, 100, 338, 520, 22, 11, [184, 196, 214, 146]);
  fillRoundedRect(canvas, 100, 372, 440, 22, 11, [184, 196, 214, 132]);

  const chipY = 444;
  const chips = [
    [100, 154],
    [266, 178],
    [456, 132],
    [600, 144]
  ];
  for (const [chipX, chipWidth] of chips) {
    fillRoundedRect(
      canvas,
      chipX,
      chipY,
      chipWidth,
      46,
      23,
      [255, 255, 255, 18]
    );
    fillRoundedRect(
      canvas,
      chipX + 18,
      chipY + 14,
      chipWidth - 36,
      18,
      9,
      [245, 247, 251, 185]
    );
  }

  drawBrandMark(canvas, 856, 132, 1.1);

  fillRect(canvas, 100, 520, 172, 10, [184, 196, 214, 164]);
  fillRect(canvas, 928, 520, 120, 10, [184, 196, 214, 164]);

  return encodePng(canvas.width, canvas.height, canvas.pixels);
}

function generateFaviconSource() {
  const canvas = createCanvas(256, 256);
  fillBackground(canvas);
  fillRoundedRect(canvas, 32, 32, 192, 192, 46, [10, 20, 36, 226]);
  drawBrandMark(canvas, 32, 32, 1);
  return encodePng(canvas.width, canvas.height, canvas.pixels);
}

async function writeBinary(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

await writeBinary("public/og-image.png", generateOgImage());
await writeBinary("public/favicon-source.png", generateFaviconSource());
