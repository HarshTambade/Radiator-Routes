import { useMemo, useState } from "react";
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
  CloudOff,
  Info,
  Loader2,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/errors";
import { formatCurrency, getCurrencySymbol } from "@/lib/currency";
import { mutateWithOfflineQueue, newId } from "@/lib/offlineMutation";

/**
 * Trip budget view plus group expense splitting.
 *
 * Expenses used to live in `useState` alone — they were never persisted, so they
 * disappeared on reload and were invisible to everyone else on the trip. They now
 * write to `group_expenses`, and the write goes through the offline queue because
 * splitting a bill is something people do at the table, on hotel wifi or no wifi
 * at all.
 *
 * Two constraints from the schema shape this UI rather than being worked around:
 *
 *   • RLS on `group_expenses` requires `paid_by = auth.uid()`. You can only
 *     record what you paid. The old picker let you attribute a payment to any
 *     member, which the database would have rejected.
 *   • `category` has a CHECK constraint. The old list offered "attraction",
 *     which is not in it; the allowed values are used directly here instead.
 */

interface Activity {
  id: string;
  name: string;
  cost?: number | null;
  category?: string | null;
}

export interface TripMember {
  id: string;
  name: string;
}

/** A `group_expenses` row, narrowed to what this component reads. */
interface ExpenseRow {
  id: string;
  paid_by: string;
  title: string;
  amount: number;
  category: string;
  split_with: string[];
}

interface Props {
  tripId: string;
  activities: Activity[];
  tripBudget: number;
  country?: string | null;
  travelers?: number;
  /** Trip members with ids — `split_with` and `paid_by` are user UUIDs. */
  members?: TripMember[];
}

/**
 * Categories, matching the `group_expenses.category` CHECK constraint exactly.
 * A value outside this set fails the insert.
 */
const EXPENSE_CATEGORIES = [
  { value: "food", label: "🍽️ Food & Dining", color: "bg-warning/10 text-warning" },
  { value: "transport", label: "🚌 Transport", color: "bg-success/10 text-success" },
  { value: "activity", label: "🎡 Activities", color: "bg-accent/10 text-accent" },
  {
    value: "accommodation",
    label: "🏨 Accommodation",
    color: "bg-primary/10 text-primary",
  },
  { value: "shopping", label: "🛍️ Shopping", color: "bg-pink-500/10 text-pink-500" },
  { value: "general", label: "📎 General", color: "bg-secondary text-muted-foreground" },
] as const;

/** Activity categories the planner emits, mapped onto expense categories. */
const ACTIVITY_TO_EXPENSE_CATEGORY: Record<string, string> = {
  food: "food",
  transport: "transport",
  attraction: "activity",
  entertainment: "activity",
  accommodation: "accommodation",
  shopping: "shopping",
  other: "general",
};

