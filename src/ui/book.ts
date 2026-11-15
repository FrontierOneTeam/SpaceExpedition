import may2024 from '../data/chapters/may2024.json';
// The chapters the game ships with, and the interface's choice of a new site number.

import archive from '../data/archive.json';
import sep2017 from '../data/chapters/sep2017.json';
import { config, type Chapter, type ChapterBook } from '../sim/index.ts';

const CHAPTERS:Record<string,Chapter>={sep2017:sep2017 as unknown as Chapter,may2024:may2024 as unknown as Chapter};
const archiveModules=import.meta.glob('../data/chapters/archive-*.json',{eager:true,import:'default'}) as Record<string,Chapter>;
for(const chapter of Object.values(archiveModules)) CHAPTERS[chapter.id]=chapter;

export function loadBook(): ChapterBook {
  const ids = (archive as string[]).filter((id) => id in CHAPTERS);
  return { archive: ids, chapters: CHAPTERS };
}

/** A new site number. The interface picks it; the sim never uses Math.random. */
export function randomSite(): number {
  const { siteMin, siteMax } = config.UI;
  return siteMin + Math.floor(Math.random() * (siteMax - siteMin + 1));
}
