# Card check: the five September 2017 cards

Checked 15 November 2026 by a research helper. Research notes only, nothing in the game was changed.

How pages were read:

- `curl -sL` worked for nasa.gov, science.nasa.gov, swri.org, stce.be and the DONKI API. Quotes from those pages were copied from the raw page text.
- `www.jpl.nasa.gov` returned HTTP 403 to curl. That page was read with the WebFetch tool, which passes the page through a summarising model. Its quotes match the SwRI text word for word, but a person should open the JPL page once and confirm them.

Verdicts: SUPPORTED / PARTLY / NOT SUPPORTED / NOT VERIFIED.

## Sources used

| Short name | URL | Date on page |
|---|---|---|
| DONKI fixture | `src/data/raw/donki-flr-2017-09-04_2017-09-11.json` (from `https://ccmc.gsfc.nasa.gov/DONKI-API/get/FLR?startDate=2017-09-04&endDate=2017-09-11`) | fetched 2026-11-14 |
| STCE review | https://www.stce.be/esww15/program/Sept_2017_activity_summary.pdf | no date printed; title "Review of 4th to 15th September Space Weather Activity", "Content Provided by UK Met Office and ESA SSA Programme Office" |
| SwRI release | https://www.swri.org/node/11852 (redirects to https://www.swri.org/newsroom/press-releases/large-solar-storm-sparks-global-aurora-doubles-radiation-levels-mars) | no date shown on the page; the text says "this month" |
| **JPL release** | **https://www.jpl.nasa.gov/news/large-solar-storm-sparks-global-aurora-and-doubles-radiation-levels-on-the-martian-surface/** | **Sept. 29, 2017, release number 2017-254** |
| NASA Goddard article | https://www.nasa.gov/missions/goes/september-2017s-intense-solar-activity-viewed-from-space/ | Oct 27, 2017 |
| NASA image PIA21856 | https://science.nasa.gov/resource/solar-storms-radiation-at-martian-orbit-and-surface/ (also https://photojournal.jpl.nasa.gov/catalog/PIA21856) | September 29, 2017 |

### The missing NASA link for `curiosity-rad` (SPEC 9.5)

- Title: "Large Solar Storm Sparks Global Aurora and Doubles Radiation Levels on the Martian Surface"
- URL: https://www.jpl.nasa.gov/news/large-solar-storm-sparks-global-aurora-and-doubles-radiation-levels-on-the-martian-surface/
- Date: Sept. 29, 2017. Release 2017-254.
- Read with WebFetch only (curl got HTTP 403). Its text matches the SwRI release in every sentence checked: "The solar event on Sept. 11, 2017 sparked a global aurora at Mars more than 25 times brighter than any previously seen by the MAVEN orbiter" and "The high readings lasted more than two days."
- A companion NASA image page from the same day, PIA21856 (URL above), is a second NASA source for the particles reaching Mars.

---

## Card `sep2017-06` (6 Sep)

> On this day in 2017 the Sun fired two giant flares. One was class X9.3, the biggest of that whole solar cycle.

| # | Claim | Verdict | Source | Quote / record | Note |
|---|---|---|---|---|---|
| 1 | Two flares on 6 Sep 2017 | SUPPORTED | DONKI fixture | `"flrID":"2017-09-06T08:57:00-FLR-001" ... "peakTime":"2017-09-06T09:10Z" ... "classType":"X2.2","activeRegionNum":12673` and `"flrID":"2017-09-06T11:53:00-FLR-001" ... "peakTime":"2017-09-06T12:02Z" ... "classType":"X9.3","activeRegionNum":12673` | DONKI lists only these two flares with a 6 Sep peak time, and both are X-class. "Giant" is the card's own word. Both are X-class, so it is fair. |
| 2 | One was class X9.3 | SUPPORTED | DONKI fixture | `"peakTime":"2017-09-06T12:02Z" ... "classType":"X9.3"` | |
| 3 | The biggest of that whole solar cycle | PARTLY | STCE review | "X9.3: 11:53 UT 6th September 2017 / X8.2: 15:35 UT 10th September 2017 / These constitute the 2 largest flares of the current solar cycle." | Both sources were written in 2017, while the cycle was still going. They say "current solar cycle", not "whole". I found no official source written after the cycle ended that confirms the full-cycle claim. Safer wording: "the biggest flare of that solar cycle so far". The STCE review is from the UK Met Office and ESA, not NASA. |
| 3b | (same claim, NASA source) | PARTLY | NASA Goddard article, Oct 27, 2017 | "GOES-16 caught this footage of an X9.3 flare on Sept. 6, 2017. This was the most intense flare recorded during the current 11-year solar cycle." | This is a NASA source for the same claim, with the same "current" limit. Consider adding it to the register as well as `stce-review`, or instead of it. |

