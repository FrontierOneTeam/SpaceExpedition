import {it,expect} from 'vitest';
import {run} from './helpers.ts';
import {buyResearch} from '../src/sim/research.ts';
it('research costs points once and reactor unlock is persistent',()=>{const s=run().state;s.researchPoints=10;expect(buyResearch(s,'nuke')).toBe(true);expect(s.researchPoints).toBe(4);expect(s.unlocked).toContain('nuke');expect(buyResearch(s,'nuke')).toBe(false);});
