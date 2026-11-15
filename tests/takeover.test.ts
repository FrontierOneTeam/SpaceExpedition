import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {newRun,place,removeBuilding,removeShelter,isSheltered,keepBuilding,nextArchiveChapterId,type Chapter,type ChapterBook} from '../src/sim/index.ts';
import {book,sep2017} from './helpers.ts';
import {exportSave,importSave} from '../src/save/files.ts';
import {emptySave} from '../src/save/save.ts';
describe('takeover building and save contracts',()=>{
 it('refunds half parts once and shields just one tile which can be uncovered',()=>{
 const r=newRun(1,book),s=r.state;s.unlocked.push('shelter');s.soil=10;
 expect(place(s,'shelter',5,5).ok).toBe(true);expect(s.soil).toBe(9);
 expect(isSheltered(s,4,5)).toBe(false);expect(removeShelter(s,s.shelters[0].id).ok).toBe(true);
 const p=s.parts;expect(removeBuilding(s,s.buildings.find(b=>b.type==='batt')!.id).ok).toBe(true);expect(s.parts).toBe(p+1);
 });
 it('exports/imports a run and refuses malformed data',()=>{
 const f=emptySave();f.outpost=newRun(1,book);expect(importSave(exportSave(f)).outpost).toEqual(f.outpost);
 expect(()=>importSave('{"version":1,"outpost":{"state":{}}}')).toThrow();
 });
 it('cycles non-sequentially across multi-chapter archives before incrementing replay',()=>{
 const ids=['sep2017','c1','c2','c3','c4','c5','c6'];
 const multiBook:ChapterBook={archive:ids,chapters:Object.fromEntries(ids.map((id)=>[id,{...sep2017,id}]))};
 const r=newRun(4821,multiBook);
 const visited:string[]=[];
 for(let step=0;step<6;step++){
  r.pendingReport=true;
  const next=nextArchiveChapterId(r,multiBook);
  expect(keepBuilding(r,multiBook)).toBe(true);
  expect(r.chapterId).toBe(next.chapterId);
  visited.push(r.chapterId);
  expect(r.replay).toBe(1);
 }
 expect(new Set(visited).size).toBe(6);
 expect(visited).not.toEqual(['c1','c2','c3','c4','c5','c6']);
 r.pendingReport=true;
 keepBuilding(r,multiBook);
 expect(r.chapterId).toBe('sep2017');
 expect(r.replay).toBe(2);
 });
 it('shipped archive chapters keep the flare list and flag in step (SPEC 18.1; the full rule is in archive.test.ts)',()=>{
 const archive=JSON.parse(readFileSync('src/data/archive.json','utf8')) as string[];
 expect(archive[0]).toBe('sep2017');
 for(const id of archive.filter((x)=>x.startsWith('archive-'))){
  const c=JSON.parse(readFileSync(`src/data/chapters/${id}.json`,'utf8')) as Chapter;
  for(const d of c.days){
   expect(d.flare==='none').toBe(d.flares.length===0);
  }
 }
 });
});
