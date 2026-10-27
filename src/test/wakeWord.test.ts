import { describe, expect, it } from "vitest";
import { isHangUpPhrase, matchWakePhrase } from "@/lib/wakeWord";

describe("matchWakePhrase", () => {
  it.each([
    "hey jinny",
    "Hey Jinny",
    "hey, Jenny",
    "Hey Jeannie!",
    "hi ginny",
    "hey genie",
    "Hey Jini",
    "okay jinny",
    "a jenny",
    "wake up jinny",
    "Jinny are you there",
  ])("recognises %j", (heard) => {
    expect(matchWakePhrase(heard)).not.toBeNull();
  });

  it.each([
    "hey johnny",
    "hey jimmy",
    "hey jean",
    "pour me a gin",
    "I told Jenny about Goa",
    "I saw a genie in the movie",
    "and he jenny went home",
    "what's the weather",
  ])("ignores %j", (heard) => {
    expect(matchWakePhrase(heard)).toBeNull();
  });

  it("keeps the request spoken after the wake phrase, with its casing", () => {
    expect(matchWakePhrase("Hey Jenny, what's the weather in Goa?")?.remainder).toBe(
      "what's the weather in Goa?",
    );
    expect(matchWakePhrase("hey jinny")?.remainder).toBe("");
    expect(matchWakePhrase("Jinny, wake up")?.remainder).toBe("");
  });
});

describe("isHangUpPhrase", () => {
  it.each(["bye", "Okay, bye Jinny!", "thanks, that's all", "end call", "No thanks", "that's it for now", "goodbye"])(
    "treats %j as hanging up",
    (said) => {
      expect(isHangUpPhrase(said)).toBe(true);
    },
  );

  it.each(["thanks", "plan a trip to Goa", "what did I spend in Jaipur before I said bye", "no, make it five days"])(
    "keeps the call going for %j",
    (said) => {
      expect(isHangUpPhrase(said)).toBe(false);
    },
  );
});
