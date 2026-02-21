import { useState } from "react";
import {
  Wallet,
  Plus,
  Trash2,
  Users,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { formatCurrency, getCurrencySymbol } from "@/lib/currency";

interface Activity {
  id: string;
  name: string;
  cost?: number | null;
  category?: string | null;
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  paidBy: string;
  category: string;
  splitAmong: string[];
}

interface Props {
  activities: Activity[];
  tripBudget: number;
  country?: string | null;
  travelers?: number;
  memberNames?: string[];
}

const EXPENSE_CATEGORIES = [
  { value: "food", label: "🍽️ Food & Dining", color: "bg-warning/10 text-warning" },
  { value: "transport", label: "🚌 Transport", color: "bg-success/10 text-success" },
  { value: "attraction", label: "🎡 Attractions", color: "bg-accent/10 text-accent" },
  { value: "accommodation", label: "🏨 Accommodation", color: "bg-primary/10 text-primary" },
  { value: "shopping", label: "🛍️ Shopping", color: "bg-pink-500/10 text-pink-500" },
  { value: "other", label: "📎 Other", color: "bg-secondary text-muted-foreground" },
];

export default function TripMoneyExpenses({
  activities,
  tripBudget,
  country,
  travelers = 1,
  memberNames = [],
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [newExpense, setNewExpense] = useState({
    description: "",
    amount: "",
    paidBy: memberNames[0] || "Me",
    category: "food",
    splitAmong: memberNames.length > 0 ? memberNames : ["Me"],
  });

  const currencySymbol = getCurrencySymbol(country);

  // ── Compute stats from activities ────────────────────────────────────────
  const activityCosts = activities
    .filter((a) => a.cost != null && Number(a.cost) > 0)
    .map((a) => ({ name: a.name, cost: Number(a.cost), category: a.category || "other" }));

  const totalActivityCost = activityCosts.reduce((s, a) => s + a.cost, 0);
  const totalManualExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalSpent = totalActivityCost + totalManualExpenses;
  const remaining = tripBudget - totalSpent;
  const budgetPercent = tripBudget > 0 ? Math.min(100, (totalSpent / tripBudget) * 100) : 0;
  const perPerson = travelers > 0 ? totalSpent / travelers : totalSpent;

  // Cost breakdown by category
  const categoryBreakdown: Record<string, number> = {};
  activityCosts.forEach((a) => {
    categoryBreakdown[a.category] = (categoryBreakdown[a.category] || 0) + a.cost;
  });
  expenses.forEach((e) => {
    categoryBreakdown[e.category] = (categoryBreakdown[e.category] || 0) + e.amount;
  });

  // ── Debt calculation (who owes whom) ─────────────────────────────────────
  const memberBalances: Record<string, number> = {};
  const allMembers =
    memberNames.length > 0
      ? memberNames
      : ["Me"];

  allMembers.forEach((m) => (memberBalances[m] = 0));

  expenses.forEach((exp) => {
    const share = exp.amount / (exp.splitAmong.length || 1);
    // paidBy gets credit
    memberBalances[exp.paidBy] =
      (memberBalances[exp.paidBy] || 0) + exp.amount;
    // each member in splitAmong owes their share
    exp.splitAmong.forEach((m) => {
      memberBalances[m] = (memberBalances[m] || 0) - share;
    });
  });

  // Simplify debts
  const settlements: { from: string; to: string; amount: number }[] = [];
  const debtors = allMembers.filter((m) => memberBalances[m] < -0.01);
  const creditors = allMembers.filter((m) => memberBalances[m] > 0.01);

  const debtsCopy = { ...memberBalances };
  for (const debtor of debtors) {
    for (const creditor of creditors) {
      if (debtsCopy[debtor] >= -0.01) break;
      if (debtsCopy[creditor] <= 0.01) continue;
      const transfer = Math.min(-debtsCopy[debtor], debtsCopy[creditor]);
      settlements.push({
        from: debtor,
        to: creditor,
        amount: Math.round(transfer * 100) / 100,
      });
      debtsCopy[debtor] += transfer;
      debtsCopy[creditor] -= transfer;
    }
  }

  const handleAddExpense = () => {
    if (!newExpense.description.trim() || !newExpense.amount) return;
    const expense: Expense = {
      id: Date.now().toString(),
      description: newExpense.description.trim(),
      amount: Number(newExpense.amount),
      paidBy: newExpense.paidBy || "Me",
      category: newExpense.category,
      splitAmong:
        newExpense.splitAmong.length > 0 ? newExpense.splitAmong : ["Me"],
    };
    setExpenses((prev) => [...prev, expense]);
    setNewExpense({
      description: "",
      amount: "",
      paidBy: memberNames[0] || "Me",
      category: "food",
      splitAmong: memberNames.length > 0 ? memberNames : ["Me"],
    });
    setShowAddExpense(false);
  };

  const getCategoryColor = (cat: string) =>
    EXPENSE_CATEGORIES.find((c) => c.value === cat)?.color ||
    "bg-secondary text-muted-foreground";

  return (
    <div className="bg-card rounded-2xl shadow-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 border-b border-border hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-card-foreground">
            Trip Money & Expense Split
          </span>
          {travelers > 1 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium flex items-center gap-1">
              <Users className="w-3 h-3" />
              {travelers} travelers
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`text-sm font-bold ${remaining >= 0 ? "text-success" : "text-destructive"}`}
          >
            {remaining >= 0 ? "+" : ""}
            {formatCurrency(remaining, country)} left
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="p-5 space-y-5">
          {/* Budget Bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">
                Budget Usage
              </span>
              <span className="text-xs font-semibold text-card-foreground">
                {formatCurrency(totalSpent, country)} /{" "}
                {formatCurrency(tripBudget, country)}
              </span>
            </div>
            <div className="w-full h-2.5 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  budgetPercent > 90
                    ? "bg-destructive"
                    : budgetPercent > 70
                      ? "bg-warning"
                      : "bg-success"
                }`}
                style={{ width: `${budgetPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-muted-foreground">
                {budgetPercent.toFixed(0)}% used
              </span>
              {travelers > 1 && (
                <span className="text-[10px] text-muted-foreground">
                  ≈ {formatCurrency(perPerson, country)} / person
                </span>
              )}
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-primary/5 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Total Spent</p>
              <p className="text-sm font-bold text-primary">
                {formatCurrency(totalSpent, country)}
              </p>
            </div>
            <div
              className={`rounded-xl p-3 text-center ${remaining >= 0 ? "bg-success/10" : "bg-destructive/10"}`}
            >
              <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                {remaining >= 0 ? (
                  <TrendingDown className="w-3 h-3 text-success" />
                ) : (
                  <TrendingUp className="w-3 h-3 text-destructive" />
                )}
                Remaining
              </p>
              <p
                className={`text-sm font-bold ${remaining >= 0 ? "text-success" : "text-destructive"}`}
              >
                {formatCurrency(Math.abs(remaining), country)}
                {remaining < 0 && " over"}
              </p>
            </div>
            <div className="bg-accent/10 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Per Person</p>
              <p className="text-sm font-bold text-accent">
                {formatCurrency(perPerson, country)}
              </p>
            </div>
          </div>

          {/* Category Breakdown */}
          {Object.keys(categoryBreakdown).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Breakdown by Category
              </p>
              <div className="space-y-2">
                {Object.entries(categoryBreakdown)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cat, amount]) => {
                    const pct =
                      totalSpent > 0
                        ? Math.round((amount / totalSpent) * 100)
                        : 0;
                    const catInfo = EXPENSE_CATEGORIES.find(
                      (c) => c.value === cat,
                    );
                    return (
                      <div key={cat} className="flex items-center gap-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${catInfo?.color || "bg-secondary text-muted-foreground"}`}
                        >
                          {catInfo?.label || cat}
                        </span>
                        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary/60 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-card-foreground shrink-0">
                          {formatCurrency(amount, country)}
                        </span>
                        <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">
                          {pct}%
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Manual Expenses */}
          {expenses.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Group Expenses
              </p>
              <div className="space-y-2">
                {expenses.map((exp) => (
                  <div
                    key={exp.id}
                    className="flex items-center gap-3 bg-secondary/40 rounded-xl px-3 py-2.5"
                  >
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${getCategoryColor(exp.category)}`}
                    >
                      {EXPENSE_CATEGORIES.find((c) => c.value === exp.category)
                        ?.label || exp.category}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-card-foreground truncate">
                        {exp.description}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Paid by <span className="font-semibold">{exp.paidBy}</span>
                        {exp.splitAmong.length > 1
                          ? ` · Split ${exp.splitAmong.length} ways`
                          : ""}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-card-foreground shrink-0">
                      {currencySymbol}
                      {exp.amount.toLocaleString()}
                    </span>
                    <button
                      onClick={() =>
                        setExpenses((prev) =>
                          prev.filter((e) => e.id !== exp.id),
                        )
                      }
                      className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Settlements */}
          {settlements.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Who Owes Whom
              </p>
              <div className="space-y-2">
                {settlements.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 bg-warning/5 border border-warning/20 rounded-xl px-3 py-2.5"
                  >
                    <Receipt className="w-4 h-4 text-warning shrink-0" />
                    <p className="text-sm flex-1 text-card-foreground">
                      <span className="font-semibold">{s.from}</span>
                      <span className="text-muted-foreground"> owes </span>
                      <span className="font-semibold">{s.to}</span>
                    </p>
                    <span className="text-sm font-bold text-warning shrink-0">
                      {formatCurrency(s.amount, country)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add Expense Form */}
          {showAddExpense && (
            <div className="border border-border rounded-xl p-4 space-y-3 bg-background animate-fade-in">
              <p className="text-sm font-semibold text-card-foreground">
                Add Group Expense
              </p>
              <input
                type="text"
                placeholder="Description (e.g., Dinner at Taj)"
                value={newExpense.description}
                onChange={(e) =>
                  setNewExpense((p) => ({ ...p, description: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    {currencySymbol}
                  </span>
                  <input
                    type="number"
                    placeholder="Amount"
                    value={newExpense.amount}
                    onChange={(e) =>
                      setNewExpense((p) => ({ ...p, amount: e.target.value }))
                    }
                    className="w-full pl-7 pr-3 py-2 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <select
                  value={newExpense.category}
                  onChange={(e) =>
                    setNewExpense((p) => ({ ...p, category: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              {memberNames.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Paid by
                    </label>
                    <select
                      value={newExpense.paidBy}
                      onChange={(e) =>
                        setNewExpense((p) => ({ ...p, paidBy: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {memberNames.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Split between
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {memberNames.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() =>
                            setNewExpense((p) => ({
                              ...p,
                              splitAmong: p.splitAmong.includes(m)
                                ? p.splitAmong.filter((x) => x !== m)
                                : [...p.splitAmong, m],
                            }))
                          }
                          className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                            newExpense.splitAmong.includes(m)
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleAddExpense}
                  disabled={!newExpense.description.trim() || !newExpense.amount}
                  className="flex-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
                >
                  <DollarSign className="w-4 h-4" />
                  Add Expense
                </button>
                <button
                  onClick={() => setShowAddExpense(false)}
                  className="px-4 py-2 rounded-xl bg-secondary text-muted-foreground text-sm hover:bg-secondary/80 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Add Expense Button */}
          {!showAddExpense && (
            <button
              onClick={() => setShowAddExpense(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Group Expense
            </button>
          )}
        </div>
      )}
    </div>
  );
}