## Card `sep2017-07` (7 Sep)

> The same sunspot flared again: class X1.3. Scientists call that sunspot region 12673.

| # | Claim | Verdict | Source | Quote / record | Note |
|---|---|---|---|---|---|
| 1 | Class X1.3 flare on 7 Sep | SUPPORTED | DONKI fixture | `"flrID":"2017-09-07T14:20:00-FLR-001","beginTime":"2017-09-07T14:20Z","peakTime":"2017-09-07T14:36Z" ... "classType":"X1.3","sourceLocation":"S09W53","activeRegionNum":12673` | 7 Sep also has an M7.3 at 10:15Z. The card does not mention it, which is fine. |
| 2 | Same sunspot as the 6 Sep flares | SUPPORTED | DONKI fixture | All three records above have `"activeRegionNum":12673` | DONKI's term is "active region" (NOAA number). STCE calls it a sunspot region: "Active region (AR) 12673 was a dormant alpha Hsx spot which developed into ... a complex sunspot region between September 3rd and 5th". |
| 3 | The region is called 12673 | SUPPORTED | DONKI fixture, STCE review | `"activeRegionNum":12673`; "Active region (AR) 12673" | |

## Card `sep2017-10` (10 Sep)

> A class X8.2 flare burst from the Sun at 16:06 UTC. Fast particles from it were now racing toward Mars.

| # | Claim | Verdict | Source | Quote / record | Note |
|---|---|---|---|---|---|
| 1 | Class X8.2 on 10 Sep at 16:06 UTC | SUPPORTED, wording caution | DONKI fixture | `"flrID":"2017-09-10T15:35:00-FLR-001","beginTime":"2017-09-10T15:35Z","peakTime":"2017-09-10T16:06Z","endTime":"2017-09-10T16:31Z","classType":"X8.2","sourceLocation":"S08W88","activeRegionNum":12673` | 16:06Z is the **peak** time. The flare began at 15:35Z. "Burst ... at 16:06" can be read as the start. Suggest "reached its peak at 16:06 UTC". |
| 2 | Fast particles **from it** were racing toward Mars | NOT SUPPORTED as written (PARTLY for "particles reached Mars") | see below | see below | No official source I fetched says that particles from **this flare** went to Mars. |

Evidence found for claim 2:

- PIA21856 (NASA, September 29, 2017): "Energetic particles from a large solar storm in September 2017 were seen both in Mars orbit and on the surface of Mars by NASA missions to the Red Planet." and "The horizontal axis for both parts of this graphic is the time from Sept. 10 to Sept. 15, 2017." This supports particles reaching Mars, but it names "a large solar storm", not the X8.2 flare.
- SwRI / JPL release: "The solar event on Sept. 11, 2017, sparked a global aurora at Mars". The release describes the cause as a coronal mass ejection: "Some coronal mass ejections, such as this month's event, are broad enough in extent to affect planets in quite different directions from the Sun." JPL release (WebFetch): the word "flare" does not appear.
- NASA Goddard article (Oct 27, 2017): "Effects from September's solar activity were observed as Martian aurora". This is general and does not name the flare.
- DONKI SEP records for 10 to 12 Sep 2017 (fetched to scratch, not committed: `https://ccmc.gsfc.nasa.gov/DONKI-API/get/SEP?startDate=2017-09-10&endDate=2017-09-12`). Three particle events are linked to the X8.2 flare (`2017-09-10T15:35:00-FLR-001`), but all three were measured near Earth (`GOES13: SEM/EPS >100 MeV`, `GOES13: SEM/EPS >10 MeV`, `SOHO: COSTEP 15.8-39.8 MeV`), not at Mars.
- DONKI CME `2017-09-10T16:09:00-CME-001` holds WSA-ENLIL **model** runs that predicted a glancing blow at Mars (`{"location":"Mars","arrivalTime":"2017-09-14T10:00Z","isGlancingBlow":true}`). This is a model forecast of the CME, not a particle measurement.
- A search turned up a 2018 peer-reviewed overview, "Observations and Impacts of the 10 September 2017 Solar Events at Mars" (Geophysical Research Letters). I did not fetch its text from an official site, so it is NOT VERIFIED here.

