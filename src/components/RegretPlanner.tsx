import { useState } from "react";
import {
  Brain,
  Loader2,
  TrendingDown,
  Scale,
  Sparkles,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  MapPin,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { regretCounterfactual } from "@/services/aiPlanner";
import { formatCurrency } from "@/lib/currency";
import { errorMessage } from "@/lib/errors";
import { useGroupPreferences } from "@/hooks/useGroupPreferences";
import {
  computeGroupRegret,
  explainGroupRegret,
  explainMemberRegret,
  regretBand,
  type PlanRegret,
} from "@/lib/groupRegret";
import { verifyItinerary, type VerificationResult } from "@/lib/itineraryVerifier";

type Activity = {
  name: string;
  description: string;
  location_name: string;
  start_time: string;
  end_time: string;
  category: string;
  cost: number;
  estimated_steps: number;
  review_score: number;
  priority: number;
  notes: string;
};

type Plan = {
  variant: string;
  label: string;
  tagline: string;
  total_cost: number;
  activities: Activity[];
  daily_summary: string[];
  pros: string[];
  cons: string[];
};

type RegretData = {
  plans: Plan[];
  comparison_note: string;
};

/**
 * A plan plus everything computed locally about it. The regret figure and the
 * recommendation are derived from group preferences here in the client — they
 * are deliberately not asked of the model, which previously just echoed back
 * whatever constants the prompt told it to emit.
 */
type ScoredPlan = {
  plan: Plan;
  regret?: PlanRegret;
  verification: VerificationResult;
};

const VARIANT_CONFIG: Record<
  string,
  { icon: typeof TrendingDown; color: string; bg: string }
> = {
  budget: { icon: TrendingDown, color: "text-success", bg: "bg-success/10" },
  balanced: { icon: Scale, color: "text-primary", bg: "bg-primary/10" },
  experience: { icon: Sparkles, color: "text-warning", bg: "bg-warning/10" },
};

/**
 * Turns the group's highest-weighted categories into interest hints for the
 * generation prompt, so the candidate plans are drawn from what the group
 * actually said rather than a hardcoded list.
 */
function deriveInterests(members: { categoryWeights?: Record<string, number> }[]): string[] {
  const totals = new Map<string, number>();

  for (const member of members) {
    for (const [category, weight] of Object.entries(member.categoryWeights ?? {})) {
      totals.set(category, (totals.get(category) ?? 0) + weight);
    }
  }

  if (totals.size === 0) return ["culture", "food", "sightseeing"];

  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([category]) => category);
}

interface RegretPlannerProps {
  tripId: string;
  destination: string;
  days: number;
  budget: number;
  country?: string;
  activeItineraryId?: string;
  onPlanApplied: () => void;
}

