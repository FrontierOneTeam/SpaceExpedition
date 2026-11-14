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

## Status

Phase 0: skeleton. The Home screen and the Phaser boot screen work. The game rules and the NASA data files arrive in phase 1.
