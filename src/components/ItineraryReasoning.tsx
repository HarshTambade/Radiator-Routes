import { useState } from "react";
import {
  Brain,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  TrendingDown,
  Clock,
  Star,
  Target,
  MapPin,
  Wallet,
  Sparkles,
  CheckCircle2,
  Info,
  Zap,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ItineraryReasoning {
  plan_title?: string;
  selection_summary?: string;
  why_these_activities?: string;
  budget_strategy?: string;
  cost_highlights?: string[];
  best_value_picks?: string[];
  time_optimization?: string;
  traveler_fit?: string;
  local_tips?: string[];
  potential_savings?: string[];
  selection_criteria?: Array<{
    criterion: string;
    reason: string;
    icon: string;
  }>;
}

interface ItineraryReasoningProps {
  reasoning: ItineraryReasoning;
  totalCost?: number;
  budget?: number;
  destination?: string;
  explanation?: string;
}

// ── Helper sub-components ─────────────────────────────────────────────────────

function Section({
  icon,
  title,
  children,
  accent = "primary",
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  accent?: "primary" | "green" | "yellow" | "blue" | "purple";
}) {
  const colors: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    green: "text-green-600 bg-green-500/10",
    yellow: "text-yellow-600 bg-yellow-500/10",
    blue: "text-blue-600 bg-blue-500/10",
    purple: "text-purple-600 bg-purple-500/10",
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className={`p-1.5 rounded-lg ${colors[accent]}`}>{icon}</div>
        <h4 className="text-xs font-semibold text-card-foreground">{title}</h4>
      </div>
      {children}
    </div>
  );
}