export default function TripMoneyExpenses({
  tripId,
  activities,
  tripBudget,
  country,
  travelers = 1,
  members = [],
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [expanded, setExpanded] = useState(true);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newExpense, setNewExpense] = useState({
    description: "",
    amount: "",
    category: "food",
    splitAmong: [] as string[],
  });

  const currencySymbol = getCurrencySymbol(country);

  // Members always include the current user: a solo trip has no membership rows
  // yet, and `paid_by` still has to be a real profile id.
  const roster = useMemo<TripMember[]>(() => {
    const seen = new Map<string, TripMember>();
    if (user) seen.set(user.id, { id: user.id, name: "You" });
    for (const member of members) {
      seen.set(member.id, {
        id: member.id,
        name: member.id === user?.id ? "You" : member.name,
      });
    }
    return [...seen.values()];
  }, [members, user]);

  const nameFor = (id: string) =>
    roster.find((m) => m.id === id)?.name ?? "Traveller";

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["group-expenses", tripId],
    queryFn: async (): Promise<ExpenseRow[]> => {
      const { data, error } = await supabase
        .from("group_expenses")
        .select("id, paid_by, title, amount, category, split_with")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ExpenseRow[];
    },
    enabled: !!tripId,
    // Matches the offline-first query options used for trips: stale data beats
    // no data when the network is gone.
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 60 * 24,
    retry: (failureCount: number) =>
      navigator.onLine ? failureCount < 2 : false,
  });

  // ── Compute stats from activities ────────────────────────────────────────
  const activityCosts = activities
    .filter((a) => a.cost != null && Number(a.cost) > 0)
    .map((a) => ({
      name: a.name,
      cost: Number(a.cost),
      category: ACTIVITY_TO_EXPENSE_CATEGORY[a.category ?? "other"] ?? "general",
    }));

  const totalActivityCost = activityCosts.reduce((s, a) => s + a.cost, 0);
  const totalManualExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalSpent = totalActivityCost + totalManualExpenses;
  const remaining = tripBudget - totalSpent;
  const budgetPercent =
    tripBudget > 0 ? Math.min(100, (totalSpent / tripBudget) * 100) : 0;
  const perPerson = travelers > 0 ? totalSpent / travelers : totalSpent;

  // Cost breakdown by category
  const categoryBreakdown: Record<string, number> = {};
  activityCosts.forEach((a) => {
    categoryBreakdown[a.category] = (categoryBreakdown[a.category] || 0) + a.cost;
  });
  expenses.forEach((e) => {
    categoryBreakdown[e.category] =
      (categoryBreakdown[e.category] || 0) + Number(e.amount);
  });

  // ── Debt calculation (who owes whom) ─────────────────────────────────────
  // Balances are keyed by user id, not display name: two members can share a
  // first name, and the database only knows about ids.
  const settlements = useMemo(() => {
    const balances: Record<string, number> = {};
    for (const member of roster) balances[member.id] = 0;

    for (const expense of expenses) {
      const participants =
        expense.split_with.length > 0 ? expense.split_with : [expense.paid_by];
      const share = Number(expense.amount) / participants.length;

      balances[expense.paid_by] =
        (balances[expense.paid_by] || 0) + Number(expense.amount);
      for (const memberId of participants) {
        balances[memberId] = (balances[memberId] || 0) - share;
      }
    }

    const ids = Object.keys(balances);
    const debtors = ids.filter((id) => balances[id] < -0.01);
    const creditors = ids.filter((id) => balances[id] > 0.01);
    const remainingBalances = { ...balances };
    const out: { from: string; to: string; amount: number }[] = [];

    for (const debtor of debtors) {
      for (const creditor of creditors) {
        if (remainingBalances[debtor] >= -0.01) break;
        if (remainingBalances[creditor] <= 0.01) continue;
        const transfer = Math.min(
          -remainingBalances[debtor],
          remainingBalances[creditor],
        );
        out.push({
          from: debtor,
          to: creditor,
          amount: Math.round(transfer * 100) / 100,
        });
        remainingBalances[debtor] += transfer;
        remainingBalances[creditor] -= transfer;
      }
    }

    return out;
  }, [expenses, roster]);

  const handleAddExpense = async () => {
    if (!user || !newExpense.description.trim() || !newExpense.amount) return;

    const amount = Number(newExpense.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: "Enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const splitWith =
        newExpense.splitAmong.length > 0
          ? newExpense.splitAmong
          : roster.map((m) => m.id);

      const row = {
        id: newId(),
        trip_id: tripId,
        // RLS requires this to be the authenticated user; the form does not
        // offer a choice for exactly that reason.
        paid_by: user.id,
        title: newExpense.description.trim(),
        amount,
        currency: "INR",
        category: newExpense.category,
        split_type: "equal",
        split_with: splitWith,
      };

      const result = await mutateWithOfflineQueue(
        async () => {
          const { error } = await supabase.from("group_expenses").insert(row);
          if (error) throw error;
        },
        {
          table: "group_expenses",
          action: "insert",
          payload: row,
          matchValue: row.id,
          description: `Add expense "${row.title}"`,
          invalidate: [["group-expenses", tripId]],
        },
      );

      // Show the new row immediately, whether it reached the server or the
      // queue. Without this the expense appears to have been dropped.
      queryClient.setQueryData<ExpenseRow[]>(
        ["group-expenses", tripId],
        (previous = []) => [
          ...previous,
          {
            id: row.id,
            paid_by: row.paid_by,
            title: row.title,
            amount: row.amount,
            category: row.category,
            split_with: row.split_with,
          },
        ],
      );

      setNewExpense({
        description: "",
        amount: "",
        category: "food",
        splitAmong: [],
      });
      setShowAddExpense(false);

      toast({
        title: result.queued ? "Expense saved offline" : "Expense added",
        description: result.queued
          ? "It will sync when you're back online."
          : undefined,
      });
    } catch (error: unknown) {
      toast({
        title: "Could not add expense",
        description: errorMessage(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExpense = async (expense: ExpenseRow) => {
    try {
      const result = await mutateWithOfflineQueue(
        async () => {
          const { error } = await supabase
            .from("group_expenses")
            .delete()
            .eq("id", expense.id);
          if (error) throw error;
        },
        {
          table: "group_expenses",
          action: "delete",
          payload: {},
          matchValue: expense.id,
          description: `Delete expense "${expense.title}"`,
          invalidate: [["group-expenses", tripId]],
        },
      );

      queryClient.setQueryData<ExpenseRow[]>(
        ["group-expenses", tripId],
        (previous = []) => previous.filter((e) => e.id !== expense.id),
      );

      if (result.queued) {
        toast({
          title: "Deletion saved offline",
          description: "It will sync when you're back online.",
        });
      }
    } catch (error: unknown) {
      toast({
        title: "Could not delete expense",
        description: errorMessage(error),
        variant: "destructive",
      });
    }
  };

  const getCategoryColor = (cat: string) =>
    EXPENSE_CATEGORIES.find((c) => c.value === cat)?.color ||
    "bg-secondary text-muted-foreground";

  const toggleSplitMember = (id: string) =>
    setNewExpense((p) => ({
      ...p,
      splitAmong: p.splitAmong.includes(id)
        ? p.splitAmong.filter((x) => x !== id)
        : [...p.splitAmong, id],
    }));

  return (
    <div className="bg-card rounded-2xl shadow-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 border-b border-border hover:bg-secondary/30 transition-colors"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-primary" aria-hidden="true" />
          <span className="text-sm font-semibold text-card-foreground">
            Trip Money & Expense Split
          </span>
          {travelers > 1 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium flex items-center gap-1">
              <Users className="w-3 h-3" aria-hidden="true" />
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
            <ChevronUp className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="p-5 space-y-5">
          {/* Budget Bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Budget Usage</span>
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
                  <TrendingDown className="w-3 h-3 text-success" aria-hidden="true" />
                ) : (
                  <TrendingUp className="w-3 h-3 text-destructive" aria-hidden="true" />
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
                      totalSpent > 0 ? Math.round((amount / totalSpent) * 100) : 0;
                    const catInfo = EXPENSE_CATEGORIES.find((c) => c.value === cat);
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

          {/* Group Expenses */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Group Expenses
            </p>
            {isLoading ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                Loading expenses…
              </p>
            ) : expenses.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nothing recorded yet. Add what you paid and it will be split with
                the group.
              </p>
            ) : (
              <div className="space-y-2">
                {expenses.map((exp) => {
                  const mine = exp.paid_by === user?.id;
                  return (
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
                          {exp.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Paid by{" "}
                          <span className="font-semibold">
                            {nameFor(exp.paid_by)}
                          </span>
                          {exp.split_with.length > 1
                            ? ` · Split ${exp.split_with.length} ways`
                            : ""}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-card-foreground shrink-0">
                        {currencySymbol}
                        {Number(exp.amount).toLocaleString()}
                      </span>
                      {/* Only the payer can delete: RLS enforces it, so hiding
                          the control avoids offering an action that would fail. */}
                      {mine && (
                        <button
                          onClick={() => handleDeleteExpense(exp)}
                          className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                          aria-label={`Delete expense ${exp.title}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

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
                    <Receipt className="w-4 h-4 text-warning shrink-0" aria-hidden="true" />
                    <p className="text-sm flex-1 text-card-foreground">
                      <span className="font-semibold">{nameFor(s.from)}</span>
                      <span className="text-muted-foreground"> owes </span>
                      <span className="font-semibold">{nameFor(s.to)}</span>
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
              <label htmlFor="expense-description" className="sr-only">
                Description
              </label>
              <input
                id="expense-description"
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
                  <span
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
                    aria-hidden="true"
                  >
                    {currencySymbol}
                  </span>
                  <label htmlFor="expense-amount" className="sr-only">
                    Amount
                  </label>
                  <input
                    id="expense-amount"
                    type="number"
                    min={0}
                    placeholder="Amount"
                    value={newExpense.amount}
                    onChange={(e) =>
                      setNewExpense((p) => ({ ...p, amount: e.target.value }))
                    }
                    className="w-full pl-7 pr-3 py-2 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label htmlFor="expense-category" className="sr-only">
                    Category
                  </label>
                  <select
                    id="expense-category"
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
              </div>

              {roster.length > 1 && (
                <fieldset>
                  <legend className="text-xs text-muted-foreground mb-1">
                    Split between
                  </legend>
                  <div className="flex flex-wrap gap-1">
                    {roster.map((member) => {
                      const selected = newExpense.splitAmong.includes(member.id);
                      return (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => toggleSplitMember(member.id)}
                          aria-pressed={selected}
                          className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                            selected
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {member.name}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Nothing selected splits it across everyone.
                  </p>
                </fieldset>
              )}

              <p className="text-[10px] text-muted-foreground flex items-start gap-1.5">
                <Info className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
                Recorded as paid by you — the database only accepts expenses under
                your own name.
              </p>

              <div className="flex gap-2">
                <button
                  onClick={handleAddExpense}
                  disabled={
                    saving || !newExpense.description.trim() || !newExpense.amount
                  }
                  className="flex-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <DollarSign className="w-4 h-4" aria-hidden="true" />
                  )}
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
              <Plus className="w-4 h-4" aria-hidden="true" />
              Add Group Expense
            </button>
          )}

          {!navigator.onLine && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
              <CloudOff className="w-3 h-3" aria-hidden="true" />
              Offline — expenses you add are queued and sync on reconnect.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
