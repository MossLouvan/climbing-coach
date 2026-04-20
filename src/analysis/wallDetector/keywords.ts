/**
 * Vocabulary that an image-to-text model is likely to use when it
 * describes a climbing environment. The list is intentionally broad
 * because captioning models (BLIP, ViT-GPT2, etc.) vary in phrasing.
 *
 * Matching is simple substring-on-lowercased-caption. If any positive
 * keyword appears AND no strong negative appears, the frame is
 * treated as a climbing wall.
 */
export const WALL_KEYWORDS_POSITIVE: ReadonlyArray<string> = [
  'climbing wall',
  'climbing gym',
  'bouldering',
  'boulder',
  'rock wall',
  'rock climbing',
  'climbing hold',
  'climbing route',
  'indoor climbing',
  'rock face',
  'crag',
  'cliff',
  'climber',
  'belay',
  'harness',
  'chalk bag',
  'climbing',
];

/**
 * Strong negatives: if the caption is obviously about something else
 * we short-circuit to "not a wall" even if a coincidental positive
 * like "climber" appears (e.g. "a climber plant on a wall").
 */
export const WALL_KEYWORDS_NEGATIVE: ReadonlyArray<string> = [
  'climber plant',
  'plant on',
  'kitchen',
  'bedroom',
  'couch',
  'sofa',
  'desk',
  'laptop',
  'car',
  'street',
  'beach',
  'forest',
  'ocean',
];

export interface KeywordVerdict {
  readonly isClimbingWall: boolean;
  readonly matchedPositive: ReadonlyArray<string>;
  readonly matchedNegative: ReadonlyArray<string>;
}

export function evaluateCaption(caption: string): KeywordVerdict {
  const lower = caption.toLowerCase();
  const matchedPositive = WALL_KEYWORDS_POSITIVE.filter((k) => lower.includes(k));
  const matchedNegative = WALL_KEYWORDS_NEGATIVE.filter((k) => lower.includes(k));
  const isClimbingWall = matchedPositive.length > 0 && matchedNegative.length === 0;
  return { isClimbingWall, matchedPositive, matchedNegative };
}
