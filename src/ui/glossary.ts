// Tap-to-explain words (SPEC 8.3). Glossary words in already-escaped interface text get a dotted
// underline and open their sentence in a small bubble. The sentences come only from glossary.json.

import { GLOSSARY } from './content.ts';
import { esc } from './format.ts';

const WORDS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Longest first, so "solar flare" wins over shorter words. A plural "s" may follow.
// "class X" is followed by the class number ("class X9.3"), so only letters end a word.
const PATTERN = new RegExp(`\\b(${WORDS.map(escapeRe).join('|')})(s?)(?![a-z])`, 'gi');

function keyOf(match: string): string | null {
  const lower = match.toLowerCase();
  return WORDS.find((w) => w.toLowerCase() === lower) ?? null;
}

/**
 * Mark the first use of each glossary word in a piece of escaped HTML text.
 * The marked word is a span with role="button", so it may sit inside a button.
 */
export function gloss(escapedText: string): string {
  const seen = new Set<string>();
  return escapedText.replace(PATTERN, (whole: string, word: string, plural: string) => {
    const key = keyOf(word);
    if (!key || seen.has(key)) return whole;
    seen.add(key);
    return `<span class="gloss" role="button" tabindex="0" data-action="gloss" data-word="${esc(key)}">${word}${plural}</span>`;
  });
}

/** Escape plain text and mark its glossary words. */
export function glossText(text: string): string {
  return gloss(esc(text));
}

export function glossSentence(word: string): string | null {
  return GLOSSARY[word] ?? null;
}
