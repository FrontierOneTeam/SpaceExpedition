import {revealedSize} from '../sim/terrain.ts';
import type {Run} from '../sim/types.ts';
import {BUILDINGS} from '../sim/config.ts';
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const integer=(v:unknown)=>number(v)&&Number.isSafeInteger(v);
const tally=(v:unknown)=>object(v)&&integer(v.right)&&integer(v.answered)&&v.right<=v.answered;
const types=new Set([...Object.keys(BUILDINGS),'shelter']);
const events=new Set(['power','unpowered','produced','consumed','missing_input','crew_used','health','repaired','panel_restored','storm','broken','damaged','rocket_landed','rocket_blocked','goal_done','stage_up','stock_full','unlocked','map_grew','prediction_scored','lost','chapter_end']);
function validEvent(e:any):boolean {
 if(!object(e)||!events.has(e.type))return false;
 if(e.building!==undefined&&!Object.hasOwn(BUILDINGS,e.building)&&!(e.type==='unlocked'&&e.building==='shelter'))return false;
 if(e.buildingId!==undefined&&e.buildingId!==null&&!integer(e.buildingId))return false;
 if(e.type==='goal_done'&&(!object(e.goal)||!number(e.goal.rewardParts)))return false;
 return Object.values(e).every(v=>typeof v!=='number'||Number.isFinite(v));
}
/** Validate fields used by rules and UI before a portable or local save enters either. */
export function validRun(v:unknown):v is Run {
 if(!object(v)||!integer(v.siteNumber)||typeof v.chapterId!=='string'||!integer(v.replay)||v.replay<1||!integer(v.chapterDay)||v.chapterDay<1||typeof v.pendingReport!=='boolean'||!object(v.state))return false;
 const s=v.state;
 if(!['day','air','food','water','parts','soil','health','crew','charge','ring','nextId'].every(k=>number(s[k]))||s.day<1||!integer(s.ring)||!integer(s.nextId)||s.crew<2||!integer(s.crew)||!object(s.goals)||!integer(s.goals.starterDone)||s.goals.starterDone>4||!integer(s.goals.repeatingDone)||!tally(s.predictions))return false;
 if(!Array.isArray(s.terrain)||s.terrain.length<12||s.terrain.length>2048||s.terrain.some((row:any)=>!Array.isArray(row)||row.length!==s.terrain.length||row.some((t:any)=>!['ground','ice','rock','crater'].includes(t))))return false;
 if(revealedSize(s.ring)>s.terrain.length||s.health>10)return false;
 const coord=(b:any)=>object(b)&&integer(b.id)&&integer(b.r)&&integer(b.c)&&b.r<s.terrain.length&&b.c<s.terrain.length;
 if(!Array.isArray(s.buildings)||s.buildings.some((b:any)=>!coord(b)||!Object.hasOwn(BUILDINGS,b.type)||!integer(b.brokenDays)||!integer(b.damagedDays)||(b.manualRepair!==undefined&&typeof b.manualRepair!=='boolean')))return false;
 if(!Array.isArray(s.shelters)||s.shelters.some((b:any)=>!coord(b)||(b.size!==undefined&&b.size!==1&&b.size!==2)||b.r+(b.size??2)>s.terrain.length||b.c+(b.size??2)>s.terrain.length))return false;
 const all=[...s.buildings,...s.shelters];if(new Set(all.map(b=>b.id)).size!==all.length||all.some(b=>b.id>=s.nextId))return false;
 if(new Set(s.buildings.map((b:any)=>`${b.r},${b.c}`)).size!==s.buildings.length)return false;
 if(!Array.isArray(s.unlocked)||s.unlocked.some((t:any)=>!types.has(t)||t==='pad'))return false;
 if(!object(s.chapterStart)||!['sol','crew','buildings','shelters','goalsCompleted','revealedSize'].every(k=>number(s.chapterStart[k]))||!tally(s.chapterStart.predictions))return false;
 if(!Array.isArray(s.log)||s.log.some((l:any)=>!object(l)||!integer(l.sol)||!integer(l.chapterDay)||typeof l.date!=='string'||!Array.isArray(l.events)||!object(l.after)||!['air','food','water','parts','soil','health','crew','charge'].every(k=>number(l.after[k]))||l.events.some((e:any)=>!validEvent(e))))return false;
 for(const key of ['question','prediction'])if(s[key]!==null&&(!object(s[key])||!integer(s[key].buildingId)||!Object.hasOwn(BUILDINGS,s[key].building)||!integer(s[key].sol)))return false;
 if(s.prediction&&!['fine','break'].includes(s.prediction.answer))return false;
 if(s.lost!==null&&(!object(s.lost)||!['air','food','health'].includes(s.lost.cause)||!integer(s.lost.sol)))return false;
 if(s.research!==undefined&&(!Array.isArray(s.research)||s.research.some((id:any)=>!['fore','rec','soil','pan','split','nuke'].includes(id))))return false;
 if(s.notebook!==undefined&&(!Array.isArray(s.notebook)||s.notebook.some((id:any)=>typeof id!=='string')))return false;
 if(s.aid!==undefined&&(!object(s.aid)||!integer(s.aid.used)||!integer(s.aid.lastSol)))return false;
 const kinds=['storm_cover','fix_incident','cover_homes','house_crew','more_air','more_food','new_mine','new_digger','more_power','more_storage','shelter_machines','research'];
 const g=s.goals;
 if(g.current!==undefined&&g.current!==null&&(!object(g.current)||!kinds.includes(g.current.kind)||!integer(g.current.target)||(g.current.until!==undefined&&!integer(g.current.until))))return false;
 if(g.lastKind!==undefined&&!kinds.includes(g.lastKind))return false;
 if(s.stage!==undefined&&!integer(s.stage))return false;
 for(const key of ['criticalDays','researchPoints','terrainSeed'])if(s[key]!==undefined&&!number(s[key]))return false;
 return true;
}
