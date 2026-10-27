// ─────────────────────────────────────────────────────────────────────────────
// "Hey Jinny" wake phrase and voice-call hang-up detection
// ─────────────────────────────────────────────────────────────────────────────
// Browser speech recognition has never heard of "Jinny". It writes what it
// thinks it heard — "hey Jenny", "Hey, Jeannie", "hi Ginny", "hey genie",
// "Hey Jini" — so an exact list of spellings missed most real attempts, and
// any punctuation ("hey, jinny") broke the match entirely. The name is matched
// by its sound shape instead: a j/g onset, a short vowel, n or nn, and a
// closing -y/-ie/-i/-ee sound. That covers the spellings recognisers produce
// without accepting "Johnny", "Jimmy", "Jean" or "gin".
// ─────────────────────────────────────────────────────────────────────────────

const NAME = String.raw`(?:j|g|dj)(?:i|e|ee|ea|ie)n{1,2}(?:y|ie|i|ee|ey)`;
const GREETING = String.raw`(?:hey|hay|hei|hi|hiya|hello|hallo|ok|okay|oi|oye|yo)`;
// How "hey" is often heard, but too common mid-sentence ("I saw a genie") to
// accept anywhere but the start of what was said.
const LEADING_GREETING = String.raw`(?:a|ay|eh|he)`;
const SEP = String.raw`[\s,.!?;:'"-]*`;

const WAKE_PATTERNS: RegExp[] = [
  // "hey jinny", "Hey, Jenny!", "ok ginny"
  new RegExp(String.raw`\b${GREETING}${SEP}\b${NAME}\b`, "i"),
  // "a jinny…" — the recogniser's take on a fast "hey jinny"
  new RegExp(String.raw`^${SEP}${LEADING_GREETING}${SEP}\b${NAME}\b`, "i"),
  // "wake up jinny"
  new RegExp(String.raw`\bwake${SEP}up${SEP}\b${NAME}\b`, "i"),
  // "jinny, wake up" / "jinny are you there" — only at the very start, so a
  // passing mention of someone named Jenny does not open the assistant.
  new RegExp(String.raw`^${SEP}${NAME}${SEP}(?:wake(?:${SEP}up)?|open|activate|are${SEP}you${SEP}there|you${SEP}there)\b`, "i"),
];

export interface WakeMatch {
  /** Whatever the user said after the wake phrase, e.g. "what's the weather in Goa". */
  remainder: string;
}

/**
 * Detects the wake phrase in a recognised transcript. Returns null when it is
 * absent, otherwise the request that followed it (possibly empty), with the
 * original casing kept so place names stay capitalised.
 */
export function matchWakePhrase(transcript: string): WakeMatch | null {
  const text = transcript ?? "";
  for (const pattern of WAKE_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const remainder = text
      .slice(match.index + match[0].length)
      .replace(/^(?:[\s,.!?;:'"-]|wake\s*up\b|you\s*there\b)+/i, "")
      .trim();
    return { remainder: /[a-z0-9]/i.test(remainder) ? remainder : "" };
  }
  return null;
}

// ── Hang-up ──────────────────────────────────────────────────────────────────

const HANG_UP = /^(?:that'?s all|that is all|that'?s it|that'?ll be all|bye(?: bye)?|goodbye|good bye|end (?:the )?call|hang up|stop listening|see you(?: later| soon)?|see ya|talk (?:to you )?later|catch you later|nothing else|no thanks?|no thank you|i'?m done|we'?re done|i'?m good|all done)$/;
const LEADING_PLEASANTRY = /^(?:ok|okay|thanks|thank you|cool|great|alright|all right|perfect|awesome|got it|nice|no|nope|nah|so)\s+/;
const TRAILING_PLEASANTRY = /\s+(?:jinny|jenny|ginny|for now|then|thanks|thank you|bye)$/;

/**
 * True when a short utterance means "end the call" — "bye", "thanks, that's
 * all", "okay bye Jinny", "end call". Longer requests that merely contain
 * "bye" ("book a bye-the-sea hotel") are not treated as hang-ups.
 */
export function isHangUpPhrase(utterance: string): boolean {
  let t = (utterance ?? "")
    .toLowerCase()
    .replace(/[^a-z'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || t.split(" ").length > 8) return false;
  if (HANG_UP.test(t)) return true;
  for (let i = 0; i < 4; i++) {
    const next = t.replace(LEADING_PLEASANTRY, "").replace(TRAILING_PLEASANTRY, "").trim();
    if (next === t) break;
    t = next;
    if (HANG_UP.test(t)) return true;
  }
  return false;
}
