import { useState, useEffect } from "react";
import {
  Brain,
  RefreshCw,
  Loader2,
  Sparkles,
  MapPin,
  Utensils,
  Wallet,
  Clock,
  Users,
  Compass,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getMemory, learnMemory } from "@/services/travelMemory";

interface MemoryData {
  preferences: Record<string, any>;
  travel_personality: Record<string, any>;
  travel_history: any[];
  insights?: string[];
}

const personalityIcons: Record<string, React.ReactNode> = {
  Explorer: <Compass className="w-4 h-4" />,
  Relaxer: <Clock className="w-4 h-4" />,
  Adventurer: <Sparkles className="w-4 h-4" />,
  "Culture Buff": <MapPin className="w-4 h-4" />,
  Foodie: <Utensils className="w-4 h-4" />,
  "Budget Traveler": <Wallet className="w-4 h-4" />,
};

export default function TravelMemory() {
  const [memory, setMemory] = useState<MemoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [learning, setLearning] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadMemory();
  }, []);

  const loadMemory = async () => {
    setLoading(true);
    try {
      const data = await getMemory();
      setMemory(data);
    } catch (e: any) {
      console.error("Load memory error:", e);
    } finally {
      setLoading(false);
    }
  };

  const learnFromTrips = async () => {
    setLearning(true);
    try {
      const result = await learnMemory();
      if (!result.success && result.message) {
        toast({ title: "Nothing to learn yet", description: result.message });
        return;
      }
      setMemory(result.memory as MemoryData);
      toast({
        title: "Memory updated! 🧠",
        description:
          "Your travel profile has been refreshed from your trip history.",
      });
    } catch (e: any) {
      toast({
        title: "Learning failed",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setLearning(false);
    }
  };

  const prefs = memory?.preferences || {};
  const personality = memory?.travel_personality || {};
  const history = Array.isArray(memory?.travel_history)
    ? memory.travel_history
    : [];
  const insights = memory?.insights || [];
  const hasMemory =
    Object.keys(prefs).length > 0 || Object.keys(personality).length > 0;

  if (loading) {
    return (
      <div className="bg-card rounded-2xl p-5 shadow-card">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">
            Loading travel memory...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl p-5 shadow-card space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Brain className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-card-foreground">
              Travel Memory
            </h3>
            <p className="text-[10px] text-muted-foreground">
              AI learns from your past trips
            </p>
          </div>
        </div>
        <button
          onClick={learnFromTrips}
          disabled={learning}
          className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          {learning ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          {learning ? "Learning..." : "Learn Now"}
        </button>
      </div>

      {!hasMemory ? (
        <div className="text-center py-4">
          <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No memory yet. Create some trips, then click "Learn Now" to build
            your travel profile.
          </p>
        </div>
      ) : (
        <>
          {/* Personality Badge */}
          {personality.type && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                {personalityIcons[personality.type] || (
                  <Brain className="w-5 h-5 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-card-foreground">
                  {personality.type}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {personality.description ||
                    `${personality.planning_style} • ${personality.risk_tolerance} risk`}
                </p>
              </div>
            </div>
          )}

          {/* Preferences Grid */}
          <div className="grid grid-cols-2 gap-2">
            {prefs.preferred_pace && (
              <div className="p-2.5 rounded-xl bg-secondary/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Pace
                </p>
                <p className="text-xs font-semibold text-card-foreground capitalize">
                  {prefs.preferred_pace}
                </p>
              </div>
            )}
            {prefs.avg_daily_budget && (
              <div className="p-2.5 rounded-xl bg-secondary/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Avg Daily Budget
                </p>
                <p className="text-xs font-semibold text-card-foreground">
                  ₹{Number(prefs.avg_daily_budget).toLocaleString("en-IN")}
                </p>
              </div>
            )}
            {prefs.accommodation_style && (
              <div className="p-2.5 rounded-xl bg-secondary/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Accommodation
                </p>
                <p className="text-xs font-semibold text-card-foreground capitalize">
                  {prefs.accommodation_style}
                </p>
              </div>
            )}
            {prefs.time_preference && (
              <div className="p-2.5 rounded-xl bg-secondary/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Time Style
                </p>
                <p className="text-xs font-semibold text-card-foreground capitalize">
                  {prefs.time_preference?.replace("_", " ")}
                </p>
              </div>
            )}
          </div>

          {/* Favorite Categories */}
          {prefs.favorite_categories?.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                Favorite Activities
              </p>
              <div className="flex flex-wrap gap-1.5">
                {prefs.favorite_categories.map((cat: string) => (
                  <span
                    key={cat}
                    className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-medium capitalize"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Top Destinations */}
          {history.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                Places Visited
              </p>
              <div className="flex flex-wrap gap-1.5">
                {history.slice(0, 5).map((h: any, i: number) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground text-[11px] font-medium flex items-center gap-1"
                  >
                    <MapPin className="w-2.5 h-2.5" />
                    {h.destination || h}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Insights */}
          {insights.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                AI Insights
              </p>
              {insights.slice(0, 3).map((insight: string, i: number) => (
                <p
                  key={i}
                  className="text-[11px] text-muted-foreground flex items-start gap-1.5"
                >
                  <Sparkles className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                  {insight}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
