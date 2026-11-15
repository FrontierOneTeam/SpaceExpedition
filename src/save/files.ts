import {looksLikeReport} from '../ui/report.ts';
import { type SaveFile, loadSave, SAVE_VERSION } from './save.ts';
/** Portable, versioned file. It contains no code or external asset paths. */
export function exportSave(save: SaveFile): string { return JSON.stringify({...save,version:SAVE_VERSION},null,2); }
export function importSave(text:string): SaveFile {
 if(text.length>20_000_000) throw new Error('Save too large');
 const data:unknown=JSON.parse(text);
 if(!data || typeof data!=='object' || (data as SaveFile).version!==SAVE_VERSION) throw new Error('Unsupported save');
 const save=loadSave({getItem:()=>text,setItem:()=>{},removeItem:()=>{}});
 if((data as SaveFile).outpost && !save.outpost) throw new Error('Invalid outpost');
 if(!Array.isArray((data as SaveFile).reports)||!Array.isArray((data as SaveFile).notebook))throw new Error('Invalid archive');
 if(save.reports.some(r=>!looksLikeReport(r)))throw new Error('Invalid report');
 return save;
}
