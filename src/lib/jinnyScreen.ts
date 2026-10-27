// ─────────────────────────────────────────────────────────────────────────────
// Jinny's eyes and hands on the current screen
// ─────────────────────────────────────────────────────────────────────────────
// Typed actions (add_expense, update_trip, …) cover the common tasks, but
// "operate the whole app by talking" also means every button, field, tab and
// toggle a page happens to have — including ones added after this was
// written. So each turn Jinny is shown a compact list of what is visible and
// interactive, each item tagged with a short id, and can click, fill or
// scroll by id. This is the same idea screen readers and voice-control tools
// use: drive the real UI, so behaviour and permissions stay exactly what a tap
// would do.
//
// Safety rails, enforced here rather than trusted to the model:
//   • Jinny's own panel is never part of the snapshot (data-jinny-ignore).
//   • Password fields are listed but can never be filled.
//   • Controls whose label reads as destructive or outward-facing (delete,
//     sign out, pay, send, SOS…) are flagged; the caller must get the user's
//     spoken or typed "yes" before clicking them.
// ─────────────────────────────────────────────────────────────────────────────

const ID_ATTR = "data-jinny-id";
const MAX_ELEMENTS = 150;
const MAX_NAME = 70;

const INTERACTIVE = [
  "a[href]",
  "button",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "summary",
  "[role=button]",
  "[role=link]",
  "[role=tab]",
  "[role=switch]",
  "[role=checkbox]",
  "[role=radio]",
  "[role=menuitem]",
  "[role=option]",
  "[contenteditable=true]",
  // Many cards here are clickable <div>s with no role; Tailwind's
  // cursor-pointer class is the one reliable marker they carry.
  ".cursor-pointer",
].join(",");

/** Labels that must never be clicked without the user saying yes first. */
const NEEDS_CONFIRMATION =
  /\b(delete|remove|leave|revoke|sign\s*out|log\s*out|logout|pay|payment|send|share\s+(my\s+)?location|sos|emergency|report|block|reject|decline|discard|reset|clear\s+all|cancel\s+trip|end\s+trip|uninstall|transfer)\b/i;

export interface ScreenElement {
  id: string;
  kind: string;
  name: string;
  needsConfirmation: boolean;
}

export interface ScreenSnapshot {
  route: string;
  title: string;
  text: string;
  elements: ScreenElement[];
}

function collapse(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function truncate(text: string, max = MAX_NAME): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function isVisible(el: Element): boolean {
  const withCheck = el as Element & { checkVisibility?: (opts?: object) => boolean };
  if (typeof withCheck.checkVisibility === "function") {
    return withCheck.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true });
  }
  // jsdom and older engines: walk up looking for hidden ancestors.
  for (let node: Element | null = el; node; node = node.parentElement) {
    if ((node as HTMLElement).hidden || node.getAttribute("aria-hidden") === "true") return false;
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  return true;
}

function isDisabled(el: Element): boolean {
  return (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true";
}

/** The name a screen reader would announce, near enough. */
export function accessibleName(el: Element): string {
  const aria = el.getAttribute("aria-label");
  if (aria?.trim()) return collapse(aria);

  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? "")
      .join(" ");
    if (collapse(text)) return collapse(text);
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    const id = el.id;
    const forLabel = id ? el.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
    const wrapping = el.closest("label");
    const label = collapse(forLabel?.textContent) || collapse(wrapping?.textContent);
    if (label) return label;
    const placeholder = el.getAttribute("placeholder");
    if (placeholder?.trim()) return collapse(placeholder);
  }

  const title = el.getAttribute("title");
  const text = collapse((el as HTMLElement).innerText ?? el.textContent);
  if (text) return text;
  if (title?.trim()) return collapse(title);
  const img = el.querySelector("img[alt]");
  if (img?.getAttribute("alt")?.trim()) return collapse(img.getAttribute("alt"));
  return collapse(el.getAttribute("name")) || "";
}

