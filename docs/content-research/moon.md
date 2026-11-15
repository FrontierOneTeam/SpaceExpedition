# Moon site: can it have its own real records? (feasibility only)

Checked 15 November 2026 by a research helper. This note does not design a chapter.

The question: does an official NASA source report radiation or solar-storm measurements **at the Moon** (on the surface or in lunar orbit) for a specific, dated solar event? SPEC 9.1 says readings from one place are never shown as readings from another.

## What I found

### Candidate 1: the solar particle events of 23 January, 7 March and 17 May 2012, measured by LRO's CRaTER in lunar orbit. VERIFIED that they were measured. NO dose numbers in the text.

- Source: Shaowen Hu, "Solar Particle Events and Radiation Exposure in Space", NASA JSC Space Radiation (THREE) article, "Date Posted: 3/31/2017". URL: https://three.jsc.nasa.gov/articles/hu-spes.pdf (fetched with curl, text taken with pdftotext).
- Quote: "The three SPEs 2012-Jan-23, 2012-Mar-7, and 2012-May-17 happened to be recorded by the Radiation Assessment Detector (RAD) inside the Mars Science Laboratory (MSL) spacecraft during its cruise to Mars [Zeitlin et al., 2013]. They were also recorded by the Cosmic Ray Telescope for the Effects of Radiation (CRaTER), an instrument on the Lunar Reconnaissance Orbiter (LRO) spacecraft designed to characterize the lunar radiation environment."
- Second quote: "Figure 11a shows the dose rates measured by CRaTER and RAD during the 2012 January SPE".
- What is missing: the measured values are only in figures (Figures 10 and 11), not in the text. The article cites Joyce et al., 2013 for the CRaTER values, which I did not fetch. The article is a review by a NASA contractor (KBRwyle) hosted on a NASA site, not a NASA news release.

### Candidate 2: 10 September 2017 at the Moon. NOT VERIFIED.

- Search results pointed to non-NASA pages: an AMS 2019 conference abstract titled "Radiation Hazards from Extreme Solar Energetic Particle Events Observed near the Moon" (ams.confex.com), and a NOAA SWPC slide deck by the CRaTER team. A search summary also mentioned Schwadron et al. (2018, *Space Weather*) on this event.
- I did not fetch any of these from an official NASA page, so nothing about this event at the Moon is verified here. It is the most useful lead, because it would let a Moon site replay the **same week** as chapter one using its own Moon readings.

### Candidate 3: May 2024 at the Moon. NOTHING FOUND.

- The NASA articles on May 2024 talk about Earth and Mars. In NASA's one-year article (https://science.nasa.gov/science-research/heliophysics/what-nasa-is-learning-from-the-biggest-geomagnetic-storm-in-20-years/), the only Moon-related name I saw was the THEMIS-ARTEMIS mission, and the passage describes Earth's magnetosphere, not readings at the Moon.

### Background (not event-specific)

- NASA LRO page (https://science.nasa.gov/mission/lro/science-and-data/): "LRO's Cosmic Ray Telescope for the Effects of Radiation (CRaTER ) instrument characterizes the global lunar radiation environment and its biological impacts by measuring galactic and solar cosmic ray radiation behind a "human tissue-equivalent" plastic."
- NASA NTRS abstract 20240004047 (https://ntrs.nasa.gov/citations/20240004047): "The Lunar Reconnaissance Orbiter's (LRO) Cosmic Ray Telescope for Effects of Radiation (CRaTER) instrument has been observing space radiation around the Moon since 2009. The CRaTER observations show a steady GCR flux with intermittent SEP events that have much higher fluxes."
- NASA heliophysics page (https://science.nasa.gov/science-research/heliophysics/how-nasa-will-protect-astronauts-from-space-radiation-at-the-moon/, Aug 07, 2019) discusses the August 1972 flares. That was a **near miss with no measurement at the Moon**: "Had they been in orbit or on the Moon's surface, they could have experienced high levels of radiation". This cannot be used as a Moon reading.
- NASA NTRS 20210021039 (lunar crater dose study) uses "the October 1989 SEP event" as a **model input spectrum**, not a Moon measurement.

## Verdict

**A well-sourced Moon chapter does not look possible yet from the sources I could verify.**

- CRaTER clearly measured solar events at the Moon, and the 2012 events are named and dated by a NASA-hosted source (candidate 1).
- But I found no official NASA page that gives, in text, **how big** the radiation was at the Moon on a specific date. Without that, any radiation level for a Moon chapter would be invented.

What would be needed:

1. One official source (a NASA release, a CRaTER team page, or a peer-reviewed paper the team accepts) that states the Moon dose or dose rate for a dated event, with its duration. The best leads are Joyce et al. 2013 for January 2012, and the CRaTER team's papers on 10 September 2017.
2. Or the CRaTER data itself. The NASA LRO page says LRO data go to the NASA Planetary Data System ("The final set of data from the exploration phase of the LRO mission was released to the NASA Planetary Data System", written about LOLA maps). I did **not** find or fetch CRaTER's own archive: NOT VERIFIED. A `tools/` script would have to fetch and commit it like the DONKI files.
3. A team decision on whether lunar **orbit** readings (CRaTER) may stand for the Moon **surface** site. SPEC 9.1 suggests they must at least be labelled as orbit readings.

No fetched page contained instructions aimed at an AI tool.