Suggested rewording that the sources support: "Soon after, fast particles from the Sun were racing toward Mars." The team could also drop "from it". Alternatively, someone can read the GRL overview and add it as a source.

## Card `sep2017-11` (11 Sep)

> The particles hit Mars. NASA's Curiosity rover measured radiation on the ground more than double anything it had recorded before.

| # | Claim | Verdict | Source | Quote | Note |
|---|---|---|---|---|---|
| 1 | The particles hit Mars (on 11 Sep) | PARTLY | SwRI release; PIA21856 | SwRI: "An unexpectedly strong blast from the Sun hit Mars this month" and "The solar event on Sept. 11, 2017, sparked a global aurora at Mars". PIA21856: "Energetic particles from a large solar storm in September 2017 were seen both in Mars orbit and on the surface of Mars". | Particles at Mars: supported. The sources date the event "Sept. 11". "The particles" refers back to card 10's link to the flare, which is not supported (see above). |
| 2 | Curiosity measured radiation on the ground more than double anything it had recorded before | SUPPORTED | SwRI release; JPL release | SwRI: "It also produced radiation levels on the surface more than double any previously measured by the Curiosity rover's Radiation Assessment Detector, or RAD, since that mission's landing in 2012." JPL (WebFetch): "It produced radiation levels on the surface more than double any previously measured by the Curiosity rover's" | Strictly, "before" means since landing in 2012. Fine for the card. |

## Card `sep2017-12` (12 Sep)

> The high radiation lasted more than two days. From orbit, NASA's MAVEN spacecraft saw Mars glow with an aurora 25 times brighter than any it had seen.

| # | Claim | Verdict | Source | Quote | Note |
|---|---|---|---|---|---|
| 1 | High radiation lasted more than two days | SUPPORTED | SwRI release; JPL release | "The high readings lasted more than two days." (same sentence in both) | |
| 2 | MAVEN saw it from orbit | SUPPORTED | SwRI release | "...more than 25 times brighter than any previously seen by the MAVEN orbiter" | |
| 3 | Aurora 25 times brighter than any it had seen | SUPPORTED, small wording change advised | SwRI release; JPL release; NASA Goddard article | SwRI: "The solar event on Sept. 11, 2017, sparked a global aurora at Mars more than 25 times brighter than any previously seen by the MAVEN orbiter". | The source says **"more than 25 times"**. The card drops "more than". That understates the source rather than overstating it, but "more than 25 times" is exact. "Glow" fits: "The recent one lit up Mars like a light bulb." |

The card is shown on 12 Sep, but the sources date the aurora to the "Sept. 11, 2017" event. That is fine for a card about the ongoing storm, as long as nothing says the aurora happened on 12 Sep.

## Summary

| Card | Result |
|---|---|
| 06 | Flares and class SUPPORTED. "Whole solar cycle" PARTLY: the sources say "current solar cycle" (written in 2017). |
| 07 | SUPPORTED. |
| 10 | Class and time SUPPORTED (16:06Z is the peak time, not the start). "Particles **from it** racing toward Mars" NOT SUPPORTED by any official source I fetched. |
| 11 | Doubled surface radiation SUPPORTED. "Particles hit Mars" PARTLY (supported for 11 Sep, but not as coming from the X8.2 flare). |
| 12 | Two-day duration and MAVEN aurora SUPPORTED. Use "more than 25 times". |

No fetched page contained instructions aimed at an AI tool.
