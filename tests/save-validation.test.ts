import {it,expect} from 'vitest';
import {newRun} from '../src/sim/day.ts';
import {book} from './helpers.ts';
import {emptySave,loadSave} from '../src/save/save.ts';
import {importSave,exportSave} from '../src/save/files.ts';
it('rejects corrupt goal and shield state before replacing a save',()=>{
 for(const mutate of [(r:any)=>r.state.goals.starterDone=-1,(r:any)=>r.state.shelters=[{id:99,r:5,c:5,size:1000}],(r:any)=>r.state.predictions=null,(r:any)=>r.state.buildings[1].id=r.state.buildings[0].id]){
 const f=emptySave();f.outpost=newRun(1,book);mutate(f.outpost);expect(()=>importSave(exportSave(f))).toThrow();
 }
});

it('migrates developed old saves and rejects null shield entries without throwing',()=>{
 const r=newRun(1,book);r.state.goals.starterDone=4;r.state.unlocked=['sun','o2','home'];
 const read=()=>loadSave({getItem:()=>exportSave({...emptySave(),outpost:r}),setItem:()=>{},removeItem:()=>{}});
 expect(read().outpost!.state.unlocked).toContain('lab');
 (r.state.shelters as any)=[null];expect(()=>read()).not.toThrow();expect(read().outpost).toBeNull();
});
