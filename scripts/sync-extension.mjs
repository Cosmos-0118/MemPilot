/**
 * Copies the Vite build from dist/ to the project root so Chrome can load
 * ~/Developer/MemPilot as an unpacked extension (manifest.json lives at root).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

const ROOT_FILES = [
  'manifest.json',
  'background.js',
  'content.js',
  'popup.js',
  'icons.svg',
  'favicon.svg',
];

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(from, to);
    } else {
      await fs.copyFile(from, to);
    }
  }
}

async function main() {
  if (!(await exists(dist))) {
    console.error('MemPilot: dist/ not found. Run "npm run build" first.');
    process.exit(1);
  }

  // Vite outputs popup.source.html — publish as index.html for the manifest
  const builtPopupHtml = path.join(dist, 'popup.source.html');
  const distIndexHtml = path.join(dist, 'index.html');
  if (await exists(builtPopupHtml)) {
    await fs.copyFile(builtPopupHtml, distIndexHtml);
    await fs.copyFile(distIndexHtml, path.join(root, 'index.html'));
    console.log('MemPilot: synced index.html');
  } else if (await exists(distIndexHtml)) {
    await fs.copyFile(distIndexHtml, path.join(root, 'index.html'));
    console.log('MemPilot: synced index.html');
  } else {
    console.error('MemPilot: popup HTML not found in dist/.');
    process.exit(1);
  }

  for (const file of ROOT_FILES) {
    const src = path.join(dist, file);
    if (!(await exists(src))) continue;
    await fs.copyFile(src, path.join(root, file));
    console.log(`MemPilot: synced ${file}`);
  }

  const assetsSrc = path.join(dist, 'assets');
  if (await exists(assetsSrc)) {
    const assetsDest = path.join(root, 'assets');
    await fs.rm(assetsDest, { recursive: true, force: true });
    await copyDir(assetsSrc, assetsDest);
    console.log('MemPilot: synced assets/');
  } else {
    console.warn('MemPilot: warning — no assets/ folder; popup styles may be missing.');
  }

  console.log('MemPilot: extension files ready at project root.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
