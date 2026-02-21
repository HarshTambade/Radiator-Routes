import { useState } from "react";
import {
  Brain,
  Loader2,
  TrendingDown,
  Scale,
  Sparkles,
  AlertTriangle,
  Battery,
  Wallet,
  Star,
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
  fatigue_level: number;
  budget_overrun_risk: number;
  experience_quality: number;
  regret_score: number;
  activities: Activity[];
  daily_summary: string[];
  pros: string[];
  cons: string[];
};

type RegretData = {
  plans: Plan[];
  recommendation: string;
  comparison_note: string;
};

const VARIANT_CONFIG: Record<
  string,
  { icon: typeof TrendingDown; color: string; bg: string }
> = {
  budget: { icon: TrendingDown, color: "text-success", bg: "bg-success/10" },
  balanced: { icon: Scale, color: "text-primary", bg: "bg-primary/10" },
  experience: { icon: Sparkles, color: "text-warning", bg: "bg-warning/10" },
};

function RiskMeter({
  value,
  label,
  icon: Icon,
  color,
}: {
  value: number;
  label: string;
  icon: typeof Battery;
  color: string;
}) {
  const getLevel = (v: number) =>
    v < 35 ? "Low" : v < 65 ? "Moderate" : "High";
  const getBarColor = (v: number) =>
    v < 35 ? "bg-success" : v < 65 ? "bg-warning" : "bg-destructive";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Icon className={`w-3 h-3 ${color}`} />
          {label}
        </span>
        <span className="text-xs font-semibold text-card-foreground">
          {getLevel(value)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${getBarColor(value)}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground text-right">
        {value}/100
      </p>
    </div>
  );
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
  const [loading, setLoading] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<string>("balanced");
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const generatePlans = async () => {
    setLoading(true);
    setData(null);
    try {
      const res = (await regretCounterfactual({
        destination,
        days,
        travelers: 2,
        budget,
        interests: ["culture", "food", "sightseeing"],
        tripType: "leisure",
      })) as any;
      setData(res);
      setSelectedVariant(res.recommendation || "balanced");
      toast({
        title: "Plans generated! 🧠",
        description: "3 counterfactual alternatives ready for comparison.",
      });
    } catch (error: any) {
      toast({
        title: "Generation failed",
        description: error.message,
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
          } as any,
          regret_score: plan.regret_score,
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
    } catch (error: any) {
      toast({
        title: "Failed to apply plan",
        description: error.message,
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
              Regret-Aware Planning
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Compare 3 counterfactual alternatives with risk analysis
            </p>
          </div>
        </div>
        <button
          onClick={generatePlans}
          disabled={loading}
          className="w-full px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating 3 alternative plans...
            </>
          ) : (
            <>
              <Brain className="w-4 h-4" />
              Generate Counterfactual Plans
            </>
          )}
        </button>
      </div>
    );
  }

  const selectedPlan = data.plans.find((p) => p.variant === selectedVariant);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-card rounded-2xl p-5 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-card-foreground flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              Regret-Aware Counterfactual Plans
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
          {data.plans.map((plan) => {
            const config =
              VARIANT_CONFIG[plan.variant] || VARIANT_CONFIG.balanced;
            const Icon = config.icon;
            const isSelected = selectedVariant === plan.variant;
            const isRecommended = data.recommendation === plan.variant;

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
                    RECOMMENDED
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
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Plan Detail */}
      {selectedPlan && (
        <div className="bg-card rounded-2xl p-5 shadow-card space-y-4 animate-fade-in">
          {/* Risk Metrics */}
          <div>
            <h4 className="text-sm font-semibold text-card-foreground mb-3">
              Risk Analysis
            </h4>
            <div className="grid grid-cols-1 gap-3">
              <RiskMeter
                value={selectedPlan.fatigue_level}
                label="Fatigue Level"
                icon={Battery}
                color="text-warning"
              />
              <RiskMeter
                value={selectedPlan.budget_overrun_risk}
                label="Budget Overrun Risk"
                icon={Wallet}
                color="text-destructive"
              />
              <RiskMeter
                value={selectedPlan.experience_quality}
                label="Experience Quality"
                icon={Star}
                color="text-success"
              />
            </div>
          </div>

          {/* Regret Score */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
            <AlertTriangle className="w-5 h-5 text-primary shrink-0" />
            <div>
              <p className="text-sm font-semibold text-card-foreground">
                Regret Score: {selectedPlan.regret_score.toFixed(2)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {selectedPlan.regret_score < 0.3
                  ? "Low regret — you'll likely be happy with this choice"
                  : selectedPlan.regret_score < 0.6
                    ? "Moderate regret — some trade-offs to consider"
                    : "High regret risk — significant compromises in this plan"}
              </p>
            </div>
          </div>

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
