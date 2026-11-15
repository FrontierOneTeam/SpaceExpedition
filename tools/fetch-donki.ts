import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(toolsDir, '..');
const rawDir = join(root, 'src', 'data', 'raw');

const BASE = 'https://ccmc.gsfc.nasa.gov/DONKI-API/get/FLR';

const QUERIES = [
  { startDate: '2017-09-02', endDate: '2017-09-15' },
  { startDate: '2017-09-04', endDate: '2017-09-11' },
];

// Development-time only. The game itself never calls the network.
async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  mkdirSync(rawDir, { recursive: true });

  for (const { startDate, endDate } of QUERIES) {
    const name = `donki-flr-${startDate}_${endDate}`;
    const rawPath = join(rawDir, `${name}.json`);
    const metaPath = join(rawDir, `${name}.meta.json`);
    if (existsSync(rawPath) && !force) {
      console.log(`skip ${name}.json (exists, use --force to refetch)`);
      continue;
    }

    const sourceUrl = `${BASE}?startDate=${startDate}&endDate=${endDate}`;
    const response = await fetch(sourceUrl);
    if (response.status !== 200) {
      throw new Error(`DONKI returned HTTP ${response.status} for ${sourceUrl}`);
    }
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`DONKI response is not JSON for ${sourceUrl}`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`DONKI response is not a JSON array for ${sourceUrl}`);
    }

    // Save the response body exactly as received.
    writeFileSync(rawPath, text);
    const meta = {
      sourceUrl,
      fetchedAt: new Date().toISOString(),
      query: { type: 'FLR', startDate, endDate },
    };
    writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
    console.log(`saved ${name}.json (${parsed.length} records)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
