import { readFile, writeFile } from "node:fs/promises";

const [pngPath, icoPath] = process.argv.slice(2);

if (!pngPath || !icoPath) {
  throw new Error(
    "Usage: node scripts/png-to-ico.mjs <input.png> <output.ico>"
  );
}

const png = await readFile(pngPath);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);

const directory = Buffer.alloc(16);
directory.writeUInt8(0, 0); // 256px
directory.writeUInt8(0, 1); // 256px
directory.writeUInt8(0, 2);
directory.writeUInt8(0, 3);
directory.writeUInt16LE(1, 4);
directory.writeUInt16LE(32, 6);
directory.writeUInt32LE(png.length, 8);
directory.writeUInt32LE(6 + 16, 12);

await writeFile(icoPath, Buffer.concat([header, directory, png]));
