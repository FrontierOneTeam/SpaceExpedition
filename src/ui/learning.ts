import notesJson from '../data/real-world.json';
import researchJson from '../data/research.json';
import {RESEARCH_COSTS} from '../sim/config.ts';
import type {GameState} from '../sim/types.ts';
import {REGISTER} from './content.ts';
import {esc} from './format.ts';
import {t} from './strings.ts';
const notes=notesJson as {id:string;for:string;place:string;text:string;url:string;name:string;caution:string}[];
export function notebookTotal(): number {
  return notes.length;
}
export function scienceNote(type:string):string {
 const note=notes.find(n=>n.for===type);if(!note)return '';
 return `<section class="science"><p>${esc(note.text)}</p><p class="panel__note">${esc(t('science.model'))}</p><a href="${esc(note.url)}" target="_blank" rel="noopener noreferrer">${esc(note.name)}</a></section>`;
}
/** The research cards or notebook pages, without a frame. */
export function learningBodyHtml(s:GameState,kind:'research'|'notebook'):string{
 return kind==='research'?`<p>${esc(t('research.points',{n:s.researchPoints??0}))}</p>`+researchJson.map(r=>{
 const done=s.research?.includes(r.id);const n=notes.find(n=>n.id===r.sourceId);const source=REGISTER.find(n=>n.id===r.sourceId);
 return `<article class="learning-card"><h3>${esc(r.title)}</h3><p>${esc(r.effect)}</p>${n?`<p>${esc(n.text)}</p>`:''}${source?`<a target="_blank" rel="noopener noreferrer" href="${esc(source.url)}">${esc(source.name)}</a>`:''}<p class="panel__note">${esc(t('science.model'))}</p><button class="button button--small" data-action="research-buy" data-id="${r.id}"${done||(s.researchPoints??0)<RESEARCH_COSTS[r.id]?' disabled':''}>${esc(done?t('research.done'):t('research.buy',{n:RESEARCH_COSTS[r.id]}))}</button></article>`;
 }).join(''): (s.notebook??[]).map(type=>scienceNote(type)).join('')||`<p>${esc(t('notebook.empty'))}</p>`;
}
export function learningHtml(s:GameState,kind:'research'|'notebook'):string{
 const body=learningBodyHtml(s,kind);
 return `<div class="modal"><div class="modal__panel learning" role="dialog" aria-modal="true"><div class="sheet__head"><h2>${esc(t(kind==='research'?'research.title':'notebook.title'))}</h2><button class="button button--small" data-action="close-overlay">${esc(t('sheet.close'))}</button></div>${body}</div></div>`;
}
