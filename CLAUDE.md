# Outpost Builder

SPEC.md is the single source of truth. Read it before any work.

- Build one phase from SPEC.md section 14 at a time. Stop at the end of each phase.
- Never invent NASA data or science facts. Missing content becomes TODO(content) and goes in CONTENT_TODO.md.
- All tunable numbers live in src/sim/config.ts.
- src/sim/ must not import Phaser, the DOM, or Math.random.
- Run `npm test` before every commit.
- Art is in public/assets/art, audio in public/assets/audio. Use the real files, never overwrite them.
- If SPEC.md is unclear or contradicts itself, ask before building.
-Never continue if confused or obsfucating or complicating stop and review and ask if needed
