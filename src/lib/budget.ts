// ─────────────────────────────────────────────────────────────────────────────
// Trip budget arithmetic
// ─────────────────────────────────────────────────────────────────────────────
// Every budget figure the app shows comes from here, so the panel, the AI
// assistant and the planner can never disagree about what was planned, spent
// or owed. Pure functions only — no network, no React — so it runs offline and
// is unit-tested.
//
// Two numbers are kept strictly apart:
//
//   planned — the sum of the itinerary's activity costs. A forecast.
//   spent   — the sum of expenses people actually logged. Money that moved.
//
// The old panel added them together as "Total Spent", so a dinner that was in
// the plan *and* logged as an expense was counted twice, and an untouched plan
// showed as money already gone.
//
// Money is summed in minor units (paise / cents) so that splitting ₹100 three
// ways produces 33.34 + 33.33 + 33.33 rather than float drift.
// ─────────────────────────────────────────────────────────────────────────────

export interface CostItem {
  cost?: unknown;
  category?: string | null;
}

export interface ExpenseItem {
  paid_by: string;
  amount: unknown;
  category?: string | null;
  split_with?: string[] | null;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

export interface CategoryLine {
  category: string;
  planned: number;
  spent: number;
}

export interface BudgetSummary {
  budget: number;
  /** Sum of itinerary activity costs. */
  planned: number;
  /** Sum of logged expenses. */
  spent: number;
  /** budget − spent. Negative when over. */
  remaining: number;
  /** budget − planned: whether the plan itself fits. Negative when over. */
  plannedHeadroom: number;
  /** spent as a % of budget, or null when no budget is set. */
  percentSpent: number | null;
  /** planned as a % of budget, or null when no budget is set. */
  percentPlanned: number | null;
  travelers: number;
  spentPerPerson: number;
  plannedPerPerson: number;
  budgetPerPerson: number;
  days: number;
  budgetPerDay: number;
  categories: CategoryLine[];
}

/** Expense categories, matching the `group_expenses.category` CHECK constraint. */
export const EXPENSE_CATEGORY_VALUES = [
  "food",
  "transport",
  "activity",
  "accommodation",
  "shopping",
  "general",
  "other",
] as const;

/** Activity categories the planner emits, mapped onto expense categories. */
const ACTIVITY_TO_EXPENSE_CATEGORY: Record<string, string> = {
  food: "food",
  transport: "transport",
  attraction: "activity",
  entertainment: "activity",
  activity: "activity",
  accommodation: "accommodation",
  shopping: "shopping",
  other: "general",
};

export function activityCategoryToExpense(category?: string | null): string {
  return ACTIVITY_TO_EXPENSE_CATEGORY[(category ?? "").toLowerCase()] ?? "general";
}

/**
 * Coerces a stored or model-produced amount to a non-negative number.
 * Accepts numbers and numeric strings ("1200", "₹1,200.50"); anything else,
 * including negatives and NaN, counts as 0 rather than poisoning a total.
 */
export function toAmount(value: unknown): number {
  let n: number;
  if (typeof value === "number") n = value;
  else if (typeof value === "string") n = Number(value.replace(/[^\d.-]/g, ""));
  else return 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const toMinor = (amount: number) => Math.round(amount * 100);
const fromMinor = (minor: number) => minor / 100;

/** Rounds to two decimals without binary-float artefacts. */
export function roundMoney(amount: number): number {
  return fromMinor(toMinor(amount));
}

/** Sum of item costs, robust to strings and missing values. */
export function sumCosts(items: ReadonlyArray<CostItem> | null | undefined): number {
  if (!items) return 0;
  return fromMinor(items.reduce((total, item) => total + toMinor(toAmount(item.cost)), 0));
}

/** Sum of expense amounts. */
export function sumExpenses(expenses: ReadonlyArray<ExpenseItem> | null | undefined): number {
  if (!expenses) return 0;
  return fromMinor(expenses.reduce((total, e) => total + toMinor(toAmount(e.amount)), 0));
}

/**
 * Splits `minor` units across `count` people so the parts add up exactly:
 * 10000 across 3 → [3334, 3333, 3333].
 */
function splitMinor(minor: number, count: number): number[] {
  const base = Math.floor(minor / count);
  const remainder = minor - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * Net balance per member in minor units: positive means the group owes them,
 * negative means they owe the group. An expense with no `split_with` is the
 * payer's own cost and moves nothing.
 */
function balancesMinor(
  expenses: ReadonlyArray<ExpenseItem>,
  memberIds: ReadonlyArray<string> = [],
): Map<string, number> {
  const balances = new Map<string, number>(memberIds.map((id) => [id, 0]));
  const add = (id: string, delta: number) =>
    balances.set(id, (balances.get(id) ?? 0) + delta);

  for (const expense of expenses) {
    const minor = toMinor(toAmount(expense.amount));
    if (minor === 0) continue;
    const participants = [...new Set(expense.split_with ?? [])].filter(Boolean);
    const sharers = participants.length > 0 ? participants : [expense.paid_by];
    add(expense.paid_by, minor);
    splitMinor(minor, sharers.length).forEach((share, i) => add(sharers[i], -share));
  }
  return balances;
}

/** Net balance per member, in currency units. */
export function computeBalances(
  expenses: ReadonlyArray<ExpenseItem>,
  memberIds: ReadonlyArray<string> = [],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, minor] of balancesMinor(expenses, memberIds)) out[id] = fromMinor(minor);
  return out;
}

/**
 * Who pays whom to settle up. Largest debts are matched to largest credits
 * first, which keeps the number of transfers low, and the transfers settle
 * every balance to the paisa.
 */
export function settleUp(
  expenses: ReadonlyArray<ExpenseItem>,
  memberIds: ReadonlyArray<string> = [],
): Transfer[] {
  const balances = balancesMinor(expenses, memberIds);
  const debtors = [...balances]
    .filter(([, b]) => b < 0)
    .map(([id, b]) => ({ id, owed: -b }))
    .sort((a, b) => b.owed - a.owed || a.id.localeCompare(b.id));
  const creditors = [...balances]
    .filter(([, b]) => b > 0)
    .map(([id, b]) => ({ id, due: b }))
    .sort((a, b) => b.due - a.due || a.id.localeCompare(b.id));

  const transfers: Transfer[] = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(debtors[d].owed, creditors[c].due);
    if (amount > 0) {
      transfers.push({ from: debtors[d].id, to: creditors[c].id, amount: fromMinor(amount) });
    }
    debtors[d].owed -= amount;
    creditors[c].due -= amount;
    if (debtors[d].owed === 0) d++;
    if (creditors[c].due === 0) c++;
  }
  return transfers;
}

