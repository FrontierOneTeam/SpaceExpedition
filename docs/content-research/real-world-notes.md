# Real-world notes (research draft, fetched 15 November 2026)

Every quote below was read in text fetched this session from the exact URL shown. Nothing here comes from memory.
Tools used: `curl` (Bash) for nasa.gov / science.nasa.gov / asc-csa.gc.ca / osdr.nasa.gov pages; WebFetch for jpl.nasa.gov pages (curl is blocked there with 403) and for visualization.osdr.nasa.gov docs. Quotes marked (WebFetch) were returned by the WebFetch extractor, not read from a raw file; re-check them in a browser before release.
Suggested `kind` values follow SPEC 9.5 (`reading`, `data`, `image`, `sound`).

---

## 1. moxie  (game item: oxygen maker `o2`)
- name: NASA: Perseverance makes oxygen on Mars (MOXIE)
- url: https://www.nasa.gov/news-release/nasas-perseverance-mars-rover-extracts-first-oxygen-from-red-planet/
- title: "NASA's Perseverance Mars Rover Extracts First Oxygen from Red Planet"; published Apr 21, 2021; page last updated Jul 26, 2023
- kind: reading
- text: A tool on the Perseverance rover made oxygen on Mars. It took the oxygen out of carbon dioxide, which is most of the Mars air.
  - S1 quote: "The growing list of “firsts” for Perseverance ... includes converting some of the Red Planet’s thin, carbon dioxide-rich atmosphere into oxygen."
  - S2 quotes: "MOXIE works by separating oxygen atoms from carbon dioxide molecules" and "taking carbon dioxide – the bulk of the atmosphere – and converting it into oxygen"
- caution: The page describes a small first test (about 5 grams of oxygen in the first run, "equivalent to about 10 minutes worth of breathable oxygen for an astronaut"). It is a demonstration, not a working oxygen supply. Game oxygen output is a simple model.

## 2. iss-oxygen  (oxygen maker `o2`)
- name: NASA: How the space station makes oxygen
- url: https://www.nasa.gov/reference/environmental-control-and-life-support-systems-eclss/
- title: "Environmental Control and Life Support Systems (ECLSS)" (NASA Marshall encyclopedia entry); updated Apr 4, 2025
- kind: reading
- text: The space station makes oxygen for the crew to breathe. It splits water into oxygen and hydrogen.
  - S1 quote: "The Oxygen Generation System produces oxygen for the crew to breathe."
  - S2 quote: "The oxygen generation assembly is composed of the cell stack, which electrolyzes, or breaks apart, water provided by the Water Recovery System, yielding oxygen and hydrogen as byproducts."
- caution: Space station value, not a Mars value (SPEC 9.1). No numbers used.

## 3. iss-water  (greenhouse water / ice mine / research `rec`)
- name: NASA: How the space station reuses water
- url: https://www.nasa.gov/reference/environmental-control-and-life-support-systems-eclss/
- title and date: as topic 2 (same page, "The Water Recovery System" section)
- kind: reading
- text: The space station cleans and reuses its water. Some of that water comes from the crew's urine.
  - S1 quote: "The Water Recovery System provides clean water by reclaiming wastewater (including water from crew members’ urine), cabin humidity condensate, and water from the hydration system inside crew members’ Extra Vehicular Activity suits."
  - S2 quote: same sentence ("... including water from crew members’ urine ...").
