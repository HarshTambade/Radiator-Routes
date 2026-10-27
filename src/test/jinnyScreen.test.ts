import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickElement,
  elementNeedsConfirmation,
  fillElement,
  resolveElement,
  snapshotScreen,
} from "@/lib/jinnyScreen";

function idFor(name: string): string {
  const el = snapshotScreen().elements.find((e) => e.name === name);
  if (!el) throw new Error(`no element named ${name}`);
  return el.id;
}

describe("snapshotScreen", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <h1>Goa Getaway</h1>
      <nav><a href="/explore">Explore</a></nav>
      <button>Generate itinerary</button>
      <button aria-label="Delete trip"><svg></svg></button>
      <label for="amount">Amount</label><input id="amount" type="number" />
      <input type="password" placeholder="Password" />
      <select aria-label="Category"><option value="food">Food</option><option value="transport">Transport</option></select>
      <button disabled>Saving…</button>
      <div style="display:none"><button>Hidden action</button></div>
      <div class="cursor-pointer">Calangute Beach</div>
      <div data-jinny-ignore><button>Send message</button></div>
    `;
  });

  it("lists visible controls with readable names and short ids", () => {
    const snap = snapshotScreen();
    const names = snap.elements.map((e) => e.name);
    expect(names).toEqual(
      expect.arrayContaining(["Explore", "Generate itinerary", "Delete trip", "Amount", "Password", "Category", "Calangute Beach"]),
    );
    expect(snap.text).toContain("Headings: Goa Getaway");
    expect(snap.text).toMatch(/\[j\d+\] link → \/explore "Explore"/);
    expect(snap.elements.every((e) => /^j\d+$/.test(e.id))).toBe(true);
  });

  it("leaves out hidden, disabled and Jinny's own controls", () => {
    const names = snapshotScreen().elements.map((e) => e.name);
    expect(names).not.toContain("Hidden action");
    expect(names).not.toContain("Saving…");
    expect(names).not.toContain("Send message");
  });

  it("flags destructive or outward controls for confirmation", () => {
    const snap = snapshotScreen();
    expect(snap.elements.find((e) => e.name === "Delete trip")?.needsConfirmation).toBe(true);
    expect(snap.elements.find((e) => e.name === "Generate itinerary")?.needsConfirmation).toBe(false);
    expect(elementNeedsConfirmation(idFor("Delete trip"))).toBe("Delete trip");
  });

  it("reassigns ids on every snapshot so stale ids stop resolving", () => {
    const first = idFor("Generate itinerary");
    document.body.insertAdjacentHTML("afterbegin", "<button>New first button</button>");
    snapshotScreen();
    expect(resolveElement(first)?.textContent).not.toBe("Generate itinerary");
  });
});

describe("screen actions", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button>Generate itinerary</button>
      <label>Search <input type="text" /></label>
      <input type="password" aria-label="Password" />
      <select aria-label="Category"><option value="food">Food</option><option value="transport">Transport</option></select>
      <label><input type="checkbox" /> Offline maps</label>
    `;
  });

  it("clicks by id", () => {
    const onClick = vi.fn();
    document.querySelector("button")!.addEventListener("click", onClick);
    expect(clickElement(idFor("Generate itinerary")).ok).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("types in a way React's onChange sees, and can press Enter", () => {
    const input = document.querySelector<HTMLInputElement>('input[type="text"]')!;
    const onInput = vi.fn();
    const onEnter = vi.fn();
    input.addEventListener("input", onInput);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") onEnter(); });
    const result = fillElement(idFor("Search"), "Jaipur", { submit: true });
    expect(result.ok).toBe(true);
    expect(input.value).toBe("Jaipur");
    expect(onInput).toHaveBeenCalled();
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it("picks select options by label and toggles checkboxes", () => {
    expect(fillElement(idFor("Category"), "transport").ok).toBe(true);
    expect(document.querySelector("select")!.value).toBe("transport");
    expect(fillElement(idFor("Offline maps"), "true").ok).toBe(true);
    expect(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
    expect(fillElement(idFor("Category"), "spaceship").ok).toBe(false);
  });

  it("refuses to type into password fields", () => {
    const result = fillElement(idFor("Password"), "hunter2");
    expect(result.ok).toBe(false);
    expect(document.querySelector<HTMLInputElement>('input[type="password"]')!.value).toBe("");
  });

  it("reports a missing element instead of throwing", () => {
    expect(clickElement("j999").ok).toBe(false);
    expect(fillElement("not-an-id", "x").ok).toBe(false);
  });
});