function BulletList({
  items,
  color = "primary",
}: {
  items: string[];
  color?: string;
}) {
  const dotColors: Record<string, string> = {
    primary: "bg-primary",
    green: "bg-green-500",
    yellow: "bg-yellow-500",
    blue: "bg-blue-500",
    purple: "bg-purple-500",
  };
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
          <span
            className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${dotColors[color] ?? "bg-primary"}`}
          />
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function BudgetBar({ spent, total }: { spent: number; total: number }) {
  const pct = Math.min(100, total > 0 ? Math.round((spent / total) * 100) : 0);
  const isOver = spent > total;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Budget utilization</span>
        <span className={`font-bold ${isOver ? "text-red-500" : "text-green-600"}`}>
          {pct}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${isOver ? "bg-red-500" : pct > 85 ? "bg-yellow-500" : "bg-green-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>₹{spent.toLocaleString("en-IN")} planned</span>
        <span>₹{total.toLocaleString("en-IN")} budget</span>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ItineraryReasoningPanel({
  reasoning,
  totalCost,
  budget,
  destination,
  explanation,
}: ItineraryReasoningProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<"why" | "budget" | "tips">("why");

  if (!reasoning || Object.keys(reasoning).length === 0) return null;

  const hasContent =
    reasoning.selection_summary ||
    reasoning.why_these_activities ||
    reasoning.budget_strategy ||
    (reasoning.selection_criteria?.length ?? 0) > 0 ||
    (reasoning.local_tips?.length ?? 0) > 0;

  if (!hasContent) return null;

  return (
    <div className="bg-card rounded-2xl shadow-card overflow-hidden border border-primary/10">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 border-b border-border cursor-pointer bg-gradient-to-r from-primary/5 to-transparent"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-card-foreground text-sm flex items-center gap-2">
              {reasoning.plan_title ? (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  {reasoning.plan_title}
                </>
              ) : (
                "Why AI Chose This Plan"
              )}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              AI reasoning · {destination ?? "your destination"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalCost != null && budget != null && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                totalCost <= budget
                  ? "bg-green-500/10 text-green-600 border border-green-500/20"
                  : "bg-red-500/10 text-red-600 border border-red-500/20"
              }`}
            >
              {totalCost <= budget ? "✓ In budget" : "⚠ Over budget"}
            </span>
          )}
          {collapsed ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="p-4 space-y-4">
          {/* Quick explanation banner */}
          {(reasoning.selection_summary || explanation) && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-primary/5 border border-primary/15">
              <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                {reasoning.selection_summary || explanation}
              </p>
            </div>
          )}

          {/* Budget bar */}
          {totalCost != null && budget != null && budget > 0 && (
            <BudgetBar spent={totalCost} total={budget} />
          )}

          {/* Tab navigation */}
          <div className="flex gap-1 p-1 bg-secondary rounded-xl">
            {(
              [
                { id: "why", label: "Why This Plan", icon: Target },
                { id: "budget", label: "Budget Logic", icon: Wallet },
                { id: "tips", label: "Insider Tips", icon: Lightbulb },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold transition-all ${
                  activeTab === id
                    ? "bg-card text-card-foreground shadow-sm"
                    : "text-muted-foreground hover:text-card-foreground"
                }`}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="space-y-4 animate-fade-in">
            {/* WHY THIS PLAN tab */}
            {activeTab === "why" && (
              <div className="space-y-4">
                {/* Selection criteria */}
                {reasoning.selection_criteria &&
                  reasoning.selection_criteria.length > 0 && (
                    <Section
                      icon={<Target className="w-3.5 h-3.5" />}
                      title="Selection Criteria"
                      accent="primary"
                    >
                      <div className="grid gap-2">
                        {reasoning.selection_criteria.map((c, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-2.5 p-2.5 rounded-xl bg-secondary/40 border border-border hover:bg-secondary/60 transition-colors"
                          >
                            <span className="text-base leading-none mt-0.5 shrink-0">
                              {c.icon}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-semibold text-card-foreground">
                                {c.criterion}
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                                {c.reason}
                              </p>
                            </div>
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                {/* Why these activities */}
                {reasoning.why_these_activities && (
                  <Section
                    icon={<MapPin className="w-3.5 h-3.5" />}
                    title="Activity Selection Logic"
                    accent="blue"
                  >
                    <p className="text-xs text-muted-foreground leading-relaxed bg-blue-500/5 border border-blue-500/15 rounded-xl p-3">
                      {reasoning.why_these_activities}
                    </p>
                  </Section>
                )}

                {/* Best value picks */}
                {reasoning.best_value_picks &&
                  reasoning.best_value_picks.length > 0 && (
                    <Section
                      icon={<Star className="w-3.5 h-3.5" />}
                      title="Best Value Picks"
                      accent="yellow"
                    >
                      <div className="flex flex-wrap gap-1.5">
                        {reasoning.best_value_picks.map((pick, i) => (
                          <span
                            key={i}
                            className="px-2.5 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/25 text-[11px] font-medium text-yellow-700 flex items-center gap-1"
                          >
                            <Star className="w-2.5 h-2.5" />
                            {pick}
                          </span>
                        ))}
                      </div>
                    </Section>
                  )}

                {/* Time optimization */}
                {reasoning.time_optimization && (
                  <Section
                    icon={<Clock className="w-3.5 h-3.5" />}
                    title="Time & Route Optimization"
                    accent="purple"
                  >
                    <p className="text-xs text-muted-foreground leading-relaxed bg-purple-500/5 border border-purple-500/15 rounded-xl p-3">
                      {reasoning.time_optimization}
                    </p>
                  </Section>
                )}

                {/* Traveler fit */}
                {reasoning.traveler_fit && (
                  <Section
                    icon={<Zap className="w-3.5 h-3.5" />}
                    title="Why This Fits You"
                    accent="green"
                  >
                    <p className="text-xs text-muted-foreground leading-relaxed bg-green-500/5 border border-green-500/15 rounded-xl p-3">
                      {reasoning.traveler_fit}
                    </p>
                  </Section>
                )}
              </div>
            )}

            {/* BUDGET LOGIC tab */}
            {activeTab === "budget" && (
              <div className="space-y-4">
                {/* Budget strategy */}
                {reasoning.budget_strategy && (
                  <Section
                    icon={<Wallet className="w-3.5 h-3.5" />}
                    title="Budget Allocation Strategy"
                    accent="green"
                  >
                    <p className="text-xs text-muted-foreground leading-relaxed bg-green-500/5 border border-green-500/15 rounded-xl p-3">
                      {reasoning.budget_strategy}
                    </p>
                  </Section>
                )}

                {/* Cost highlights */}
                {reasoning.cost_highlights &&
                  reasoning.cost_highlights.length > 0 && (
                    <Section
                      icon={<TrendingDown className="w-3.5 h-3.5" />}
                      title="Cost Highlights"
                      accent="green"
                    >
                      <BulletList items={reasoning.cost_highlights} color="green" />
                    </Section>
                  )}

                {/* Potential savings */}
                {reasoning.potential_savings &&
                  reasoning.potential_savings.length > 0 && (
                    <Section
                      icon={<TrendingDown className="w-3.5 h-3.5" />}
                      title="Potential Savings"
                      accent="yellow"
                    >
                      <div className="space-y-2">
                        {reasoning.potential_savings.map((saving, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-2 p-2.5 rounded-xl bg-yellow-500/5 border border-yellow-500/20"
                          >
                            <span className="text-yellow-500 text-sm mt-0.5 shrink-0">
                              💰
                            </span>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {saving}
                            </p>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                {/* Budget summary cards */}
                {totalCost != null && budget != null && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
                      <p className="text-[10px] text-muted-foreground">
                        Planned Cost
                      </p>
                      <p className="text-base font-bold text-green-600 mt-0.5">
                        ₹{totalCost.toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-secondary border border-border text-center">
                      <p className="text-[10px] text-muted-foreground">
                        Remaining
                      </p>
                      <p
                        className={`text-base font-bold mt-0.5 ${budget - totalCost >= 0 ? "text-card-foreground" : "text-red-500"}`}
                      >
                        ₹{Math.abs(budget - totalCost).toLocaleString("en-IN")}
                        {budget - totalCost < 0 ? " over" : " left"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* INSIDER TIPS tab */}
            {activeTab === "tips" && (
              <div className="space-y-4">
                {reasoning.local_tips && reasoning.local_tips.length > 0 && (
                  <Section
                    icon={<Lightbulb className="w-3.5 h-3.5" />}
                    title="Local Insider Tips"
                    accent="yellow"
                  >
                    <div className="space-y-2">
                      {reasoning.local_tips.map((tip, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2.5 p-2.5 rounded-xl bg-yellow-500/5 border border-yellow-500/20 hover:bg-yellow-500/10 transition-colors"
                        >
                          <span className="text-base shrink-0 mt-0.5">
                            {i === 0
                              ? "🍽️"
                              : i === 1
                                ? "🚇"
                                : i === 2
                                  ? "🕐"
                                  : i === 3
                                    ? "🎟️"
                                    : "💡"}
                          </span>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {tip}
                          </p>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* If no tips available */}
                {(!reasoning.local_tips ||
                  reasoning.local_tips.length === 0) && (
                  <div className="flex flex-col items-center py-8 gap-2 text-center">
                    <Lightbulb className="w-8 h-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      No insider tips available for this plan.
                    </p>
                  </div>
                )}

                {/* General reminders */}
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/15">
                  <p className="text-[10px] font-semibold text-primary mb-2 flex items-center gap-1">
                    <Info className="w-3 h-3" /> General Reminders
                  </p>
                  <BulletList
                    items={[
                      "Book accommodations in advance for better rates",
                      "Check local festivals that may affect prices or availability",
                      "Download offline maps for areas with poor connectivity",
                      "Always carry some cash — not all places accept cards",
                    ]}
                    color="primary"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