- caution: The same page says "Currently, the Water Recovery System can recover and recycle about 90 percent of the water on station." A different NASA page I fetched (https://www.nasa.gov/humans-in-space/space-station-teaches-nasa-valuable-lessons-about-life-support-systems/ , published Oct 30, 2015, updated Jun 22, 2026) says the system "still recovered 75 percent of the wastewater from urine." The figures measure different things and differ by date, so the draft text uses no percentage. A search snippet mentioned 98 percent from a NASA PDF; I did NOT fetch it (the PDF returned no readable text), so it is unverified and not used. Space station, not Mars.

## 4. osdr-plants  (greenhouse `farm`)
- name: NASA OSDR OSD-745: Lettuce grown on the space station
- identifier: OSD-745
- url (study page): https://osdr.nasa.gov/bio/repo/data/studies/OSD-745
- metadata read from: https://osdr.nasa.gov/osdr/data/osd/meta/745 (the study page itself is a JavaScript app; the text below is what the OSDR API returns for the same study)
- title: "Microbiological and Nutritional Analysis of Lettuce Crops Grown on the International Space Station (Anthocyanin Content, Phenolic Content, Elemental Analysis, ORAC)"; public release date 22-Dec-2025
- kind: data
- text: Scientists grew red lettuce on the space station. They found that leafy plants like this can give astronauts safe, fresh food.
  - S1 quote: "red romaine lettuce ... plants were grown in Veggie plant growth chambers on the International Space Station (ISS) and compared with ground-grown plants."
  - S2 quote: "This study indicated that leafy vegetable crops can produce safe, edible, fresh food to supplement to the astronauts’ diet"
- caution: The raw description has broken characters (an encoding glitch) inside the plant variety name, so the quote is shortened with "...". The wider study found some differences between flight and ground plants (for example in some minerals); the draft claims only what the quoted conclusion says. Space station, not Mars. Studies OSD-193, OSD-217, OSD-655, OSD-780 also appeared in search results but were not read.

## 5. csa-food  (greenhouse `farm`)
- name: Canadian Space Agency: Growing healthy food in space and in remote areas
- url: https://www.asc-csa.gc.ca/eng/sciences/food-production/growing-healthy-food-in-space-and-remote-areas.asp
- title: "Growing healthy food in space and in remote areas"; date modified 2026-07-24
- kind: reading
- text: The Canadian Space Agency is learning how to grow healthy food in hard places. Astronauts who go far from Earth will need to grow their own food.
  - S1 quote: "the Canadian Space Agency (CSA) is working with its partners to learn how to grow healthy food in harsh environments, both in space and on Earth."
  - S2 quote: "Instead, space travellers will need to develop "green thumbs" to grow their own food in space."
- caution: The page names no single "toolkit"; it is an overview page. (SPEC 9.5 calls the CSA row a "food-production toolkit". I did not find a page called that.) Credit as Canadian Space Agency; check the page's own "Notices and copyright" link before using any image.

## 6. mars-ice  (ice mine `mine`)
- name: NASA: Mapping buried water ice on Mars (SWIM)
- url: https://www.nasa.gov/solar-system/planets/mars/nasa-is-locating-ice-on-mars-with-this-new-map/
- title: "NASA Is Locating Ice on Mars With This New Map"; Jet Propulsion Laboratory; Oct 26, 2023; page last updated Apr 08, 2024
- kind: reading
- text: NASA maps show where water ice is probably buried under the ground on Mars. Future astronauts could use it for drinking water.
  - S1 quote: "These Mars global maps show the likely distribution of water ice buried within the upper 3 feet (1 meter) of the planet’s surface"
  - S2 quote: "Buried ice will be a vital resource for astronauts on Mars, serving as drinking water and a key ingredient for rocket fuel."
- supporting page (WebFetch, not raw text): https://www.jpl.nasa.gov/news/odyssey-finds-water-ice-in-abundance-under-mars-surface/ , published May 28, 2002: "This is the best direct evidence we have of subsurface water ice on Mars."
- caution: The map shows where ice is likely, from the equator to 60 degrees north; no mine exists. The game's ice tile is made up.

## 7. regolith-shield  (soil shelter `shelter`)
- name: NASA: How NASA will protect astronauts from space radiation at the Moon
- url: https://science.nasa.gov/science-research/heliophysics/how-nasa-will-protect-astronauts-from-space-radiation-at-the-moon/
- title: same; NASA Science Editorial Team; Aug 07, 2019; page last updated Jan 16, 2026
- kind: reading
- text: The more stuff between people and radiation, the safer they are. On the Moon, astronauts could pile soil over their shelters.
  - S1 quote: "The more mass between the crew and radiation, the more likely that dangerous particles will deposit their energy before reaching the crew."
  - S2 quote: "On the Moon, astronauts could pile lunar soil, or regolith, over their shelters, taking advantage of their environment’s natural shielding materials."
- caution: This is about the MOON and an idea ("could"), not a built Mars shelter. Do not say NASA built a soil shelter on Mars. The same paragraph warns that bulk shielding is expensive to launch. The page gives no thickness, so the game's shelter numbers are not real values.

## 8. mmpact  (soil digger `dig`, parts factory `fab`, landing pad `pad`)
- name: NASA: Construction technology for Moon and Mars exploration (MMPACT)
- url: https://www.nasa.gov/directorates/stmd/nasa-enables-construction-technology-for-moon-and-mars-exploration/
- title: "NASA Enables Construction Technology for Moon and Mars Exploration"; Loura Hall; May 13, 2025; page last updated Jun 22, 2026
- kind: reading
- text: A NASA project is exploring robot 3D printers that could build on other worlds. So far it has tested the idea with pretend Moon and Mars soil.
  - S1 quote: "The Moon to Mars Planetary Autonomous Construction Technology (MMPACT) project ... is exploring applications of large-scale, robotic 3D printing technology for construction on other planets."
  - S2 quote: "demonstrations using simulated lunar and Martian surface material, known as regolith, show the concept could become reality."
- other quotes on the same page: "The regolith itself is used as the aggregate, or granular material, for these concretes." ; "The process can be used to autonomously build monolithic structures like radiation shielding and rocket landing pads." ; (about a different technique, selective separation sintering) "...to produce items including interlocking tiles and replacement parts."
- caution: Uses simulated (fake) soil, on Earth. The page says nothing about digging machines. Do not say MMPACT digs soil.

## 9. solar-arrays  (solar panel `sun`)
- name: NASA Space Place: What powers a spacecraft?
- url: https://spaceplace.nasa.gov/what-powers-a-spacecraft/en/
- title: "What Powers a Spacecraft? | NASA Space Place – NASA Science for Kids"; article last updated July 31, 2026
- kind: reading
- text: Solar panels have powered machines on Mars. The Spirit and Opportunity rovers used them.
  - S1 quote: "Solar energy has also been used to power spacecraft on Mars."
  - S2 quote: "NASA's Mars Exploration Rovers, Spirit and Opportunity, and Mars’ Phoenix lander all used power from solar panels and so does the InSight lander."
- caution: "so does the InSight lander" is the page's present tense; do not repeat it as current. Also on the same page (usable for a battery page): "The electricity from the solar panels charges a battery in the spacecraft. These batteries can power the spacecraft even when it moves out of direct sunlight."
- backup (WebFetch only): https://www.jpl.nasa.gov/news/mars-exploration-rover-status-report-rovers-resume-driving/ , Aug. 24, 2007: "More dust on the solar panels lessens the panels' capacity for converting sunlight to electricity"

## 10. insight-power  (limited power / dust and panels)
- name: NASA: InSight's power after a Mars dust storm
- url: https://www.nasa.gov/solar-system/nasas-insight-sees-power-levels-stabilize-after-dust-storm/
- title: "NASA’s InSight Sees Power Levels Stabilize After Dust Storm"; Jet Propulsion Laboratory; Jan 11, 2022 (page shows updates of Jan. 19 and Feb. 15, 2022); page last updated Sep 19, 2023
- kind: reading
- text: Dust built up on the InSight lander's solar panels. That gave the lander less power.
  - S1 and S2 quote: "dust had been accumulating on InSight’s solar panels, reducing the lander’s power supply."
  - Optional extra: "Dust storms can affect solar panels in two ways: Dust reduces sunlight filtering through the atmosphere, and it can also accumulate on the panels."
- caution: Page is a 2022 status report. I did not read later pages on how the mission ended, so do not say how it ended. No numbers used.

## 11. kilopower  (reactor `nuke`, phase 5)
- name: NASA: Kilopower small reactor test
- url: https://www.nasa.gov/news-release/demonstration-proves-nuclear-fission-system-can-provide-space-exploration-power/
- title: "Demonstration Proves Nuclear Fission System Can Provide Space Exploration Power"; release 18-031; May 02, 2018; page last updated Mar 28, 2025
- kind: reading
- text: NASA tested a small nuclear reactor for power in space. Four of them could power an outpost.
  - S1 quote: "NASA and the Department of Energy’s National Nuclear Security Administration (NNSA) have successfully demonstrated a new nuclear reactor power system that could enable long-duration crewed missions to the Moon, Mars and destinations beyond."
  - S2 quote: "Four Kilopower units would provide enough power to establish an outpost."
- caution: The test (KRUSTY) ran on Earth, at the Nevada National Security Site. The release says a flight demonstration is only "possible". I did not fetch any newer status, so do not say it has flown. Game reactor output (+6) is not a real value.

## 12. mars-comms  (Mission Control delay)
- name: NASA: How far is a light-day? (Earth to Mars light time)
- url: https://science.nasa.gov/mission/voyager/voyager-1/voyager-1-what-is-a-light-day/
- title: "Voyager 1: What Is a Light-Day"; page last updated Nov 12, 2026 (no publication date found in the text)
- kind: reading
- text: Radio messages take time to cross space between Earth and Mars. The trip can take from three minutes to 22 minutes.
  - S1 and S2 quote: "The distance between Earth and Mars changes as they orbit the Sun, and it can take anywhere from three minutes to 22 minutes for light to travel between the two planets. Same for a radio transmission, either to or from a spacecraft at Mars."
- caution: One way only, and it depends on where the planets are. The Mars sentence is a side note on a Voyager page. The game's delay is a simplified model, not this value.

## 13. human-health  (crew health)
- name: NASA: Space radiation and astronaut safety
- url: https://science.nasa.gov/science-research/heliophysics/how-nasa-will-protect-astronauts-from-space-radiation-at-the-moon/
- title / date: as topic 7
- kind: reading
- text: Fast particles from the Sun can pass right through the body. They can damage cells and, in extreme cases, make astronauts sick.
  - S1 quote: "SEPs are dangerous because they pass right through skin, shedding energy and fragmenting cells or DNA on their way."
  - S2 quote: "This damage can increase risk for cancer later in life, or in extreme cases, cause acute radiation sickness in the short-term."
- caution: "SEPs" means solar energetic particles. The page says Earth's magnetic field protects people on Earth and the space station is "within Earth’s protection", so this risk is for crews beyond that. The game's health-loss numbers are simplified.

## 14. perseverance-wind  (Mars wind ambience)
- name: NASA: Perseverance SuperCam records wind on Mars
- url (official page): https://science.nasa.gov/resource/perseverance-rovers-supercam-records-wind-on-mars/
- audio file URLs found in that page's HTML (not downloaded):
  - MP3 (1.23 MB per page): https://assets.science.nasa.gov/content/dam/science/psd/mars/downloadable_items/4/5/45828_SCAM_MIC_SOL004_RUN001.mp3
  - WAV (11.44 MB per page): https://assets.science.nasa.gov/content/dam/science/psd/mars/downloadable_items/4/5/45827_SCAM_MIC_SOL004_RUN001.wav
- title: "Perseverance Rover’s SuperCam Records Wind on Mars"; page date March 10, 2021 (download files dated Mar 8, 2024); page last updated Nov 15, 2024
- credit shown on page: NASA/JPL-Caltech/LANL/CNES/CNRS/ISAE-Supaero
- kind: sound (not one of the three kinds in the brief; SPEC 9.5 allows `sound`)
- text: This sound was recorded by the Perseverance rover on Mars. You can hear some wind about 20 seconds in.
  - quote: "This recording was made on Feb. 22, 2021, on the fourth sol (Martian day) by the SuperCam instrument on NASA’s Perseverance rover after deployment of the rover’s mast. ... Some wind can be heard, especially around 20 seconds into the recording."
- caution: The page also says "Rover background sounds have been removed." The audio is processed; the game's "real recording" label (SPEC 9.4, 11.3) should wait for the team's check. The page states no licence; NASA's media guidelines page (https://www.nasa.gov/nasa-brand-center/images-and-media/ , updated Oct 27, 2026) says "NASA should be acknowledged as the source of the material." and that NASA content "generally" is not subject to copyright in the US. The page also mentions a muffled first-sol recording; this clip is sol 4.

## 15. mars-trek  (chapter title card image): PARTIAL, credit line NOT FOUND
- name: NASA Mars Trek
- url: https://trek.nasa.gov/mars/ (tool page); overview at https://trek.nasa.gov/
- Region: the Solar System Treks home page (https://trek.nasa.gov/) has the option "Fly to Gale Crater" (in the page HTML) and a gallery "Great Landscapes of Mars"; it also lists a video "Mars Mid-Latitude Glaciers". Gale Crater is therefore a named Mars place that Trek offers. I did not open Gale Crater inside Mars Trek or capture an image.
- Description (page source of trek.nasa.gov/mars): "Trek is a NASA web-based portal for exploration of Mars. This portal showcases data collected by NASA at various landing sites and features an easy-to-use browsing tool that provides layering and viewing of high resolution data."
- Credit line: NOT FOUND. The Mars Trek app loaded (a "Welcome to Mars Trek" tutorial) but I found no credit, usage or licence text on trek.nasa.gov or in the Trek page source. Each Mars Trek layer comes from a different spacecraft team and may need its own credit; I did not find them.
- General NASA rule (official, not Trek-specific): https://www.nasa.gov/nasa-brand-center/images-and-media/ : "NASA content used in a factual manner that does not imply endorsement may be used without needing explicit permission. NASA should be acknowledged as the source of the material."
- text: none drafted (no image fetched and no credit line verified).
- caution: Do not put a Trek image in the game until a teammate reads the credit for that exact layer inside the tool.

## 16. radlab  (space station dose comparison)
- name: NASA OSDR RadLab portal
- url: https://visualization.osdr.nasa.gov/radlab/gui/overview/ (WebFetch worked; curl returned 500 for the /gui/ pages); data API docs: https://visualization.osdr.nasa.gov/radlab/gui/data-api/
- news page: https://www.nasa.gov/radlab-portal-expands-horizons/ (published Aug 12, 2024; last updated Feb 05, 2025)
- kind: data
- What it is: "a portal that aims to provide a single point of access to radiation telemetry data from multiple databases" (overview, WebFetch). NASA news page: "The RadLab Portal serves as a comprehensive platform providing access to radiation telemetry data from multiple databases maintained by various space agencies." and "Originally focused on radiation data from detectors aboard the International Space Station, RadLab has now expanded its scope to include detectors on spacecraft operating Beyond Low Earth Orbit (BLEO)."
- Can ISS dose data for 10 to 12 September 2017 be reached? YES. Exact query (HTTP 200, 3,294 data rows; saved only in my scratchpad, not in the repo):
  `https://visualization.osdr.nasa.gov/radlab/api/?spacecraft=ISS&timestamp>=2017-09-10&timestamp<2017-09-13&absorbed_dose_rate&instrument&module&format=csv`
  (built from the docs' example form `?spacecraft=ISS&instrument=DosTel&timestamp>=2022-04-01T23:00&timestamp<2022-04-02T01:05&absorbed_dose_rate>2&...&format=html`)
- Retrieved results. Column `absorbed_dose_rate`; unit per the RadLab knowledgebase: "Absorbed radiation dose rate in μGy/hour." First row: "2017-09-10T00:00:00","RAD-COL1A2-pre",12.3279166666666,"RAD","Columbus","ISS". Timestamps run 2017-09-10T00:00:00 to 2017-09-12T23:58:32. Per instrument_id and day (row count; min / max / mean of the rows):
  - DosTel1, 10 Sep: 378 rows; 1.437 / 362.140 / 19.110
  - DosTel2, 10 Sep: 865; 1.371 / 292.892 / 15.454
  - DosTel2, 11 Sep: 1109; 1.531 / 396.368 / 27.216
  - DosTel2, 12 Sep: 939; 1.454 / 412.015 / 27.883
  - RAD-COL1A2-pre (one row per day): 10 Sep 12.328; 11 Sep 18.388; 12 Sep 15.020
  - No DosTel1 rows came back for 11 or 12 September.
- caution: These are space station (Columbus module) values, NOT Mars values (SPEC 9.1). The high maxima are short peaks and I did not check what caused them (orbit position, South Atlantic Anomaly, storm); do not link them to the storm without a source. The means are my own arithmetic on the rows, not a NASA figure, and are not daily doses. Instruments differ in calibration; read the RadLab knowledgebase page for each instrument before showing a number. SPEC 9.1 requires raw responses saved under `src/data/raw/` with sourceUrl, fetchedAt and query if used; I did not write there.
