# Content still to do

Each line says what is missing and where in SPEC.md it comes from.

## Sources (SPEC 9.5)

- Optional register rows a teammate can add, each with the exact record and two sourced sentences:
  - `osdr-plants`
  - `csa-food`
  - `mars-trek`
  - `radlab`
  - `perseverance-wind` — implemented in the local takeover
- Phase 5 rows. Take links from `NASA_DATA_INVENTORY.md` if it exists, otherwise leave as TODO(content):
  - `moxie`
  - `iss-water`
  - `iss-oxygen`
  - `regolith-shield`
  - `mmpact`
  - `solar-arrays`
  - `kilopower`
  - `insight-power`
  - `mars-ice`
  - `mars-comms`
  - `human-health`

## Learning text (SPEC 8.4)

- Notebook and building notes now use reviewed text from docs/content-research/verified.json. Habitat and soil-digger pages have no approved fact yet and stay hidden. NASA instrument imagery remains optional future content.
- Real-world notes on buildings, each with a named source.
- Research card real-world examples, each with a named source.

## Audio (SPEC 11.3, 16)

- Replacements for the nine Factorio-derived sounds, which stay `approved: false` and are never loaded: `amb_moon_base`, `ui_open_panel`, `bld_power_up`, `bld_repaired`, `evt_storm_warning`, `evt_rocket_land`, `evt_survey_expand`, `prd_question`, `astro_dance`. The game is silent for them until new files are added and approved.
- Who made the two music tracks, and with what: `mus_calm_loop`, `mus_report`. They are approved on the team's responsibility (SPEC 16.4).
- Exact original clip links for the other sounds described as real NASA recordings: `amb_mars_dust_storm`, `mc_radio_open`, `mc_radio_close`. Until then they stay `realRecording: false` and show no "Now playing" line. The delivered `amb_mars_wind` is no longer played unless the NASA wind fails to load.
- Done: `amb_mars_wind_real` is NASA's SuperCam recording (credit and clip link in `audio.json`, page in the register as `perseverance-wind`).
- Someone should listen to every approved sound once, including the NASA wind looped, and the music after its silent start is skipped (`startAt`). Only measured so far, never listened to.

## Cards (SPEC 9.3)

- A teammate reads each card in `cards.json` against its source before release.

## Later chapters (SPEC 9.7)

- May 2024 is integrated into the May 2024 archive month. Its May 20 surface mapping and DONKI omission are documented; other dates remain model baselines.
