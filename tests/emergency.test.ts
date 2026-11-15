import {it,expect} from 'vitest';
import {run,book} from './helpers.ts';
import {endDay} from '../src/sim/day.ts';
import {requestAid,repairBuilding} from '../src/sim/emergency.ts';
it('gives a short rescue window, limited aid, and faults require paid repairs',()=>{
 const r=run();r.state.air=0;r.state.food=0;endDay(r,book);expect(r.state.lost).toBeNull();
 expect(requestAid(r.state).ok).toBe(true);expect(r.state.air).toBeGreaterThan(0);expect(requestAid(r.state).ok).toBe(false);
 const b=r.state.buildings[1];b.manualRepair=true;b.brokenDays=1;endDay(r,book);expect(b.manualRepair).toBe(true);
 r.state.parts=5;expect(repairBuilding(r.state,b.id)).toBe(true);expect(b.manualRepair).toBe(false);expect(r.state.parts).toBe(3);
});
