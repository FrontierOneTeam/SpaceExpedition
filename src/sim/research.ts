import {RESEARCH_COSTS} from './config.ts';
import type {GameState} from './types.ts';
export function buyResearch(state:GameState,id:string):boolean {
 const cost=RESEARCH_COSTS[id];
 if(state.lost||!cost||(state.research??[]).includes(id)||(state.researchPoints??0)<cost)return false;
 state.researchPoints=(state.researchPoints??0)-cost;
 (state.research??=[]).push(id);
 if(id==='nuke'&&!state.unlocked.includes('nuke'))state.unlocked.push('nuke');
 return true;
}
export function hasResearch(state:GameState,id:string):boolean{return state.research?.includes(id)??false;}
