import type { Segment, Speaker, TranscriptResponse, Word } from "../../types";

export interface Turn {
  id: number | null;
  speakerId: number | null;

  showSpeaker: boolean;
  from: number;
  to: number;
  startMs: number;
}

export interface TranscriptModel {
  words: Word[];
  starts: Int32Array;
  ends: Int32Array;
  turns: Turn[];

  turnOfWord: Int32Array;
  speakers: Map<number, { speaker: Speaker; index: number }>;
  durationMs: number;
}

const EMPTY: TranscriptModel = {
  words: [],
  starts: new Int32Array(0),
  ends: new Int32Array(0),
  turns: [],
  turnOfWord: new Int32Array(0),
  speakers: new Map(),
  durationMs: 0,
};

export function buildModel(data: TranscriptResponse | undefined): TranscriptModel {
  if (!data || data.words.length === 0) return EMPTY;

  const { words } = data;
  const starts = new Int32Array(words.length);
  const ends = new Int32Array(words.length);
  for (const [at, word] of words.entries()) {
    starts[at] = word.start_ms;
    ends[at] = word.end_ms;
  }

  const turnOfWord = new Int32Array(words.length);
  const turns: Turn[] = data.segments.length > 0
    ? fromSegments(data.segments, turnOfWord)
    : fromSpeakerRuns(words, turnOfWord);

  const speakers = new Map<number, { speaker: Speaker; index: number }>();
  for (const [index, speaker] of data.speakers.entries()) {
    speakers.set(speaker.id, { speaker, index });
  }

  return {
    words,
    starts,
    ends,
    turns,
    turnOfWord,
    speakers,
    durationMs: data.duration_ms,
  };
}

function fromSegments(segments: Segment[], turnOfWord: Int32Array): Turn[] {
  const turns: Turn[] = [];
  let at = 0;
  for (const [index, segment] of segments.entries()) {
    const previousSpeaker = index > 0 ? segments[index - 1].speaker_id : null;
    const count = segment.words.length;
    if (count === 0) continue;
    for (let n = 0; n < count; n += 1) turnOfWord[at + n] = turns.length;
    turns.push({
      id: segment.id,
      speakerId: segment.speaker_id,
      showSpeaker: segment.speaker_id !== null && segment.speaker_id !== previousSpeaker,
      from: at,
      to: at + count - 1,
      startMs: segment.start_ms,
    });
    at += count;
  }
  return turns;
}

function fromSpeakerRuns(words: Word[], turnOfWord: Int32Array): Turn[] {
  const turns: Turn[] = [];
  for (const [at, word] of words.entries()) {
    const changed = at === 0 || word.speaker_id !== words[at - 1].speaker_id;
    if (changed) {
      turns.push({
        id: null,
        speakerId: word.speaker_id,
        showSpeaker: word.speaker_id !== null,
        from: at,
        to: at,
        startMs: word.start_ms,
      });
    } else {
      turns[turns.length - 1].to = at;
    }
    turnOfWord[at] = turns.length - 1;
  }
  return turns;
}
