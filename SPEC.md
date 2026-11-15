# Outpost Builder: final build specification

For: Claude Code (Opus 5.5), working with a team of six first-year engineering students.
Event: NASA Space Apps. Build window: ends tomorrow.
This is the single current spec. It replaces every earlier `SPEC.md`, changelog and diff. Where another note disagrees, this file wins.

---

## 0. How to work from this spec

1. Build in the phase order in section 14. Each phase ends deployed and playable. Finish and check a phase before starting the next.
2. **Never invent data, science facts or NASA numbers.** Science text comes only from this spec or from files under `src/data/`. If something is missing, write `TODO(content)`, list it in `CONTENT_TODO.md`, and hide that panel in the game. Gameplay text (hints, button labels, Mission Control advice about the player's own base) is yours to write.
3. Keep every tunable number in `src/sim/config.ts`.
4. The simulation (`src/sim/`) is pure, seeded and deterministic. It must not import Phaser, the DOM or `Math.random`.
5. Write the tests in section 13 alongside the code and run them before every commit.
6. If a rule here is ambiguous or contradicts another, stop and ask. Do not guess on anything that affects balance or real data.
7. All in-game text is for ages 7 to 12: short sentences, common words, one idea at a time.
8. When a choice is between a simpler game and a richer one, choose the simpler one. This is a kids' game built in two days.

---

## 1. The product

Outpost Builder is a browser base-building game for kids aged 7 to 12. The player grows a small Mars landing camp into a working outpost on an isometric tile grid. The space weather that tests the base is replayed from real NASA records. Each real period ends with a report, "This really happened", that links what NASA observed to what the player did.

### 1.1 Objective and loop

Player-facing objective: **"Grow your outpost. Keep your crew supplied. Get ready for what comes next."**

Loop: build, watch it produce, spot a shortage, fix it, expand, prepare for the next real event.

Three short chains, and no more:

- sunlight → power → air
- ice → water → food
- rock → soil → shelter and parts

Buildings work on their own when they have power and inputs. Resources are shared across the base. The player places buildings and ends the day. There is no hauling, wiring, piping or crafting.

### 1.2 Rules that keep it clear for a child

- One mode: **Your Outpost**. There is no separate tutorial. The first four goals teach the game and unlock buildings one step at a time (section 7.1).
- Three big meters only: power, air, food.
- One goal on screen at a time.
- Selecting a building shows one sentence: what it costs, what it uses, what it makes.
- Before "End the day", the air and food meters show what tomorrow will bring ("+1 tomorrow").
- Nothing ever requires reading a long page or answering a question to continue.
- One NASA fact on screen at a time, two sentences at most, with the source one tap away.

### 1.3 Learning goals

Every feature must serve at least one.

1. Machines compete for limited power.
2. Mass blocks radiation, so you shelter under soil, and soil costs effort.
3. Shelter blocks sunlight too, so solar panels stay exposed.
4. Local ice and soil can supply a base.
5. Earth is far away, so advice arrives late.
6. Space weather is real, and warnings give time to prepare.

The game's costs, outputs, damage and warning times are a simple model, not NASA engineering values. The game says so (section 9.4).

---

## 2. Platform and stack

| Item | Choice |
|---|---|
| Language | TypeScript, strict mode |
| Build | Vite |
| Rendering | Phaser 3, latest stable 3.x: map, sprites, camera, audio |
| Interface | Plain HTML and CSS over the canvas: meters, menus, panels, report |
| Tests | Vitest |
| Hosting | GitHub Pages, deployed by GitHub Actions on every push to `main` |
| Installable | PWA via `vite-plugin-pwa`: manifest, icons, full screen, offline after first load (phase 4) |
| Backend | None. No accounts, no analytics, no network calls at runtime |
| Saves | `localStorage`, one versioned JSON value (section 12) |

Supported: current Chrome, Safari, Firefox and Edge on laptop, tablet and phone. Minimum width 360 px. Touch and mouse both work. Nothing depends on hover.

Budget: first load under 6 MB, 60 fps on a mid-range phone.

---

## 3. Repository layout

```
/
  SPEC.md
  CONTENT_TODO.md            every TODO(content) item, kept current
  CREDITS.md                 generated from register.json and audio.json
  index.html
  docs/mockups/              optional PNG exports of the design screens
  public/assets/art/         PNG files from the art team (11.1)
  public/assets/audio/       .ogg and .mp3 from the sound team (11.3)
  src/
    sim/                     pure rules
      config.ts  types.ts  rng.ts  terrain.ts  power.ts  day.ts
      placement.ts  weather.ts  goals.ts  predict.ts
      research.ts  notebook.ts          (phase 5)
    data/
      chapters/sep2017.json  the curated chapter (9.3)
      archive.json           ordered list of approved chapter ids
      raw/                   untouched API responses with fetch details
      register.json          NASA resource register (9.5)
      audio.json             per-sound approval and source (11.3)
      cards.json  glossary.json  strings.en.json
      research.json  notebook.json      (phase 5)
    game/                    Phaser scenes: Boot, Map, camera, sprites, astronauts
    ui/                      HTML interface
    save/
  tools/
    fetch-donki.ts           development-time fetch (9.2)
    make-placeholders.ts
    balance-bot.ts
  tests/
```

---

## 4. Simulation

### 4.1 Time

One turn is one day, advanced only by "End the day".

- `state.day` counts the outpost's age from 1 and never resets. The interface calls it a **sol**.
- `chapterDay` is the position inside the current real period, from 1. Its real date is `startDate + (chapterDay − 1)` days.
- The interface shows both as `Sol 9 · 10 Sep 2017`, with a small line `Day 9 of 14 in this chapter`.

Showing one sol as one Earth date is a simplification and is declared as one (9.4).

### 4.2 Resources

| Resource | Kind | Range | Notes |
|---|---|---|---|
| Power | Flow, recomputed each day | 0+ | Stored only in batteries |
| Air | Survival | 0 to 30 | Run ends at 0 |
| Food | Survival | 0 to 30 | Run ends at 0 |
| Crew health | Survival | 0 to 10 | Run ends at 0. +1 on any day with no health loss |
| Parts | Spend | 0+ | Builds most buildings |
| Soil | Spend | 0+ | Builds shelters, feeds the parts factory |
| Water | Spend | 0 to 20 | Greenhouses use it |
| Battery charge | Stored power | 0 to 4 per battery | |
| Crew | Count | 2+ | 2 per habitat |
| Research points | Spend | 0+ | Phase 5 only |

Start of a run: air 12, food 12, water 6, parts 8, soil 0, health 10, crew 2.

### 4.3 Buildings

One tile each, except the soil shelter.

| id | Name | Cost | Power use | Each day, when powered | Placement |
|---|---|---|---|---|---|
| `sun` | Solar panel | 1 part | 0 | +3 power × sunlight | Never under a shelter |
| `batt` | Battery | 2 parts | 0 | Stores up to 4 spare power | |
| `o2` | Oxygen maker | 2 parts | 2 | +3 air | |
| `farm` | Greenhouse | 2 parts | 2, or 3 under a shelter | Uses 1 water, makes +3 food and +1 air. Makes nothing without water | |
| `home` | Habitat | 3 parts | 1 | +2 crew when built. If unpowered and not broken: health −2 | Cannot be removed |
| `mine` | Ice mine | 2 parts | 1 | +2 water | Ice tile only |
| `dig` | Soil digger | 2 parts | 1 | +2 soil | Rock tile only |
| `fab` | Parts factory | 3 parts | 2 | Turns up to 2 soil into 2 parts | |
| `shelter` | Soil shelter | 4 soil | 0 | Covers a 2×2 block. Buildings under it are sheltered | See 4.5 |
| `pad` | Landing pad | pre-placed | 0 | Where the supply rocket lands | Cannot be removed or sheltered |
| `lab` | Research lab | 3 parts | 2 | +1 research point | Phase 5 |
| `nuke` | Reactor | 5 parts | 0 | +6 power always | Phase 5. Never under a shelter |

Each crew member uses 1 air and 1 food per day.

A building can only be chosen once it is unlocked (section 7.1). Locked buildings show greyed in the menu with the goal that unlocks them.

### 4.4 Placement

- A building goes on any revealed, empty tile that is orthogonally adjacent to an existing building.
- `mine` needs an ice tile. `dig` needs a rock tile. Other buildings may go on ice or rock, which wastes the deposit. Warn once.
- Removing a building returns nothing. Habitats, the pad, and shelters with buildings under them cannot be removed.
- Tap a building in the menu, then tap a tile. Valid tiles are highlighted. An invalid tap plays `ui_cant` and shows one short reason.

### 4.5 Soil shelter

- Footprint: a 2×2 block of revealed tiles, addressed by its top tile (lowest row and column).
- May be placed over empty tiles and over existing buildings, except `sun`, `nuke` and `pad`. Shelters may not overlap.
- At least one of its four tiles must hold a building or be orthogonally adjacent to one.
- Buildings may be placed under an existing shelter later, with the same exclusions.
- A building is **sheltered** if its tile is inside a shelter footprint.
- Shelters never break.

### 4.6 Power

Run once to preview today (for the interface) and once for real at end of day.

1. `supply` = `round(3 × sunlight)` per working `sun`, plus 6 per working `nuke`. A panel damaged by a storm makes 1 less while damaged, minimum 0.
2. Consumers are working buildings with power use above 0, habitats first, then oldest first.
3. Walk the list. A consumer is powered if `used + its use ≤ supply + battery charge`. Otherwise it is unpowered today. Keep walking, so a later, cheaper consumer may still be powered.
4. `battery charge = clamp(charge + supply − used, 0, 4 × working batteries)`.

"Working" means not broken.

### 4.7 End-of-day order

Exactly this order. Each step adds to the day's event log, which drives the interface, sounds, astronauts and the report.

1. Resolve power (4.6).
2. Production, powered buildings only: mines add water; greenhouses use water then add food and air; oxygen makers add air; diggers add soil; factories turn soil into parts.
3. Crew use air and food. Clamp to ranges.
4. Each unpowered, unbroken habitat: health −2.
5. Repairs: each broken building's `brokenDays` goes down by 1.
6. Today's weather hits (4.8).
7. Supply rocket: +3 parts when `state.day % 6 == 0`.
8. Goals are checked (section 7). Map growth is applied.
9. Yesterday's prediction is scored (8.2).
10. If nothing reduced health today, health +1, maximum 10.
11. Loss check, in order: air ≤ 0, food ≤ 0, health ≤ 0. Then chapter-end check.
12. `state.day += 1`, `chapterDay += 1`. Autosave.

A chapter end sets `pendingReport` and opens the report. No day runs while a report is open. A loss takes priority over a chapter end.

### 4.8 Weather

Each day has three values from the chapter file.

| Value | Levels | Effect |
|---|---|---|
| `sunlight` | 1, 1/3, 0 | Multiplies panel output |
| `radiation` | 0 to 3 | Table below, applied at step 6 |
| `flare` | none, strong, major | Radio only (4.9) |

| Level | Name shown | Unsheltered habitat | Other unsheltered buildings | Solar panels |
|---|---|---|---|---|
| 0 | Calm | none | none | none |
| 1 | Rising radiation | health −1 | none | none |
| 2 | Radiation storm | health −2 | broken for 1 day | damaged for 1 day |
| 3 | Severe radiation storm | health −3 | broken for 2 days | damaged for 2 days |

A broken building does nothing and uses no power. Health loss from radiation applies once per day if at least one habitat is unsheltered.

### 4.9 Forecast and radio

Keep this simple.

- The weather panel always shows today and tomorrow, inside the current chapter. On a chapter's last day, tomorrow reads "End of these records".
- A `major` flare blocks the radio for the following morning. On the morning after a `major` flare day, Mission Control has no advice and its strip reads "No message from Earth today. Yesterday's solar flare blocked the radio."
- The weather panel, storm warnings, predict questions and "This was real" cards never depend on the radio. They always appear.
- A `strong` flare shows in the weather tile as "Solar flare" and has no other effect.
- The one-day warning and the blackout are part of the game model, not recovered NASA forecasts.

In chapter one this gives blackout mornings on 7, 8 and 11 September. The player meets the 11 September storm with no advice from Earth.

### 4.10 Losing and continuing

- A run ends when air, food or health reaches 0. The screen never says "game over". It shows the failure chain (10.6), a link to a report covering the dates played, and two buttons: **Try again** (new outpost, same site number) and **New site**.
- Your Outpost has no last day. Finishing a chapter shows its report, then play continues with the same base (9.6).

---

## 5. Map

### 5.1 Coordinates

- The site is 12×12 tiles, rows and columns 0 to 11.
- Tile footprint in world units: 128 wide, 64 tall.
- `screenX = (c − r) × 64`, `screenY = (c + r) × 32`, to the tile centre.

### 5.2 Draw order

1. Terrain tiles.
2. Placement highlight and the selected footprint outline.
3. One depth-sorted list of buildings, astronauts and shelters:
   - a building's depth is `r + c`
   - an astronaut's depth is its position's `r + c` plus 0.2
   - a shelter's depth is the `r + c` of its **bottom** tile plus 0.5
   - ties are broken left to right
4. Status badges and labels.

Sorting shelters this way matters: a shelter drawn last of all would cover the buildings in front of it.

### 5.3 Revealed area

The site is generated whole and revealed in rings.

| Size | Rows and columns |
|---|---|
| 6×6 | 3 to 8 |
| 8×8 | 2 to 9 |
| 10×10 | 1 to 10 |
| 12×12 | 0 to 11 |

Unrevealed tiles use `unsurveyed_tile.png` and cannot be built on. A run starts at 6×6 and grows one ring for every second completed repeating goal (7.2), with a "Survey expanded" moment: the camera eases out, new tiles fade in, `evt_survey_expand` plays.

### 5.4 Terrain generation

Input: a site number (integer seed). Same number, same site.

- 8 ice tiles and 8 rock tiles, none on a starting building's tile.
- At least 1 ice tile and 1 rock tile lie within 2 steps (Manhattan distance) of a starting building, so the first mine and digger need at most one connecting building.
- Each later ring holds at least 1 ice and 1 rock tile.
- 6 decorative craters on ordinary ground. They do not block building.

The grid and its deposits are made up. They do not reproduce a measured map of Mars.

### 5.5 Starting base

Habitat (5,5), solar panels (5,6) and (6,5), battery (4,5), landing pad (6,6).

### 5.6 Camera

- Drag to pan, pinch or wheel to zoom, plus on-screen + and − buttons.
- Zoom from "whole revealed area fits" to 2× tile size. Pan is clamped so the revealed area stays on screen.
- At 6×6 the camera starts zoomed so the base fills the view. Do not show a pan hint until the map is 8×8.
- A minimap is optional (phase 4).

---

## 6. Game flow

### 6.1 Home

- Main button: **Start Your Outpost**, or **Continue Your Outpost** when a run is saved.
- Small links: Past reports, Where the data comes from, Settings (sound, start over).

### 6.2 A run

1. A title card for the chapter: its name, its real dates, one sentence of setup, and the line "Real NASA records. Simple outpost model."
2. The guided start (7.1) leads the player through the first four goals.
3. Repeating goals (7.2) and the chapter's real events carry on from there.
4. On the chapter's last day the report opens (10.5).
5. **Keep building** continues with the same base into the next chapter, or into a labelled replay (9.6).

---

## 7. Goals

One goal at a time, shown on a card over the top-left of the map with a progress bar and the reward. Completing a goal gives 3 parts and plays `evt_request_done`.

### 7.1 Guided start

At the start only `sun` and `o2` are unlocked. Each starter goal unlocks the next buildings. Mission Control points at the first action with one highlighted hint. The player can ignore the hint and build freely with what is unlocked.

| # | Goal shown | Done when | Unlocks |
|---|---|---|---|
| 1 | Make air. Build an oxygen maker. | 1 oxygen maker exists | Greenhouse, ice mine |
| 2 | Grow food. Build an ice mine and a greenhouse. | 1 of each exists | Battery, soil digger |
| 3 | Dig soil. Build a soil digger. | 1 digger exists | Soil shelter, parts factory |
| 4 | Take cover. Build a soil shelter over your habitat. | The first habitat is sheltered | Habitat |

With everything built, the base needs more power than two panels give. That is intended. When a machine has no power for the first time, Mission Control says so the next morning and suggests a solar panel.

### 7.2 Repeating goals

After the four starter goals, goals cycle. For goal `k` from 0, with `level = floor(k / 3)`:

| `k mod 3` | Goal | Done when |
|---|---|---|
| 0 | House `4 + 2 × level` crew | crew ≥ target |
| 1 | Fill your stores | A day ends with air ≥ 20 and food ≥ 20. Once research exists (phase 5): finish `1 + level` research projects instead, until all six are done |
| 2 | Stockpile `8 + 4 × level` parts | parts ≥ target |

- Every second completed repeating goal grows the map by one ring, until 12×12. Say so on the goal card before it happens: "Reward: 3 parts and more land."
- At most three goals may complete in one day.
- The goal counter carries on across chapters and replays.

---

## 8. Learning features

### 8.1 "This was real" cards

The morning after a day that has a card in the chapter file, show a dismissible card: the title "This was real", the real date, two sentences, the source name, and a link. Play `mc_real_event`. It never blocks play.

### 8.2 Predict question

Purpose: the player commits to a guess before seeing the result.

- At the start of a day, if tomorrow's radiation is 2 or more, today's is below 2, and the player has at least one unsheltered, unbroken building that would break, the Mission Control strip asks about one of them, preferring a greenhouse, then an oxygen maker. The "today below 2" condition means the question is asked once, the day before a storm begins.
- Question: "A storm reaches you tomorrow. What will happen to your [building]?" Answers: **It will be fine** and **It will break**. A **Skip** control is always there.
- Scored at step 9 of the next end-of-day. If the player answered "it will break" and then sheltered it, count that as right and say "You saw it coming and fixed it."
- At most one question per day. No reward, no penalty. A friendly sound and a tally in the report.
- A radio blackout does not stop it (4.9).

### 8.3 Tap-to-explain words

`src/data/glossary.json` maps a word to one sentence. Glossary words in interface text get a dotted underline. Tapping one shows the sentence in a small bubble. Approved starting entries:

| Word | Sentence |
|---|---|
| sol | A sol is one day on Mars. It is about 40 minutes longer than a day on Earth. |
| solar flare | A solar flare is a sudden, bright burst of energy from the Sun. |
| class X | Flares are sorted into classes. X is the strongest class, then M, then C. |
| radiation | Radiation here means tiny, fast particles from space that can harm living things. |
| particle storm | A particle storm is a burst of very fast particles thrown out by the Sun. |
| regolith | Regolith is the loose soil and broken rock on the ground of Mars and the Moon. |
| oxygen | Oxygen is the part of air that people need to breathe. |

Use "soil" in normal text. Use "regolith" once, in the shelter description, with its explanation.

### 8.4 Later learning features (phase 5)

- **Research.** A lab earns research points. Six upgrades, unchanged from earlier versions: `fore` storm forecasting (2 points, forecast shows 3 days), `rec` water recycling (3, greenhouses use half the water), `soil` soil-covered habitats (3, habitats count as sheltered everywhere), `pan` better solar panels (4, +1 power per panel), `split` water splitting (4, each powered ice mine also makes 1 air), `nuke` small reactor (6, unlocks the reactor). Each card shows the game effect and, separately, one sourced real-world example. Cards without an approved example show the effect only.
- **Field notebook.** A page unlocks the first time the player builds each building or meets each event: a title, two sentences, one image, a named source. Page text is `TODO(content)` until a teammate writes and sources it.
- **Real-world notes** on buildings, such as a real oxygen-making experiment for the oxygen maker. Same rule: sourced text or nothing.

---

## 9. Real data

### 9.1 Principles

- The game makes **no network calls at runtime**. Data is fetched during development by scripts in `tools/`, saved under `src/data/raw/` with `sourceUrl`, `fetchedAt` and the exact query, and committed.
- Curated chapter files are built from raw files by the rules in 9.3. Any hand edit goes in a `notes` field.
- The interface says "real NASA records" with their dates. It never says or implies "live".
- A seed may vary the made-up site. It never creates, moves, shuffles or strengthens a NASA event.
- "No record found" is not proof of calm. Days without a fetched record are filled from the fetched response, never assumed.
- Readings from one place are never shown as readings from another. Space station values are not Mars values.
- One well-sourced chapter replayed is better than several weak ones.

### 9.2 DONKI flare records (checked 14 November 2026)

Base: `https://ccmc.gsfc.nasa.gov/DONKI-API/get/`. No API key was needed.

This query returned 33 flare records with `beginTime`, `peakTime`, `classType` and `activeRegionNum`:
`https://ccmc.gsfc.nasa.gov/DONKI-API/get/FLR?startDate=2017-09-04&endDate=2017-09-11`

Use it as a test fixture. It must contain these four X-class flares, all from active region 12673:

| peakTime (UTC) | classType |
|---|---|
| 2017-09-06T09:10Z | X2.2 |
| 2017-09-06T12:02Z | X9.3 |
| 2017-09-07T14:36Z | X1.3 |
| 2017-09-10T16:06Z | X8.2 |

It also contains 27 M-class, 1 C-class and 1 B-class flare. The strongest flare on the other days was M5.5 on 4 September, M4.2 on 5 September, M8.1 on 8 September, M3.7 on 9 September and B9.8 on 11 September.

`tools/fetch-donki.ts` fetches `FLR` for 2 to 15 September 2017 and commits the raw response. Do not fetch other DONKI event types unless a record from them is shown in the game. Earth geomagnetic storms say nothing about Mars and are not used.

### 9.3 The chapter file

`src/data/chapters/sep2017.json`. One entry per date, 2 to 15 September 2017, 14 days.

```json
{
  "id": "sep2017",
  "title": "The September 2017 storms",
  "site": "mars",
  "startDate": "2017-09-02",
  "setup": "A giant sunspot is turning to face you.",
  "days": [
    { "date": "2017-09-06", "sunlight": 1, "radiation": 0, "flare": "major",
      "flares": [ { "peakTime": "2017-09-06T12:02Z", "classType": "X9.3" } ],
      "cardId": "sep2017-06" }
  ],
  "simplified": [ "..." ]
}
```

Rules for each day:

- `flare`: `major` if the day has an X-class flare, else `strong` if it has a flare of M5.0 or above, else `none`. From the fixture: major on 6, 7 and 10 September; strong on 4 and 8 September.
- `radiation`: level 3 on 11 September, level 2 on 12 September, level 1 on 13 September, and 0 on every other day. This follows the storm that NASA's Curiosity rover measured on the Mars surface, reported by NASA JPL and Southwest Research Institute in late September 2017: radiation more than double anything the rover had recorded before, lasting more than two days. The three levels are a game mapping of that report, not instrument values.
- `sunlight`: 1 on every day. This is a model baseline, not a measured value.
- 10 September is the warning day. The weather panel shows tomorrow's storm, and the predict question is asked.

Approved card text, in `src/data/cards.json`. A teammate should read each against its source before release.

| cardId | Shown the morning after | Text | Source id |
|---|---|---|---|
| `sep2017-06` | 6 Sep | On this day in 2017 the Sun fired two giant flares. One was class X9.3, the biggest of that whole solar cycle. | `donki` |
| `sep2017-07` | 7 Sep | The same sunspot flared again: class X1.3. Scientists call that sunspot region 12673. | `donki` |
| `sep2017-10` | 10 Sep | A class X8.2 flare burst from the Sun at 16:06 UTC. Fast particles from it were now racing toward Mars. | `donki` |
| `sep2017-11` | 11 Sep | The particles hit Mars. NASA's Curiosity rover measured radiation on the ground more than double anything it had recorded before. | `curiosity-rad` |
| `sep2017-12` | 12 Sep | The high radiation lasted more than two days. From orbit, NASA's MAVEN spacecraft saw Mars glow with an aurora 25 times brighter than any it had seen. | `curiosity-rad` |

The "biggest of that solar cycle" statement comes from a space weather review of 4 to 15 September 2017 (`https://www.stce.be/esww15/program/Sept_2017_activity_summary.pdf`). Add it to the register as `stce-review` if the card ships.

### 9.4 Honesty rules in the interface

- A persistent small line under the date: "Real NASA records. Simple outpost model."
- Every day shows its real date.
- The report has a **Real / Simplified** box:
  - Real: the flare dates, times and classes; the radiation storm at Mars on 11 September 2017.
  - Simplified: storm levels 1 to 3 are game levels, not measurements; what breaks and how much health is lost; the one-day warning; the radio blackout; steady sunlight in this chapter; one sol shown as one Earth date; the outpost and its site are made up.
- A real-recording label on a sound appears only when `audio.json` marks that file as a checked real recording (11.3).

### 9.5 Resource register

`src/data/register.json` is the single source for the in-game **Where the data comes from** screen and for `CREDITS.md`.

```json
{ "id": "donki", "name": "DONKI space weather records",
  "url": "https://ccmc.gsfc.nasa.gov/tools/DONKI/",
  "group": "listed", "kind": "data",
  "usedFor": "Real flare dates and classes in every chapter",
  "status": "used" }
```

`group` is `listed` (on the challenge's resource list) or `additional`. `kind` is `data`, `image`, `sound` or `reading`. `status` is `used`, `planned` or `not used`. The screen shows only `used` rows, split into the two groups. A row becomes `used` only when its exact record, text or file is in the released game.

Core rows, needed for the submission:

| id | group | kind | Used for | URL |
|---|---|---|---|---|
| `donki` | listed | data | Flare dates and classes | `https://ccmc.gsfc.nasa.gov/tools/DONKI/` |
| `curiosity-rad` | additional | reading | The Mars radiation storm of 11 September 2017, and the MAVEN aurora | `https://www.swri.org/node/11852` and the matching NASA JPL release. `TODO(content)`: add the NASA link and its date |

Rows a teammate can add as content becomes ready. Each needs a person to pick the exact record and write two sourced sentences. Listed-group rows first, because they come from the challenge's own list:

| id | group | Idea |
|---|---|---|
| `osdr-plants` | listed | One named plant experiment from NASA's Open Science Data Repository, as the greenhouse's real-world note |
| `csa-food` | listed | The Canadian Space Agency food-production toolkit, supporting the same note |
| `mars-trek` | listed | One credited image of a real Mars region for the chapter title card |
| `radlab` | listed | Space station dose readings for the same week, shown in the report as a separately labelled comparison. A query for 10 to 12 September 2017 returned rows from `DosTel1`, `DosTel2` and `RAD-COL1A2-pre`, but the dose-rate column has not been retrieved yet |
| `perseverance-wind` | additional | The Mars wind ambience, once its exact clip link is recorded |
| `moxie`, `iss-water`, `iss-oxygen`, `regolith-shield`, `mmpact`, `solar-arrays`, `kilopower`, `insight-power`, `mars-ice`, `mars-comms`, `human-health` | additional | Real-world examples for buildings and research cards in phase 5. If `NASA_DATA_INVENTORY.md` exists in the repo, take their links from it. Otherwise they stay `TODO(content)` |

The Mars Rover Photos API is archived. Do not use it.

### 9.6 Continuing and replays

`src/data/archive.json` is an ordered list of approved chapter ids. At submission it may hold only `sep2017`.

On **Keep building** after a report:

1. Keep the whole base and `state.day`.
2. Move to the next chapter in the list and set `chapterDay = 1`.
3. After the last chapter, go back to the first and add 1 to `replay` (starts at 1). Show "Replay 2 of the September 2017 records" on the title card and under the date.
4. Clear `pendingReport` and save. Opening the report or pressing the button never uses a day or gives parts.

A replay uses the same dates, events and strengths. It never claims the event happened again and never makes it stronger. The player's larger crew is what makes it harder.

### 9.7 Candidate second chapter: May 2024 (phase 6, not yet curated)

NASA reported that on 20 May 2024 a flare later estimated at class X12 sent particles to Mars, and that the Curiosity rover measured its biggest radiation surge since landing: 8,100 micrograys, about 30 chest X-rays (`https://www.nasa.gov/solar-system/planets/mars/nasa-watches-mars-light-up-during-epic-solar-storm`).

Before it can be a chapter, a person must settle: the date range; which days get which radiation level, with the reasoning written down; and whether DONKI lists the 20 May flare at all, since NASA estimated its class from a spacecraft away from Earth. Do not build it from this paragraph alone.

---

## 10. Interface

The interface follows the three reference screens (Mars, Moon and phone). If PNG exports exist in `docs/mockups/`, match them. The descriptions below are the rules.

Look: dark panels (`#211926` on `#15101a`), warm off-white text (`#f4ede7`), amber for the main action and the goal (`#f2a53a`), a soft red-orange for danger (`#ff9478`). Headings in Chakra Petch, body in Atkinson Hyperlegible, both from Google Fonts.

### 10.1 Layout

- **Wide (≥ 900 px):** an 80 px top bar; the map on the left; a 380 px side panel on the right.
- **Narrow:** top bar with date; a row of three compact meters; the map; the Mission Control strip; a horizontally scrolling build bar; a row with stock counts and a large "End the day" button.
- Tap targets at least 44×44 px. Body text at least 14 px, 16 px where space allows.
- Colour is never the only signal. Every state also has an icon or a word.
- Respect `prefers-reduced-motion`.

### 10.2 Top bar

Left to right: logo, game name and site ("Mars · Site 4821"); the date chip (`Sol 9`, the real date, and "Real NASA records"); three meters; crew health as ten small marks with the crew count; buttons for sound, notebook (phase 5) and sources.

Each meter has its icon, a big number and one small line:

- Power: the number made today, with "needs 8". Danger style when needs exceed supply plus battery.
- Air and food: the stock, with tomorrow's change ("+1 tomorrow", "−1 tomorrow"). Warning style at half, danger style at a quarter or when the change is negative and the stock is under 10.

### 10.3 Over the map

- **Goal card**, top left, amber border: "Your next goal", the goal, a progress bar, and the reward.
- **Zoom buttons**, top right.
- **Placement:** valid tiles highlighted; for a shelter, a 2×2 outline with the label "Tap to place the shelter here".
- **Badges:** a small shield and the word "Sheltered" above each shelter; `icon_no_power` above an unpowered building; `icon_broken` above a broken one.
- **Mission Control strip**, along the bottom (10.4).

### 10.4 Mission Control

A portrait (calm, worried or cheering to suit the message), a small line "Mission Control · sent 12 minutes ago", and one message at a time. The 12 minutes is fixed for this chapter and declared as simplified.

Message priority: predict question; tomorrow's weather warning; then advice from Earth, which is a problem that began yesterday ("Your oxygen maker had no power yesterday"), goal progress, or an idle tip. On a blackout morning (4.9) the advice is replaced by the blackout line. The predict question and the weather warning still show.

Advice about the base always refers to yesterday. That one-day lag is the communication-delay lesson. Meters, costs and placement feedback are always immediate. `mc_radio_open` and `mc_radio_close` wrap each message.

### 10.5 Side panel

Top to bottom:

1. **Space weather.** Two tiles side by side, Today and Tomorrow, each with an icon, a short name and one short line. Tomorrow gets a danger border when radiation is 2 or more. Below: "Real NASA records from [dates]."
2. **Build.** A header with small counts for parts, soil and water. A three-column grid of buttons, each showing the building's own picture, its name, and its cost with the parts or soil icon. The selected one has an amber border. Locked ones are greyed. Below the grid, one sentence about the selected building.
3. **End the day**, a large amber button, always visible.

### 10.6 Failure chain

When a run ends, walk the event log back from the resource that hit 0 to its nearest cause and show three linked panels with icons, for example: "The storm broke the greenhouse" → "Food fell for 3 days" → "Food ran out on sol 12". Use fixed templates keyed by event type. If no chain can be built, show the direct cause alone.

### 10.7 Report: "This really happened"

Shown at the end of each chapter, and reachable later from Past reports.

- Heading **This really happened**, the real period, and the replay number if any.
- A short timeline, one row per card date: **What NASA observed** (from `cards.json`) and **What happened in your base** (from the event log: what was sheltered, what broke, health lost). Keep the two columns visibly separate. Nothing about the made-up base is stated as history.
- **Your outpost grew:** crew, buildings added, goals completed, land surveyed, predictions right out of asked.
- **What you traded:** at most two sentences from fixed templates grounded in the log.
- The **Real / Simplified** box (9.4).
- **Where the data comes from:** the `used` register rows.
- Main button: **Keep building**, with one line saying what comes next. Second button: **New site**, with a confirmation built into the page.

The player can press Keep building without reading anything. Play `evt_chapter_complete` once, then `mus_report`.

### 10.8 Text

All player-facing text lives in `src/data/strings.en.json`. No string literals in components.

---

## 11. Assets

The game must run fully on placeholders. `tools/make-placeholders.ts` generates each missing file as a labelled shape or a short tone at the right size, with a sidecar `.placeholder` file, and never overwrites a real file. Real files replace placeholders by name with no code change.

### 11.1 Art (delivered and checked)

All 34 files are delivered with the right names, sizes and clean transparency. They were checked by placing them on the grid as still images, not in the running game.

Delivered at 2×: tile diamond 256×128 px. Draw at 0.5 scale.

| File | Canvas | Origin |
|---|---|---|
| `habitat.png`, `solar_panel.png`, `battery.png`, `oxygen_maker.png`, `greenhouse.png`, `ice_mine.png`, `soil_digger.png`, `parts_factory.png`, `research_lab.png`, `reactor.png`, `landing_pad_rocket.png` | 256×320 | Bottom centre, placed at the tile's bottom corner |
| `soil_shelter.png` | 512×480 | Bottom centre, placed at the bottom corner of the 2×2 block |
| `ground_mars_1.png`, `ground_mars_2.png`, `ice_tile.png`, `rock_tile.png`, `unsurveyed_tile.png`, `crater_small.png` | 256×128 | Centre |
| `ground_moon_set.png` | 768×128, three cells: ground, ice, rock | Centre. Phase 6 |
| `astronaut_sheet.png` | 768×640, cells 96×128, rows: idle (2), walk (6), dance (8), shiver (2), run (6) | Bottom centre |
| `mission_control.png` | 576×192, three 192×192 frames: calm, worried, cheering | |
| `icon_power`, `icon_air`, `icon_food`, `icon_parts`, `icon_soil`, `icon_water`, `icon_research`, `icon_no_power`, `icon_broken`, `icon_storm`, `icon_dust`, `icon_dark` `.png` | 128×128 | |
| `logo.png` | 192×192 | |

Rules that came out of the check:

- Building images include their own foundation pad. Do not draw another.
- Use `ground_mars_2.png` for all ordinary ground. Do not mix in `ground_mars_1.png`: it is much darker and reads as a different kind of terrain.
- `soil_shelter.png` is already see-through. Draw it at 80% of its own opacity (`SHELTER_ALPHA` in config) so the buildings under it stay readable, and always draw the "Sheltered" badge, because the mound alone is easy to miss.
- Draw astronauts at 0.4 scale, slightly smaller than buildings.
- Unpowered buildings are tinted darker. Broken buildings flicker slowly. Damaged panels get a light tint.
- Use the building PNGs, scaled down, as the build-menu pictures.
- Compress the PNGs at build time.

Art still wanted, each with a code fallback so nothing blocks:

| Wanted | Why | Fallback |
|---|---|---|
| A clearer soil shelter, ideally as two files, `soil_shelter_back.png` and `soil_shelter_front.png`: a low, solid soil wall around the block, drawn behind and in front of the buildings | The delivered mound tints the buildings and is hard to see as an object | The current file at 80% opacity plus the badge |
| `icon_radiation.png` | `icon_storm.png` is a sun and reads as fine weather | `icon_storm.png` with the danger border and the words |
| `icon_calm.png` | Needed for calm days in the weather tiles | A simple inline sun-and-sky shape |
| For the Moon: `soil_shelter_moon.png`, a Moon crater | The delivered shelter and crater are Mars-coloured | Phase 6 only |

### 11.2 Astronauts (phase 4)

Decoration that mirrors the base's state. Never player-controlled, never part of the simulation.

- One astronaut per crew member, up to 8.
- Idle: wander between buildings along tile centres, pausing 2 to 5 seconds.
- Tomorrow's radiation is 2 or more: all run to the nearest habitat and stay near it.
- A habitat was unpowered yesterday: shiver near it.
- Goal or chapter completed: all dance for 3 seconds with `astro_dance`.
- Tapping an astronaut makes it dance once.
- Mirror the sprite for the opposite direction.

### 11.3 Audio

Each sound exists as `.ogg` and `.mp3`. Give Phaser both and let it pick one. Three volume groups: ambience 0.5, effects 1.0, music 0.6. One ambience loop and at most one music track play together, both lowered while a message sound plays. A mute button, state saved. No sound before the first tap. A missing or unapproved file is silent.

`src/data/audio.json` has one entry per sound:

```json
{ "name": "amb_mars_wind", "approved": true, "realRecording": false,
  "source": "", "sourceUrl": "", "edits": "" }
```

The game loads only entries with `approved: true`. The "Now playing: Mars wind, recorded by the Perseverance rover" line shows only when `realRecording` is true **and** `sourceUrl` holds the exact original clip.

Delivered audio, measured on 14 November 2026. All 37 named sounds are present in both formats at 44.1 kHz, about 2.4 MB per format. They were measured, not listened to.

**Do not ship these nine until replaced.** The delivered credits log says they were taken from the game Factorio. Those are another company's copyrighted files. Set `approved: false`.

`amb_moon_base`, `ui_open_panel`, `bld_power_up`, `bld_repaired`, `evt_storm_warning`, `evt_rocket_land`, `evt_survey_expand`, `prd_question`, `astro_dance`

**Fix before approving:**

| File | Problem |
|---|---|
| `amb_mars_dust_storm` | First 6.0 of 17.9 seconds are silent, so the loop has a gap. Unused in chapter one |
| `mus_calm_loop` | First 5.4 of 32.9 seconds are silent |
| `mus_report` | First 2.0 seconds are silent |
| `amb_mars_wind`, `amb_mars_dust_storm` | Peaks near −6 dB, louder than the −12 dB target. The ambience group volume above compensates |
| `amb_mars_wind`, `amb_mars_dust_storm`, `mc_radio_open`, `mc_radio_close` | Described as real NASA recordings, with no link to the exact original clip. Usable as sounds; `realRecording` stays false until the links are recorded |
| `mus_calm_loop`, `mus_report` | The log does not say who made the music or with what. Record that before approving |

The log's stated lengths do not match the files (for example 60 seconds for music that runs 33), so treat the log as unchecked.

`mus_storm_intense` is an extra file. Do not use it. Storms use `amb_solar_storm` and the event sounds only.

Sound names and when they play: `ui_tap`, `ui_select`, `ui_cant`, `ui_open_panel`, `ui_end_day` for interface actions; `bld_place`, `bld_remove`, `bld_power_down`, `bld_power_up`, `bld_broken`, `bld_repaired` for building events; `evt_storm_warning` when tomorrow's radiation is 2 or more; `evt_storm_hit`; `evt_rocket_land`; `evt_survey_expand`; `evt_request_done`; `evt_chapter_complete`; `evt_run_over`; `prd_question`, `prd_right`, `prd_wrong`; `mc_radio_open`, `mc_radio_close`, `mc_typing`, `mc_real_event`; `astro_dance`, `astro_shiver`; `amb_mars_wind` always on Mars; `amb_solar_storm` on radiation days; `mus_calm_loop` while building; `mus_report` on the report. `evt_dust_arrive`, `evt_night_fall`, `evt_research_done`, `evt_notebook_page`, `amb_mars_dust_storm` and `amb_moon_base` belong to later phases.

---

## 12. Saving

One `localStorage` key, `outpost-builder-save-v1`.

```json
{ "version": 1, "muted": false, "reports": [], "notebook": [],
  "outpost": { "siteNumber": 4821, "chapterId": "sep2017", "replay": 1,
               "chapterDay": 1, "pendingReport": false, "state": { } } }
```

- Autosave at the end of every day and after every report transition.
- Reloading with `pendingReport: true` reopens the report. It must not run a day, repeat a reward or restart the base.
- A report entry stores the chapter id, replay number, sol range and its timeline rows. It is read-only.
- Wrap all storage access in try/catch. The game must run with storage unavailable.
- On a version mismatch, keep `reports` and `notebook` if readable and discard the outpost.
- "Start over" and "New site" confirm inside the page. Never use `alert`, `confirm` or `prompt`.

---

## 13. Testing

### 13.1 Unit tests

- Determinism: same seed and same actions give an identical final state.
- Terrain guarantees in 5.4 hold for seeds 1 to 500.
- Power: habitats first; batteries stay within capacity; a later, cheaper consumer can still be powered.
- Each row of the building table does exactly what it says.
- Unlocks: only unlocked buildings can be placed; each starter goal unlocks the right ones.
- Shelter: placement rules, exclusions, the sheltered test, greenhouse uses 3 power under a shelter.
- Radiation: each level's effect on sheltered and unsheltered buildings, panels and health.
- Health recovers only on days with no loss.
- Goals: starter sequence, repeating sequence, map growth after every second repeating goal.
- Predict: asked once on 10 September and not again on 11 September; scored the next day, including the "saved it after answering" case.
- Radio: no Mission Control advice on the mornings of 7, 8 and 11 September; the weather panel and predict question still appear on those mornings.
- Chapter loader: `chapterDay` 5 is 6 September 2017; the fixture gives major on 6, 7 and 10 September and strong on 4 and 8 September; radiation is 3, 2, 1 on 11, 12, 13 September and 0 elsewhere.
- Continue: base, crew, resources, goals and revealed land persist; `state.day` keeps counting; `chapterDay` resets; a replay has identical events and gives no free day or parts.
- Content: every card and visible fact resolves to a register row; no `TODO(content)` string can reach the screen; unapproved audio is never loaded.
- Save round trip, pending-report reload, version mismatch.

### 13.2 Smoke test

A scripted run starts Your Outpost, plays 3 days through the real interface code with Phaser stubbed, and asserts no exceptions. A second run goes from the last chapter day through the report and Keep building into a replay, reloads with the report pending, and checks the base is intact and one click cannot advance two days.

### 13.3 Balance bot

`tools/balance-bot.ts` plays headless and prints a table. 300 runs each on chapter one.

| Bot | Behaviour | Target on chapter one |
|---|---|---|
| Idle | Ends every day without building | Never survives. The run ends around sol 6 |
| No shelter | Follows starter goals 1 to 3, keeps power above demand, never builds a shelter | Usually survives, but ends the chapter with health 5 or less and at least two buildings broken by the storm |
| Sensible | Follows all four starter goals, shelters the habitat before sol 10, then expands | Survives over 90% of runs with health 8 or more |
| Careless | Builds random unlocked, affordable buildings on random valid tiles | No target. Report the result |

The intent: skipping the shelter must visibly hurt without ending a first-time player's run. A two-crew base that never shelters loses 6 health across 11 to 13 September and has its machines down for three days. Replays with a larger crew are where carelessness ends a run.

Also run the sensible bot through three replays to catch stalls. Tune `config.ts` until the targets hold and put the table in the commit message.

A quick non-spatial model of these rules, run while writing this spec, gave: idle ends on sol 6; a player acting only every second day still completes all four starter goals by sol 10; a player who never shelters finishes at health 4. That model ignored tile positions. No child has played the game yet, and a ten-minute test with a real child outranks every number here.

---

## 14. Phases and cut lines

If time runs out, the last finished phase ships.

| Phase | Contents | Check |
|---|---|---|
| 0. Skeleton | Repo, Vite, TypeScript, Vitest, Phaser boot, GitHub Pages workflow, placeholder generator, strings file, Home screen | The public URL loads on a phone |
| 1. Rules and data | Section 4, terrain, goals, the chapter file, the DONKI fetch and fixture, unit tests, balance bot | Tests pass. Bot table printed |
| 2. Playable outpost | Map with the delivered art, placement, shelter, the three meters, weather panel, goal card and guided start, Mission Control strip, End the day, failure chain, save | **Cut line A.** A child can start, follow the four starter goals, and meet the 11 September storm, on a phone |
| 3. The real payoff | "This was real" cards, predict question, the report, Real / Simplified box, sources screen, Keep building and replay, repeating goals, map growth, pan and zoom | **Cut line B. Submit this.** Chapter one is playable end to end and every real date on screen traces to committed data |
| 4. Life | Astronauts, approved audio, PWA install and offline, reduced motion, minimap | Installs to a home screen. Only approved sounds play |
| 5. Depth | Research lab and the six upgrades, field notebook, real-world notes, more glossary words | Every shown fact has a source. Unready panels stay hidden |
| 6. Extras | May 2024 chapter, the Moon site with its own real records, a "For teachers" page | Only after everything above |

Not in scope: accounts, multiplayer, leaderboards, purchases, voice lines, 3D, runtime API calls, a native app, conveyors, pipes or wires to connect, recipes, combat, extra currencies, practice or invented weather.

---

## 15. Done means

- The public URL loads in under 5 seconds on a phone with no login.
- Your Outpost starts directly. Its goal is always visible in plain words.
- A player can complete September 2017 without errors and keep building afterwards.
- The report shows the real dates and flare classes from the committed DONKI data, and keeps NASA's observations separate from the made-up base's story.
- The sources screen lists every NASA resource actually used, split into listed and additional.
- No Factorio-derived sound, and no sound without `approved: true`, is in the released build.
- No `TODO(content)` text is visible anywhere.
- `README.md` explains the game, how to run it, where the data comes from, what is real and what is simplified, and how AI tools were used to build it.

---

## 16. Clarifications agreed on 15 November 2026

These settle rules above that were unclear or contradicted each other. Where this section differs from an earlier one, this section wins.

### 16.1 Team decisions

1. **Factorio-derived sounds (11.3, 15).** The nine sounds are kept out of git by `.gitignore`, so they never reach GitHub. The files stay untouched on the team's own PCs. They stay `approved: false` and are never loaded. A missing sound is silent, so the game runs without them.
2. **No-shelter bot target (13.3).** The target reads "lowest health during the chapter is 5 or less". The rules in section 4 are unchanged, so that base reaches 4 and ends the chapter at 6.
3. **Repeat storm hits add days (4.8).** A hit on a building that is already broken, or a panel that is already damaged, adds its days to the days left. A base hit on 11 September has its unsheltered machines down on 12, 13 and 14 September. The interface always shows how many days are left.
4. **What a storm breaks (4.8).** A habitat never breaks. The words "not broken" in 4.3 and "unbroken" in 4.7 step 4 have no effect. The landing pad breaks like any other unsheltered building. If the pad is broken at step 7, no supply rocket lands that day. That delivery is lost, not delayed. Step 7 comes after that day's storm.

### 16.2 Readings and defaults

| Section | Rule |
|---|---|
| 2, 10 | Fonts are bundled with the game. Nothing is fetched from Google at runtime. |
| 4.2 | Battery charge starts at 0. |
| 4.3 | The parts factory turns 1 soil into 1 part, up to 2 a day. With 1 soil it makes 1 part. |
| 4.4 | The pad counts as a building for "adjacent to an existing building". An empty tile under a shelter does not. Removing a building needs no connection check. |
| 4.7, 7.1 | Goals are checked only at step 8 of End the day, not at the moment of building. |
| 5.4 | The guaranteed ice tile and rock tile near the base lie inside the starting 6×6. |
| 5.5 | Coordinates are (row, column). |
| 6.1 | A Home link is shown only once its screen exists. |
| 8.2 | A prediction is scored at step 9 of the end of the storm day, the day after it was asked. The pad is never the subject of a predict question. |
| 9.1, 9.3 | A day with no flare record in the fetched response gets `flare: "none"`, an empty `flares` list and a `notes` line. The game never calls such a day quiet. |
| 9.2 | Both raw responses are committed: 4 to 11 September (the test fixture) and 2 to 15 September (the chapter source). Each is saved untouched, with a small file beside it holding `sourceUrl`, `fetchedAt` and the query. |
| 9.3 | Each day's `flares` lists every flare of M5.0 or above, by `peakTime` date in UTC. `tools/build-chapter.ts` builds the chapter file from the raw response. |
| 9.3, 9.5 | Card `sep2017-06` names two sources, `donki` and `stce-review`. `stce-review` is in the register as `additional`, `reading`. |
| 9.5 | `curiosity-rad` ships with the SwRI link. The NASA link stays in `CONTENT_TODO.md` and is never shown as a placeholder. |
| 10.8 | "No string literals in components" is the rule. Science and source text stays in its own data file: chapter, cards, glossary, register. |
| 11 | The placeholder generator copies two small tone clips kept in `tools/`. |
| 11.3 | Every sound is `approved: false` until the team confirms it in phase 4. |
| 14 | Phase 1 holds the predict rules, the Keep building rules, `cards.json` and `register.json`. The glossary arrives with its screen in phase 3. |

### 16.3 Decided while the team was away (15 November 2026), for the team to confirm

Each line is a reading the build needed while no one could be asked. Change any of them freely.

| Section | Decision | Why |
|---|---|---|
| 4.6, 4.8 | A broken battery gives no power. Charge above `4 × working batteries` is lost before the power step. | 4.8 says a broken building does nothing, and 4.2 says power is stored only in batteries. |
| 4.9 | A `major` flare shows in the weather tile as "Big solar flare". | 4.9 names only the `strong` label. |
| 8.2 | The report's tally is "right out of answered". A skipped question is not counted. | 8.2 says a skip carries no penalty. |
| 8.2 | The predict question is fixed at the start of the day. It does not change if the player builds before answering. | Simplest reading. |
| 9.4 | The seven "Simplified" lines in the chapter file are short full sentences made from the fragments in 9.4. | The box needs sentences a child can read. |
| 9.3 | Card `sep2017-06` now ends "the biggest flare that solar cycle had seen". | The sources were written in 2017, while the cycle was still going. They say "current solar cycle", not the whole cycle. |
| 9.3 | Card `sep2017-10` now reads "A class X8.2 flare reached its peak at 16:06 UTC. It came from the same sunspot region, 12673." | 16:06 is the peak time. No official source ties the particles at Mars to this flare, so that line was removed. |
| 9.3 | Card `sep2017-11` now starts "A blast from the Sun hit Mars." | Same reason. The NASA JPL release says a blast from the Sun hit Mars and dates it 11 September 2017. |
| 9.3 | Card `sep2017-12` now says "more than 25 times brighter". | The NASA JPL release says "more than 25 times brighter". |
| 9.5 | `curiosity-rad` is now the NASA JPL release of 29 September 2017 (opened and read on 15 November 2026). The SwRI page is its own row, `curiosity-rad-swri`. `stce-review` is `used`. | Closes the `TODO(content)` in 9.5. |
| 13.3 | A site has only 8 ice tiles. That caps water, and so crew, from about the fourth play of the chapter. | Found by the balance bot. No number was changed. |
| 13.3 | No balance number was changed. The sensible bot completes about 16 goals in the first chapter, so the map reaches 12×12 early. | No target covers pace. A playtest with a child should judge it. |