function describeKind(el: Element): string {
  const role = el.getAttribute("role");
  if (el instanceof HTMLAnchorElement || role === "link") {
    const href = el.getAttribute("href") ?? "";
    return href.startsWith("/") ? `link → ${href}` : "link";
  }
  if (el instanceof HTMLInputElement) {
    const type = (el.type || "text").toLowerCase();
    if (type === "checkbox" || type === "radio") return `${type} (${el.checked ? "on" : "off"})`;
    if (type === "password") return "password field (never filled)";
    const value = el.value ? ` value="${truncate(el.value, 40)}"` : "";
    return `input(${type})${value}`;
  }
  if (el instanceof HTMLTextAreaElement) {
    return el.value ? `textarea value="${truncate(el.value, 40)}"` : "textarea";
  }
  if (el instanceof HTMLSelectElement) {
    const options = Array.from(el.options).slice(0, 10).map((o) => collapse(o.text)).join(" | ");
    const selected = el.selectedOptions[0] ? collapse(el.selectedOptions[0].text) : "";
    return `select [${options}] selected="${selected}"`;
  }
  if (role === "tab") return `tab${el.getAttribute("aria-selected") === "true" ? " (selected)" : ""}`;
  if (role === "switch" || role === "checkbox") {
    return `${role} (${el.getAttribute("aria-checked") === "true" ? "on" : "off"})`;
  }
  if (el.getAttribute("contenteditable") === "true") return "text box";
  const pressed = el.getAttribute("aria-pressed");
  return pressed ? `button (${pressed === "true" ? "on" : "off"})` : "button";
}

/**
 * Tags every visible interactive element with a short id and returns a
 * text description for the model. Ids are reassigned on every snapshot, so a
 * stale id from an earlier turn simply fails to resolve.
 */
export function snapshotScreen(doc: Document = document): ScreenSnapshot {
  doc.querySelectorAll(`[${ID_ATTR}]`).forEach((el) => el.removeAttribute(ID_ATTR));

  const elements: ScreenElement[] = [];
  const lines: string[] = [];
  const seen = new Set<Element>();
  for (const el of Array.from(doc.querySelectorAll(INTERACTIVE))) {
    if (elements.length >= MAX_ELEMENTS) break;
    if (el.closest("[data-jinny-ignore]") || seen.has(el)) continue;
    // Something nested inside a real link or button is one control, not two.
    const isField = el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
    if (!isField && el.parentElement?.closest("a[href], button")) continue;
    if (!isVisible(el) || isDisabled(el)) continue;
    seen.add(el);

    const name = truncate(accessibleName(el));
    const kind = describeKind(el);
    if (!name && !kind.startsWith("input") && !kind.startsWith("select") && !kind.startsWith("textarea")) continue;

    const id = `j${elements.length + 1}`;
    el.setAttribute(ID_ATTR, id);
    const needsConfirmation = NEEDS_CONFIRMATION.test(name);
    elements.push({ id, kind, name, needsConfirmation });
    lines.push(`[${id}] ${kind} "${name}"${needsConfirmation ? " ⚠ asks user to confirm" : ""}`);
  }

  const headings = Array.from(doc.querySelectorAll("h1, h2, [role=heading], [role=dialog] h3"))
    .filter((h) => !h.closest("[data-jinny-ignore]") && isVisible(h))
    .map((h) => truncate(collapse(h.textContent), 60))
    .filter(Boolean)
    .slice(0, 8);
  const dialog = Array.from(doc.querySelectorAll("[role=dialog], [aria-modal=true]"))
    .find((d) => !d.closest("[data-jinny-ignore]") && isVisible(d));

  const route = doc.defaultView?.location?.pathname ?? "";
  const title = collapse(doc.title);
  const text = [
    `Route: ${route}${title ? ` · Page title: ${title}` : ""}`,
    headings.length ? `Headings: ${headings.join(" · ")}` : "",
    dialog ? `A dialog is open: ${truncate(accessibleName(dialog) || collapse(dialog.querySelector("h2, h3")?.textContent), 60)}` : "",
    lines.length ? `Interactive elements:\n${lines.join("\n")}` : "No interactive elements are visible.",
  ].filter(Boolean).join("\n");

  return { route, title, text, elements };
}