export default function RegretPlanner({
  tripId,
  destination,
  days,
  budget,
  country,
  activeItineraryId,
  onPlanApplied,
}: RegretPlannerProps) {
  const [data, setData] = useState<RegretData | null>(null);
  const [scored, setScored] = useState<ScoredPlan[]>([]);
  const [recommended, setRecommended] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<string>("balanced");
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Real trip membership and stated preferences, replacing the previous
  // hardcoded `travelers: 2` and fixed interest list.
  const { members, memberCount, usedFallback } = useGroupPreferences(tripId);

  const generatePlans = async () => {
    setLoading(true);
    setData(null);
    setScored([]);
    setRecommended(null);

    try {
      const interests = deriveInterests(members);

      const res = (await regretCounterfactual({
        destination,
        days,
        travelers: Math.max(1, memberCount),
        budget,
        interests,
        tripType: "leisure",
      })) as RegretData;

      const plans = res?.plans ?? [];
      if (plans.length === 0) throw new Error("The planner returned no plans.");

      // Verify every plan locally before it is shown. Grammar-constrained JSON
      // guarantees shape, not feasibility.
      const verifications = plans.map((plan) =>
        verifyItinerary(
          { activities: plan.activities, total_cost: plan.total_cost },
          {
            budget,
            days,
            maxActivitiesPerDay: 6,
          },
        ),
      );

      // Score against real member preferences. With no members loaded there is
      // nothing to compute, so regret is left undefined rather than invented.
      const regretResult =
        members.length > 0
          ? computeGroupRegret(
              plans.map((p) => ({
                variant: p.variant,
                activities: p.activities,
                total_cost: p.total_cost,
              })),
              members,
            )
          : null;

      const next: ScoredPlan[] = plans.map((plan, i) => ({
        plan,
        regret: regretResult?.plans.find((r) => r.variant === plan.variant),
        verification: verifications[i],
      }));

      // Prefer a plan that passes verification; fall back to lowest regret.
      const feasible = next.filter((s) => s.verification.ok);
      const pool = feasible.length > 0 ? feasible : next;
      const pick =
        regretResult && pool.some((s) => s.regret)
          ? [...pool].sort(
              (a, b) =>
                (a.regret?.groupRegret ?? 1) - (b.regret?.groupRegret ?? 1),
            )[0].plan.variant
          : pool[0].plan.variant;

      setData(res);
      setScored(next);
      setRecommended(pick);
      setSelectedVariant(pick);

      const blocked = next.filter((s) => !s.verification.ok).length;
      toast({
        title: `${plans.length} plans generated`,
        description: blocked
          ? `${blocked} of ${plans.length} failed feasibility checks — see the warnings on each plan.`
          : regretResult
            ? `Scored against ${memberCount} traveller${memberCount === 1 ? "" : "s"}. All plans passed feasibility checks.`
            : "All plans passed feasibility checks.",
      });
    } catch (error: unknown) {
      toast({
        title: "Generation failed",
        description: errorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const applyPlan = async (plan: Plan) => {
    if (!user) return;
    setApplying(true);
    try {
      let itineraryId = activeItineraryId;

      if (!itineraryId) {
        // Create a new itinerary for this trip
        const { data: newIt, error: itErr } = await supabase
          .from("itineraries")
          .insert({
            trip_id: tripId,
            created_by: user.id,
            version: 1,
            variant_id: plan.variant,
          })
          .select("id")
          .single();
        if (itErr) throw itErr;
        itineraryId = newIt.id;
      } else {
        // Update existing itinerary's variant
        await supabase
          .from("itineraries")
          .update({ variant_id: plan.variant })
          .eq("id", itineraryId);
      }

      if (!itineraryId) throw new Error("Could not create or find itinerary.");

      // Clear old activities on this itinerary
      const { error: delErr } = await supabase
        .from("activities")
        .delete()
        .eq("itinerary_id", itineraryId);
      if (delErr) throw delErr;

      // Insert plan activities
      const activitiesToInsert = plan.activities.map((a) => ({
        itinerary_id: itineraryId as string,
        name: a.name,
        description: a.description ?? null,
        location_name: a.location_name ?? null,
        start_time: a.start_time,
        end_time: a.end_time,
        category: a.category ?? "attraction",
        cost: a.cost ?? 0,
        estimated_steps: a.estimated_steps ?? null,
        review_score: a.review_score ?? null,
        priority: a.priority ?? null,
        notes: a.notes ?? null,
        status: "pending",
      }));

      if (activitiesToInsert.length > 0) {
        const { error: actErr } = await supabase
          .from("activities")
          .insert(activitiesToInsert);
        if (actErr) throw actErr;
      }

      // Update itinerary metadata
      const { error: updErr } = await supabase
        .from("itineraries")
        .update({
          cost_breakdown: {
            total: plan.total_cost,
            variant: plan.variant,
          } as never,
          // Persist the locally computed Least Misery score, not a model output.
          regret_score:
            scored.find((s) => s.plan.variant === plan.variant)?.regret
              ?.groupRegret ?? null,
          variant_id: plan.variant,
        })
        .eq("id", itineraryId);
      if (updErr) throw updErr;

      queryClient.invalidateQueries({ queryKey: ["itineraries", tripId] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      toast({
        title: `${plan.label} plan applied! ✅`,
        description: `${activitiesToInsert.length} activities saved to your itinerary.`,
      });
      onPlanApplied();
    } catch (error: unknown) {
      toast({
        title: "Failed to apply plan",
        description: errorMessage(error),
        variant: "destructive",
      });
    } finally {
      setApplying(false);
    }
  };

  if (!data) {
    return (
      <div className="bg-card rounded-2xl p-5 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-card-foreground flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              Group Trade-off Planner
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Generates three alternatives, checks each for feasibility, and scores
              them against every traveller&apos;s stated preferences.
            </p>
          </div>
        </div>

        {memberCount > 0 ? (
          <p className="text-xs text-muted-foreground mb-3">
            Scoring against{" "}
            <span className="font-semibold text-card-foreground">
              {memberCount} traveller{memberCount === 1 ? "" : "s"}
            </span>{" "}
            on this trip.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mb-3 flex items-start gap-1.5">
            <AlertTriangle className="w-3 h-3 text-warning shrink-0 mt-0.5" />
            {usedFallback
              ? "Couldn't load trip members, so plans will be checked for feasibility but not scored for fairness."
              : "No trip members found yet — add travellers to get per-person trade-off scores."}
          </p>
        )}

        <button
          onClick={generatePlans}
          disabled={loading}
          className="w-full px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating and checking 3 plans...
            </>
          ) : (
            <>
              <Brain className="w-4 h-4" />
              Generate Alternative Plans
            </>
          )}
        </button>
      </div>
    );
  }

  const selected = scored.find((s) => s.plan.variant === selectedVariant);
  const selectedPlan = selected?.plan;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-card rounded-2xl p-5 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-card-foreground flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              Group Trade-off Planner
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data.comparison_note}
            </p>
          </div>
          <button
            onClick={generatePlans}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors"
          >
            Regenerate
          </button>
        </div>

        {/* Plan Selector Tabs */}
        <div className="grid grid-cols-3 gap-2">
          {scored.map(({ plan, regret, verification }) => {
            const config =
              VARIANT_CONFIG[plan.variant] || VARIANT_CONFIG.balanced;
            const Icon = config.icon;
            const isSelected = selectedVariant === plan.variant;
            const isRecommended = recommended === plan.variant;

            return (
              <button
                key={plan.variant}
                onClick={() => setSelectedVariant(plan.variant)}
                className={`relative p-3 rounded-xl border-2 text-left transition-all ${
                  isSelected
                    ? `border-primary ${config.bg}`
                    : "border-border hover:border-primary/30 bg-background"
                }`}
              >
                {isRecommended && (
                  <span className="absolute -top-2 right-2 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold">
                    BEST FIT
                  </span>
                )}
                {!verification.ok && (
                  <span
                    className="absolute -top-2 left-2 px-1.5 py-0.5 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold"
                    title={verification.summary}
                  >
                    {verification.errors.length} ISSUE
                    {verification.errors.length === 1 ? "" : "S"}
                  </span>
                )}
                <Icon className={`w-5 h-5 mb-1 ${config.color}`} />
                <p
                  className={`text-sm font-semibold ${isSelected ? "text-primary" : "text-card-foreground"}`}
                >
                  {plan.label}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {plan.tagline}
                </p>
                <p className={`text-lg font-bold mt-1 ${config.color}`}>
                  {formatCurrency(plan.total_cost, country)}
                </p>
                {regret && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    worst-case gap {(regret.groupRegret * 100).toFixed(0)}%
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Plan Detail */}
      {selectedPlan && selected && (
        <div className="bg-card rounded-2xl p-5 shadow-card space-y-4 animate-fade-in">
          {/* Feasibility — deterministic checks, no model involved */}
          <div>
            <h4 className="text-sm font-semibold text-card-foreground mb-2 flex items-center gap-1.5">
              {selected.verification.ok ? (
                <Check className="w-4 h-4 text-success" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-destructive" />
              )}
              Feasibility check
            </h4>
            {selected.verification.ok &&
            selected.verification.warnings.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Budget, timing, travel distances and pace all check out.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {selected.verification.errors.map((v, i) => (
                  <li
                    key={`e-${i}`}
                    className="text-xs text-destructive flex items-start gap-1.5"
                  >
                    <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                    {v.message}
                  </li>
                ))}
                {selected.verification.warnings.map((v, i) => (
                  <li
                    key={`w-${i}`}
                    className="text-xs text-warning flex items-start gap-1.5"
                  >
                    <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                    {v.message}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Per-member trade-offs — computed via Least Misery */}
          {selected.regret ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
                <Scale className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-card-foreground">
                    Worst-case trade-off:{" "}
                    {(selected.regret.groupRegret * 100).toFixed(0)}%
                    <span className="ml-2 text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                      {regretBand(selected.regret.groupRegret)}
                    </span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {explainGroupRegret(selected.regret)}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-card-foreground">
                  Per traveller
                </p>
                {selected.regret.members.map((m) => (
                  <div
                    key={m.memberId}
                    className="flex items-center gap-2 text-xs"
                  >
                    <div className="h-1.5 flex-1 rounded-full bg-secondary overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          m.regret < 0.15
                            ? "bg-success"
                            : m.regret < 0.35
                              ? "bg-warning"
                              : "bg-destructive"
                        }`}
                        style={{ width: `${Math.max(2, m.regret * 100)}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground shrink-0">
                      {explainMemberRegret(m)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Scored by minimising the worst-off traveller&apos;s shortfall
                (Least Misery) over each person&apos;s stated preferences.
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground flex items-start gap-1.5 p-3 rounded-xl bg-secondary/40">
              <AlertTriangle className="w-3 h-3 text-warning shrink-0 mt-0.5" />
              No traveller preferences available, so fairness was not scored.
              Plans above were still checked for feasibility.
            </p>
          )}

          {/* Pros & Cons */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-success">Pros</p>
              {selectedPlan.pros?.map((pro, i) => (
                <p
                  key={i}
                  className="text-xs text-muted-foreground flex items-start gap-1"
                >
                  <Check className="w-3 h-3 text-success shrink-0 mt-0.5" />
                  {pro}
                </p>
              ))}
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-destructive">Cons</p>
              {selectedPlan.cons?.map((con, i) => (
                <p
                  key={i}
                  className="text-xs text-muted-foreground flex items-start gap-1"
                >
                  <AlertTriangle className="w-3 h-3 text-destructive shrink-0 mt-0.5" />
                  {con}
                </p>
              ))}
            </div>
          </div>

          {/* Daily Summary */}
          {selectedPlan.daily_summary &&
            selectedPlan.daily_summary.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-card-foreground mb-2">
                  Daily Overview
                </p>
                <div className="space-y-1">
                  {selectedPlan.daily_summary.map((summary, i) => (
                    <p
                      key={i}
                      className="text-xs text-muted-foreground bg-secondary/50 px-3 py-1.5 rounded-lg"
                    >
                      {summary}
                    </p>
                  ))}
                </div>
              </div>
            )}

          {/* Activities Preview */}
          <div>
            <button
              onClick={() =>
                setExpandedPlan(
                  expandedPlan === selectedVariant ? null : selectedVariant,
                )
              }
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              {expandedPlan === selectedVariant ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
              {expandedPlan === selectedVariant ? "Hide" : "Show"}{" "}
              {selectedPlan.activities?.length || 0} Activities
            </button>

            {expandedPlan === selectedVariant && (
              <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
                {selectedPlan.activities?.map((a, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 p-2 rounded-lg bg-secondary/30 text-xs"
                  >
                    <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <MapPin className="w-3 h-3 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-card-foreground truncate">
                        {a.name}
                      </p>
                      <div className="flex items-center gap-2 text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(a.start_time).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {a.cost > 0 && (
                          <span className="flex items-center gap-0.5">
                            {formatCurrency(a.cost, country)}
                          </span>
                        )}
                        {a.review_score && (
                          <span className="text-warning">
                            ★ {a.review_score}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Apply Button */}
          <button
            onClick={() => applyPlan(selectedPlan)}
            disabled={applying}
            className="w-full px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
          >
            {applying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Applying {selectedPlan.label} plan...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Apply {selectedPlan.label} Plan
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
