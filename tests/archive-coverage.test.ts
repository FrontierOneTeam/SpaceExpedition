import {describe,it,expect} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
import {validateChapter} from '../src/sim/weather.ts';
import type {Chapter} from '../src/sim/types.ts';
it('ships more than 1000 distinct historical dates with valid chapters and raw provenance',()=>{
 const archive=JSON.parse(readFileSync('src/data/archive.json','utf8')) as string[];const dates=new Set<string>();
 for(const id of archive){const c=JSON.parse(readFileSync(`src/data/chapters/${id}.json`,'utf8')) as Chapter;expect(validateChapter(c)).toEqual([]);for(const d of c.days)dates.add(d.date);}
 expect(dates.size).toBeGreaterThan(1000);expect(readdirSync('src/data/raw').filter(n=>n.endsWith('.meta.json')).length).toBeGreaterThanOrEqual(36);
});
