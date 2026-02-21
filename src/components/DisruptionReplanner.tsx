import { useState } from "react";
import {
  AlertTriangle,
  CloudRain,
  Plane,
  DoorClosed,
  Shield,
  Loader2,
  RefreshCw,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Zap,
  Clock,
  MapPin,
  IndianRupee,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import {
  detectDisruptions as detectDisruptionsService,
  autoReplan,
} from "@/services/dynamicReplan";

type Disruption = {
  type: string;
  severity: string;
  title: string;
  description: string;
  affected_activities: string[];
  time_window: string;
  confidence: number;
};

type DisruptionData = {
  disruptions: Disruption[];
  overall_risk: string;
  needs_replan: boolean;
};

type ReplanActivity = {
  name: string;
  description: string;
  location_name: string;
  location_lat?: number;
  location_lng?: number;
  start_time: string;
  end_time: string;
  category: string;
  cost: number;
  estimated_steps?: number;
  review_score?: number;
  priority?: number;
  notes: string;
  is_changed?: boolean;
};

type ReplanData = {
  activities: ReplanActivity[];
  total_cost: number;
  changes_summary: string;
  changes_count: number;
};

const DISRUPTION_ICONS: Record<string, typeof CloudRain> = {
  weather: CloudRain,
  flight_delay: Plane,
  venue_closed: DoorClosed,
  safety: Shield,
  transport: Plane,
};

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-success/10 text-success border-success/20",
  medium: "bg-warning/10 text-warning border-warning/20",
  high: "bg-destructive/10 text-destructive border-destructive/20",
  critical: "bg-destructive text-destructive-foreground border-destructive",
};

interface DisruptionReplannerProps {
  tripId: string;
  activeItineraryId?: string;
  onReplanApplied: () => void;
}

