import {BUILDINGS} from './config.ts';
import {canPlaceBuilding,buildingAt,isSheltered} from './placement.ts';
import {isRevealed} from './terrain.ts';
import type {GameState} from './types.ts';
/** Atomic relocation: no payment/refund, no new id, no repair or crew change. */
export function moveBuilding(s:GameState,id:number,r:number,c:number):{ok:boolean} {
 const b=s.buildings.find(b=>b.id===id);if(!b||b.type==='pad'||s.lost)return {ok:false};
 if(b.r===r&&b.c===c)return {ok:true};
 const spec=BUILDINGS[b.type];
 if(!isRevealed(s.ring,r,c)||!s.terrain[r]?.[c]||buildingAt(s,r,c)||(!spec.canBeSheltered&&isSheltered(s,r,c))||spec.needsTerrain&&s.terrain[r][c]!==spec.needsTerrain)return {ok:false};
 if(!s.buildings.some(x=>x.id!==id&&Math.abs(x.r-r)+Math.abs(x.c-c)===1))return {ok:false};
 b.r=r;b.c=c;return {ok:true};
}
