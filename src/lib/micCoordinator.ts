// ─────────────────────────────────────────────────────────────────────────────
// Microphone coordination
// ─────────────────────────────────────────────────────────────────────────────
// Chrome runs one SpeechRecognition session per page: starting a new one
// aborts whichever is already running. The "Hey Jinny" wake listener runs
// continuously and restarts itself 500 ms after it ends, so tapping any other
// mic (trip-creation chat, accessibility voice commands) started a tug-of-war —
// the user's session aborted the wake listener, the wake listener restarted
// and aborted the user's session, and the mic went quiet without a word.
//
// Every mic the user starts on purpose claims the microphone here. The wake
// listener is the only background listener: it watches this claim, stands
// down while anything holds it, and resumes once it is released.
// ─────────────────────────────────────────────────────────────────────────────

type Listener = (claimed: boolean) => void;

let holders = 0;
const listeners = new Set<Listener>();

function notify(claimed: boolean) {
  for (const listener of [...listeners]) {
    try {
      listener(claimed);
    } catch {
      /* one bad listener must not block the others */
    }
  }
}

/**
 * Claims the microphone for a user-started session. Call before
 * `recognition.start()`; call the returned release function exactly when the
 * session ends, errors or is aborted. Releasing twice is harmless.
 */
export function claimMic(): () => void {
  holders += 1;
  if (holders === 1) notify(true);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    if (holders === 0) notify(false);
  };
}

/** True while any user-started voice session holds the microphone. */
export function isMicClaimed(): boolean {
  return holders > 0;
}

/** Subscribe to claim changes. Returns an unsubscribe function. */
export function onMicClaimChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