export default function DisruptionReplanner({
  tripId,
  activeItineraryId,
  onReplanApplied,
}: DisruptionReplannerProps) {
  const [detecting, setDetecting] = useState(false);
  const [disruptions, setDisruptions] = useState<DisruptionData | null>(null);
  const [selectedDisruption, setSelectedDisruption] =
    useState<Disruption | null>(null);
  const [replanning, setReplanning] = useState(false);
  const [replanResult, setReplanResult] = useState<ReplanData | null>(null);
  const [applying, setApplying] = useState(false);
  const [showActivities, setShowActivities] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const detectDisruptionsHandler = async () => {
    setDetecting(true);
    setDisruptions(null);
    setReplanResult(null);
    setSelectedDisruption(null);
    try {
      const data = await detectDisruptionsService(tripId);
      setDisruptions(data);
      if (data.disruptions?.length > 0) {
        toast({
          title: `${data.disruptions.length} disruption(s) detected`,
          description: `Overall risk: ${data.overall_risk}`,
          variant: data.overall_risk === "high" ? "destructive" : "default",
        });
      } else {
        toast({
          title: "All clear! ✅",
          description: "No disruptions detected for your trip.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Detection failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDetecting(false);
    }
  };

  const handleReplan = async (disruption: Disruption) => {
    setSelectedDisruption(disruption);
    setReplanning(true);
    setReplanResult(null);
    try {
      const data = await autoReplan(tripId, {
        type: disruption.type,
        severity: disruption.severity,
        description: disruption.description,
        affected_activities: disruption.affected_activities,
      });
      setReplanResult(data);
      toast({ title: "Replan ready! 🔄", description: data.changes_summary });
    } catch (error: any) {
      toast({
        title: "Replan failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setReplanning(false);
    }
  };

  const applyReplan = async () => {
    if (!replanResult || !user) return;
    setApplying(true);
    try {
      let itineraryId = activeItineraryId;
      if (!itineraryId) {
        const { data: newIt, error: itErr } = await supabase
          .from("itineraries")
          .insert({
            trip_id: tripId,
            created_by: user.id,
            version: 1,
            variant_id: "replanned",
          })
          .select()
          .single();
        if (itErr) throw itErr;
        itineraryId = newIt.id;
      }

      // Save old itinerary as disruption event
      if (selectedDisruption) {
        await supabase.from("disruption_events").insert({
          trip_id: tripId,
          event_type: selectedDisruption.type,
          description: selectedDisruption.description,
          severity: selectedDisruption.severity,
          replan_applied: true,
          resolved: true,
          new_itinerary: {
            changes_summary: replanResult.changes_summary,
            changes_count: replanResult.changes_count,
          },
        });
      }

      // Clear old activities
      await supabase
        .from("activities")
        .delete()
        .eq("itinerary_id", itineraryId);

      // Insert replanned activities
      const activitiesToInsert = replanResult.activities.map((a) => ({
        itinerary_id: itineraryId!,
        name: a.name,
        description: a.description,
        location_name: a.location_name,
        location_lat: a.location_lat,
        location_lng: a.location_lng,
        start_time: a.start_time,
        end_time: a.end_time,
        category: a.category,
        cost: a.cost,
        estimated_steps: a.estimated_steps,
        review_score: a.review_score,
        priority: a.priority,
        notes: a.notes,
      }));

      if (activitiesToInsert.length > 0) {
        const { error: actErr } = await supabase
          .from("activities")
          .insert(activitiesToInsert);
        if (actErr) throw actErr;
      }

      // Update itinerary metadata
      await supabase
        .from("itineraries")
        .update({
          cost_breakdown: { total: replanResult.total_cost, replanned: true },
        })
        .eq("id", itineraryId);

      queryClient.invalidateQueries({ queryKey: ["itineraries", tripId] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      toast({
        title: "Replan applied! ✅",
        description: `${replanResult.changes_count} activities updated.`,
      });
      setReplanResult(null);
      setDisruptions(null);
      setSelectedDisruption(null);
      onReplanApplied();
    } catch (error: any) {
      toast({
        title: "Failed to apply replan",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Scan Button */}
      <div className="bg-card rounded-2xl p-5 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-card-foreground flex items-center gap-2">
              <Zap className="w-4 h-4 text-warning" />
              Live Dynamic Replanning
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Detect flight delays, weather changes, venue closures &
              auto-replan
            </p>
          </div>
        </div>
        <button
          onClick={detectDisruptionsHandler}
          disabled={detecting}
          className="w-full px-5 py-3 rounded-xl bg-warning/10 border border-warning/30 text-warning text-sm font-semibold hover:bg-warning/20 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {detecting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Scanning for disruptions...
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4" />
              Scan for Disruptions
            </>
          )}
        </button>
      </div>

      {/* Disruption Results */}
      {disruptions && disruptions.disruptions.length > 0 && (
        <div className="bg-card rounded-2xl p-5 shadow-card space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-card-foreground">
              {disruptions.disruptions.length} Disruption
              {disruptions.disruptions.length > 1 ? "s" : ""} Detected
            </h4>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                disruptions.overall_risk === "high"
                  ? "bg-destructive text-destructive-foreground"
                  : disruptions.overall_risk === "medium"
                    ? "bg-warning text-warning-foreground"
                    : "bg-success text-success-foreground"
              }`}
            >
              {disruptions.overall_risk} risk
            </span>
          </div>

          {disruptions.disruptions.map((d, i) => {
            const Icon = DISRUPTION_ICONS[d.type] || AlertTriangle;
            const severityClass =
              SEVERITY_COLORS[d.severity] || SEVERITY_COLORS.medium;
            const isSelected = selectedDisruption === d;

            return (
              <div
                key={i}
                className={`rounded-xl border p-4 ${severityClass} transition-all`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <Icon className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold">{d.title}</p>
                      <p className="text-xs mt-0.5 opacity-80">
                        {d.description}
                      </p>
                      {d.affected_activities?.length > 0 && (
                        <p className="text-[11px] mt-1 opacity-70">
                          Affects: {d.affected_activities.join(", ")}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-[10px] opacity-60">
                        <span>⏱ {d.time_window}</span>
                        <span>
                          Confidence: {Math.round(d.confidence * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleReplan(d)}
                    disabled={replanning && isSelected}
                    className="px-3 py-1.5 rounded-lg bg-card text-card-foreground text-xs font-semibold hover:bg-secondary transition-colors shrink-0 flex items-center gap-1 disabled:opacity-50"
                  >
                    {replanning && isSelected ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    Auto-Replan
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Replan Preview */}
      {replanResult && (
        <div className="bg-card rounded-2xl p-5 shadow-card space-y-4 animate-fade-in border-2 border-primary/30">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-card-foreground flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-primary" />
                Replanned Itinerary Preview
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {replanResult.changes_summary}
              </p>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
              {replanResult.changes_count} changes
            </span>
          </div>

          {/* Cost comparison */}
          <div className="flex items-center gap-4 p-3 rounded-xl bg-secondary/50">
            <div className="text-center flex-1">
              <p className="text-xs text-muted-foreground">New Est. Cost</p>
              <p className="text-sm font-bold text-card-foreground">
                ₹{replanResult.total_cost?.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="text-center flex-1">
              <p className="text-xs text-muted-foreground">Activities</p>
              <p className="text-sm font-bold text-card-foreground">
                {replanResult.activities?.length || 0}
              </p>
            </div>
            <div className="text-center flex-1">
              <p className="text-xs text-muted-foreground">Changed</p>
              <p className="text-sm font-bold text-primary">
                {replanResult.activities?.filter((a) => a.is_changed).length ||
                  replanResult.changes_count}
              </p>
            </div>
          </div>

          {/* Activity list toggle */}
          <button
            onClick={() => setShowActivities(!showActivities)}
            className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            {showActivities ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
            {showActivities ? "Hide" : "Preview"} Activities
          </button>

          {showActivities && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {replanResult.activities?.map((a, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 p-2.5 rounded-lg text-xs ${
                    a.is_changed
                      ? "bg-primary/5 border border-primary/20"
                      : "bg-secondary/30"
                  }`}
                >
                  {a.is_changed && (
                    <span className="px-1 py-0.5 rounded bg-primary text-primary-foreground text-[9px] font-bold shrink-0 mt-0.5">
                      CHANGED
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
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
                      {a.location_name && (
                        <span className="flex items-center gap-0.5 truncate">
                          <MapPin className="w-2.5 h-2.5" />
                          {a.location_name}
                        </span>
                      )}
                      {a.cost > 0 && (
                        <span className="flex items-center gap-0.5">
                          <IndianRupee className="w-2.5 h-2.5" />
                          {a.cost.toLocaleString("en-IN")}
                        </span>
                      )}
                    </div>
                    {a.notes && a.is_changed && (
                      <p className="text-[10px] text-primary mt-1">
                        💡 {a.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Accept / Dismiss */}
          <div className="flex gap-2">
            <button
              onClick={applyReplan}
              disabled={applying}
              className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
            >
              {applying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {applying ? "Applying..." : "Accept Replan"}
            </button>
            <button
              onClick={() => {
                setReplanResult(null);
                setSelectedDisruption(null);
              }}
              className="px-4 py-2.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
