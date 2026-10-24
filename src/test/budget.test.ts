import { describe, expect, it } from "vitest";
import {
  computeBalances,
  settleUp,
  sumCosts,
  summarizeBudget,
  toAmount,
} from "@/lib/budget";
import {
  formatMoney,
  formatMoneyPlain,
  formatMoneyTotals,
  getCurrencyForCountry,
  parseBudgetInput,
} from "@/lib/currency";
import { tripDayCount } from "@/lib/date";

describe("toAmount / sumCosts", () => {
  it("accepts numbers and numeric strings, ignores junk and negatives", () => {
    expect(toAmount(500)).toBe(500);
    expect(toAmount("₹1,200.50")).toBe(1200.5);
    expect(toAmount(null)).toBe(0);
    expect(toAmount(-40)).toBe(0);
    expect(toAmount(Number.NaN)).toBe(0);
  });

  it("sums string costs numerically instead of concatenating them", () => {
    expect(sumCosts([{ cost: "500" }, { cost: 250 }, { cost: null }])).toBe(750);
  });

  it("does not drift on decimals", () => {
    expect(sumCosts([{ cost: 0.1 }, { cost: 0.2 }])).toBe(0.3);
  });
});

describe("summarizeBudget", () => {
  const activities = [
    { cost: 2000, category: "food" },
    { cost: 3000, category: "attraction" },
    { cost: 0, category: "attraction" },
  ];
  const expenses = [
    { paid_by: "a", amount: 1500, category: "food", split_with: ["a", "b"] },
  ];

  it("keeps planned and spent separate", () => {
    const s = summarizeBudget({ budget: 10000, activities, expenses, travelers: 2, days: 4 });
    expect(s.planned).toBe(5000);
    expect(s.spent).toBe(1500);
    // Remaining is budget minus money actually spent — not minus the plan too.
    expect(s.remaining).toBe(8500);
    expect(s.plannedHeadroom).toBe(5000);
    expect(s.percentSpent).toBe(15);
    expect(s.percentPlanned).toBe(50);
    expect(s.spentPerPerson).toBe(750);
    expect(s.budgetPerDay).toBe(2500);
  });

  it("breaks down planned and spent per expense category", () => {
    const s = summarizeBudget({ budget: 10000, activities, expenses });
    expect(s.categories).toEqual([
      { category: "activity", planned: 3000, spent: 0 },
      { category: "food", planned: 2000, spent: 1500 },
    ]);
  });

  it("reports no percentage rather than a fake one when no budget is set", () => {
    const s = summarizeBudget({ budget: 0, activities, expenses });
    expect(s.percentSpent).toBeNull();
    expect(s.remaining).toBe(-1500);
  });
});

describe("settleUp", () => {
  it("splits uneven amounts to the paisa and settles everyone", () => {
    const expenses = [{ paid_by: "a", amount: 100, split_with: ["a", "b", "c"] }];
    const balances = computeBalances(expenses, ["a", "b", "c"]);
    const total = Object.values(balances).reduce((s, b) => s + b, 0);
    expect(Math.abs(total)).toBeLessThan(1e-9);

    const transfers = settleUp(expenses, ["a", "b", "c"]);
    const paidToA = transfers
      .filter((t) => t.to === "a")
      .reduce((s, t) => s + t.amount, 0);
    expect(Math.round(paidToA * 100)).toBe(6666);
  });

  it("nets out mutual debts", () => {
    const transfers = settleUp([
      { paid_by: "a", amount: 600, split_with: ["a", "b"] },
      { paid_by: "b", amount: 200, split_with: ["a", "b"] },
    ]);
    expect(transfers).toEqual([{ from: "b", to: "a", amount: 200 }]);
  });

  it("treats an expense with no split as the payer's own cost", () => {
    expect(settleUp([{ paid_by: "a", amount: 500, split_with: [] }])).toEqual([]);
  });
});

describe("currency", () => {
  it("formats in the stored currency, not the destination's", () => {
    expect(formatMoney(50000, "INR")).toBe("₹50,000");
    expect(formatMoney(1234.5, "INR")).toBe("₹1,234.50");
    expect(formatMoneyPlain(50000, "INR")).toBe("INR 50,000");
  });

  it("never adds different currencies together", () => {
    expect(
      formatMoneyTotals([
        { amount: 50000, currency: "INR" },
        { amount: 30000, currency: "INR" },
        { amount: 2000, currency: "USD" },
      ]),
    ).toBe("₹80,000 + $2,000");
  });

  it("does not map Ukraine to UK pounds", () => {
    expect(getCurrencyForCountry("Ukraine").code).toBe("INR");
    expect(getCurrencyForCountry("Republic of India").code).toBe("INR");
    expect(getCurrencyForCountry("japan").code).toBe("JPY");
  });

  it.each([
    ["50000", 50000, null],
    ["₹50,000", 50000, "INR"],
    ["50k", 50000, null],
    ["1.5 lakh", 150000, null],
    ["2 crore", 20000000, null],
    ["2000 USD", 2000, "USD"],
    ["$2,000.50", 2000.5, "USD"],
    ["Rs 75000", 75000, "INR"],
    ["no idea", null, null],
  ])("parses %s", (text, amount, currency) => {
    expect(parseBudgetInput(text)).toEqual({ amount, currency });
  });
});

describe("tripDayCount", () => {
  it("counts both the first and last day", () => {
    expect(tripDayCount("2026-03-15", "2026-03-17")).toBe(3);
    expect(tripDayCount("2026-03-15", "2026-03-15")).toBe(1);
    expect(tripDayCount("", "")).toBe(1);
  });
});

describe("assistant extractBudget", () => {
  it("reads anchored amounts with multipliers and keeps their currency", async () => {
    const { extractBudget } = await import("@/services/aiChat");
    expect(extractBudget("plan 5 days in Goa for 2 people, budget 50k")).toEqual({ amount: 50000, currency: null });
    expect(extractBudget("trip under ₹1.5 lakh")).toEqual({ amount: 150000, currency: "INR" });
    expect(extractBudget("I have $2000 to spend")).toEqual({ amount: 2000, currency: "USD" });
    // Day and people counts are not money.
    expect(extractBudget("5 days in Goa for 2 people")).toBeNull();
  });
});
