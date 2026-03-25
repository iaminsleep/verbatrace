import type { TimedWord } from "../asr/protocol";

const PAUSE_THRESHOLD_MS = 3000;

const STRONG_SENTENCE_END = /[!?…](?:["'»)\]]+)?$/u;
const PERIOD_SENTENCE_END = /\.(?:["'»)\]]+)?$/u;
const TRAILING_CLOSERS = /["'»)\]]+$/gu;
const LEADING_OPENERS = /^[("'«‘[{]+/u;

const DOTTED_ACRONYM = /^(?:\p{L}\.){2,}$/u;
const SINGLE_LETTER_ENUM = /^\p{Lu}\.$/u;
const ROMAN_ENUM = /^(?:[IVXLCDM]+)\.$/i;
const NUMERIC_ENUM = /^\d+\.$/;

const NON_BREAKING = new Set([

  "mr.", "mrs.", "ms.", "dr.", "prof.", "sr.", "jr.", "vs.", "etc.", "e.g.", "i.e.",

  "т.д.", "т.п.", "т.е.", "др.", "проф.", "тыс.", "млн.", "млрд.", "им.", "гг.", "вв.",
]);

const stripClosers = (text: string): string => String(text ?? "").replace(TRAILING_CLOSERS, "");

function looksLikeSentenceStart(text: string): boolean {
  return /^\p{Lu}/u.test(String(text ?? "").replace(LEADING_OPENERS, ""));
}

function endsSentence(word: TimedWord, next: TimedWord | null, gapMs: number): boolean {
  if (!next) return false;
  if (gapMs >= PAUSE_THRESHOLD_MS) return true;

  const text = String(word.text ?? "");
  if (!text) return false;
  if (STRONG_SENTENCE_END.test(text)) return true;
  if (!PERIOD_SENTENCE_END.test(text)) return false;

  const stripped = stripClosers(text);
  if (
    NON_BREAKING.has(stripped.toLowerCase()) ||
    DOTTED_ACRONYM.test(stripped) ||
    SINGLE_LETTER_ENUM.test(stripped) ||
    ROMAN_ENUM.test(stripped) ||
    NUMERIC_ENUM.test(stripped)
  ) {
    return false;
  }
  return looksLikeSentenceStart(next.text);
}

export interface Turn {
  words: TimedWord[];
  speaker: string | null;
}

export function buildTurns(words: TimedWord[], speakers?: (string | null)[]): Turn[] {
  if (words.length === 0) return [];

  const speakerOf = (at: number): string | null => speakers?.[at] ?? null;
  const turns: Turn[] = [];
  let current: TimedWord[] = [words[0]];
  let currentSpeaker = speakerOf(0);

  for (let at = 1; at < words.length; at += 1) {
    const previous = words[at - 1];
    const word = words[at];
    const gapMs = (word.start - previous.end) * 1000;

    if (speakerOf(at) !== currentSpeaker || endsSentence(previous, word, gapMs)) {
      turns.push({ words: current, speaker: currentSpeaker });
      current = [word];
      currentSpeaker = speakerOf(at);
    } else {
      current.push(word);
    }
  }
  turns.push({ words: current, speaker: currentSpeaker });
  return turns;
}

export function turnText(words: TimedWord[]): string {
  const parts: string[] = [];
  for (const word of words) {
    if (!word.text) continue;
    const last = parts.at(-1);
    if (last != null && !last.endsWith("-") && !last.endsWith("\n")) parts.push(" ");
    parts.push(word.text);
  }
  return parts.join("");
}

export function capitaliseFirst(words: TimedWord[]): void {
  const first = words[0];
  if (!first?.text) return;
  first.text = first.text[0].toUpperCase() + first.text.slice(1);
}
