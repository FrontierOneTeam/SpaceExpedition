# Outpost Builder

Outpost Builder is a browser base-building game for kids aged 7 to 12. The player grows a small Mars landing camp into a working outpost on an isometric tile grid. The space weather that tests the base is replayed from real NASA records. Each real period ends with a report, "This really happened", that links what NASA observed to what the player did.

## Run it

```
npm install
npm run dev
npm test
npm run build
```

## Where the data comes from

The game makes no network calls at runtime. Real NASA DONKI flare records are fetched during development by scripts in `tools/`, saved with their source link, fetch time and exact query, and committed to the repository. The first chapter uses flare records for 2 to 15 September 2017.

## What is real and what is simplified

Real:

- The flare dates, times and classes.
- The radiation storm at Mars on 11 September 2017.

Simplified:

- Storm levels 1 to 3 are game levels, not measurements.
- What breaks and how much health is lost.
- The one-day warning.
- The radio blackout.
- Steady sunlight in this chapter.
- One sol shown as one Earth date.
- The outpost and its site are made up.

## How AI tools were used

Claude Code wrote the code from the team's `SPEC.md`. The team reviews the code, tests the game, and supplies the art, audio and content.

## Install it on a phone or tablet

After the game has loaded once, it works without an internet connection. To put it on your home screen: in Chrome or Edge on Android, open the menu and choose **Install app** or **Add to Home screen**; on an iPhone or iPad, tap **Share** in Safari and choose **Add to Home Screen**; on a laptop, use the install icon in the address bar. When a new version is published, the game updates itself the next time it is opened, and never in the middle of play.

## Status

Local takeover implementation is under verification; nothing has been pushed or deployed by Codex. Read HANDOFF.md for task status and exact limitations.

The archive contains 1,110 distinct dates: September 2017 and all of 2022–2024. Raw NASA DONKI response bodies and query/fetch metadata are in src/data/raw. Most dates have no Mars surface-radiation measurement in those inputs; those days use explicitly labelled game baselines. May 20, 2024 uses a documented Mars-specific mapping. Simulated equipment incidents are separate from historical records.

Soil shields cover one tile for 2 soil and can be removed. Removing ordinary buildings refunds half their parts cost, rounded down. Buildings can move without changing crew or damage. Goals continue and surveys add 16 tiles after the initial 12×12 region. Research, a field notebook, limited aid, manual repairs and a two-turn critical-supply rescue period are available.

Outpost tools contains music/effects controls, aid, restart, save export/import, backup restoration, research and notebook. Local persistence uses IndexedDB with a localStorage fallback; portable JSON files move progress between browsers. Save before replacing a run.

To refresh data: `python tools/import-archive.py`, then `python tools/build-archive.py`. Existing raw responses are preserved. Run `npx tsx tools/long-run.ts` for the long-run check. NASA raw data is not bundled into the browser.

29 audio entries are approved by the team, including two music tracks and the sourced Perseverance wind. The nine Factorio-derived entries remain excluded. See CREDITS.md and CONTENT_TODO.md for remaining provenance/listening work.
