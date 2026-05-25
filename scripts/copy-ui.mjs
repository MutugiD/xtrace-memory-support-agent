import fs from "node:fs";
import path from "node:path";

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

const srcDir = path.join(process.cwd(), "src", "ui");
const destDir = path.join(process.cwd(), "dist", "ui");

if (!fs.existsSync(srcDir)) {
  console.error(`UI source folder not found: ${srcDir}`);
  process.exit(1);
}

copyDir(srcDir, destDir);
console.log(`Copied UI assets to ${destDir}`);