const percentOf = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;

/** The single source for every budget figure shown about a trip. */
export function summarizeBudget(input: {
  budget: unknown;
  activities?: ReadonlyArray<CostItem> | null;
  expenses?: ReadonlyArray<ExpenseItem> | null;
  travelers?: number;
  days?: number;
}): BudgetSummary {
  const budget = roundMoney(toAmount(input.budget));
  const activities = input.activities ?? [];
  const expenses = input.expenses ?? [];
  const travelers = Math.max(1, Math.floor(input.travelers ?? 1) || 1);
  const days = Math.max(1, Math.floor(input.days ?? 1) || 1);

  const planned = sumCosts(activities);
  const spent = sumExpenses(expenses);

  const byCategory = new Map<string, { planned: number; spent: number }>();
  const line = (category: string) => {
    const existing = byCategory.get(category);
    if (existing) return existing;
    const created = { planned: 0, spent: 0 };
    byCategory.set(category, created);
    return created;
  };
  for (const a of activities) {
    const minor = toMinor(toAmount(a.cost));
    if (minor > 0) line(activityCategoryToExpense(a.category)).planned += minor;
  }
  for (const e of expenses) {
    const minor = toMinor(toAmount(e.amount));
    if (minor > 0) line(e.category || "general").spent += minor;
  }
  const categories = [...byCategory]
    .map(([category, v]) => ({
      category,
      planned: fromMinor(v.planned),
      spent: fromMinor(v.spent),
    }))
    .sort((a, b) => Math.max(b.planned, b.spent) - Math.max(a.planned, a.spent));

  return {
    budget,
    planned,
    spent,
    remaining: roundMoney(budget - spent),
    plannedHeadroom: roundMoney(budget - planned),
    percentSpent: percentOf(spent, budget),
    percentPlanned: percentOf(planned, budget),
    travelers,
    spentPerPerson: roundMoney(spent / travelers),
    plannedPerPerson: roundMoney(planned / travelers),
    budgetPerPerson: roundMoney(budget / travelers),
    days,
    budgetPerDay: roundMoney(budget / days),
    categories,
  };
}