/** The element a snapshot id points at, while it is still on screen. */
export function resolveElement(id: string, doc: Document = document): HTMLElement | null {
  if (!/^j\d{1,4}$/.test(id)) return null;
  return doc.querySelector<HTMLElement>(`[${ID_ATTR}="${id}"]`);
}
const find = resolveElement;

/** Whether clicking/filling this element needs the user's explicit yes. */
export function elementNeedsConfirmation(id: string, doc: Document = document): string | null {
  const el = find(id, doc);
  if (!el) return null;
  const name = accessibleName(el);
  return NEEDS_CONFIRMATION.test(name) ? name : null;
}

export function elementLabel(id: string, doc: Document = document): string | null {
  const el = find(id, doc);
  return el ? truncate(accessibleName(el)) || describeKind(el) : null;
}

export type ScreenResult = { ok: true; message: string } | { ok: false; message: string };

/**
 * Click by snapshot id, or by element — the latter for a click confirmed a
 * turn later, after ids have been reassigned.
 */
export function clickElement(target: string | HTMLElement, doc: Document = document): ScreenResult {
  const el = typeof target === "string" ? find(target, doc) : target.isConnected ? target : null;
  const id = typeof target === "string" ? target : "that control";
  if (!el) return { ok: false, message: `${id === "that control" ? "That control" : `Element ${id}`} is no longer on screen.` };
  if (isDisabled(el)) return { ok: false, message: `"${accessibleName(el)}" is disabled right now.` };
  el.scrollIntoView?.({ block: "center", behavior: "smooth" });
  el.focus?.({ preventScroll: true });
  el.click();
  return { ok: true, message: `Clicked "${truncate(accessibleName(el)) || id}".` };
}

/** Set a value the way typing would, so React's onChange sees it. */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export function fillElement(id: string, value: string, opts: { submit?: boolean } = {}, doc: Document = document): ScreenResult {
  const el = find(id, doc);
  if (!el) return { ok: false, message: `Element ${id} is no longer on screen.` };
  const name = truncate(accessibleName(el)) || id;

  if (el instanceof HTMLInputElement && el.type === "password") {
    return { ok: false, message: "I can't type into password fields. Please enter it yourself." };
  }

  if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
    const want = /^(true|on|yes|checked|1)$/i.test(value.trim());
    if (el.checked !== want) el.click();
    return { ok: true, message: `Turned "${name}" ${want ? "on" : "off"}.` };
  }

  if (el instanceof HTMLSelectElement) {
    const target = value.trim().toLowerCase();
    const option = Array.from(el.options).find((o) => o.value.toLowerCase() === target)
      ?? Array.from(el.options).find((o) => collapse(o.text).toLowerCase() === target)
      ?? Array.from(el.options).find((o) => collapse(o.text).toLowerCase().includes(target));
    if (!option) {
      return { ok: false, message: `"${name}" has no option matching "${value}".` };
    }
    setNativeValue(el, option.value);
    return { ok: true, message: `Set "${name}" to "${collapse(option.text)}".` };
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.focus({ preventScroll: true });
    setNativeValue(el, value);
    if (opts.submit) {
      const enter = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
      const proceed = el.dispatchEvent(new KeyboardEvent("keydown", enter));
      el.dispatchEvent(new KeyboardEvent("keyup", enter));
      if (proceed && el.form) el.form.requestSubmit?.();
    }
    return { ok: true, message: `Typed "${truncate(value, 50)}" into "${name}"${opts.submit ? " and submitted" : ""}.` };
  }

  if (el.getAttribute("contenteditable") === "true") {
    el.focus();
    el.textContent = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return { ok: true, message: `Typed into "${name}".` };
  }

  return { ok: false, message: `"${name}" isn't a field I can type into. Try clicking it instead.` };
}

export function scrollScreen(direction: string, win: Window = window): ScreenResult {
  const page = win.innerHeight * 0.8;
  const d = direction.toLowerCase();
  if (d === "top") win.scrollTo({ top: 0, behavior: "smooth" });
  else if (d === "bottom") win.scrollTo({ top: win.document.body.scrollHeight, behavior: "smooth" });
  else win.scrollBy({ top: d === "up" ? -page : page, behavior: "smooth" });
  return { ok: true, message: `Scrolled ${d}.` };
}
