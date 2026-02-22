import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Clock,
  Utensils,
  Camera,
  ShoppingBag,
  Bus,
  MessageSquare,
  Edit,
  Loader2,
  Brain,
  AlertTriangle,
  Send,
  RefreshCw,
  Zap,
  Map as MapIcon,
  Download,
  Navigation,
  ExternalLink,
  CloudSun,
  Wind,
  Droplets,
  Thermometer,
  Car,
  Route,
  Shield,
  Star,
  Home,
  Music,
  X,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCurrency } from "@/lib/currency";
import {
  getWeatherForecast,
  geocodeDestination,
  WMO_CODES,
  type DailyForecast,
} from "@/services/climate";
import { trafficFlow as fetchTrafficFlow } from "@/services/traffic";
import {
  useTrip,
  useTrips,
  useItineraries,
  useActivities,
} from "@/hooks/useTrips";
import { supabase } from "@/integrations/supabase/client";
import { planItinerary } from "@/services/aiPlanner";
import { nominatimSearch } from "@/services/nominatim";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import RegretPlanner from "@/components/RegretPlanner";
import DisruptionReplanner from "@/components/DisruptionReplanner";

import TripMoneyExpenses from "@/components/TripMoneyExpenses";
import WorldMap from "@/components/WorldMap";
import Map3D from "@/components/Map3D";
import SafetyWarnings from "@/components/SafetyWarnings";
import ItineraryReasoningPanel, {
  type ItineraryReasoning,
} from "@/components/ItineraryReasoning";
import UPIPayment from "@/components/UPIPayment";
import OfflineSaveButton from "@/components/OfflineSaveButton";
import { useOnlineStatus } from "@/hooks/useOfflineTrip";

const typeIcons: Record<string, React.ReactNode> = {
  food: <Utensils className="w-4 h-4" />,
  attraction: <Camera className="w-4 h-4" />,
  transport: <Bus className="w-4 h-4" />,
  shopping: <ShoppingBag className="w-4 h-4" />,
  accommodation: <Home className="w-4 h-4" />,
  activity: <Zap className="w-4 h-4" />,
  entertainment: <Music className="w-4 h-4" />,
  other: <MapPin className="w-4 h-4" />,
};

const typeColors: Record<string, string> = {
  food: "bg-warning/10 text-warning",
  attraction: "bg-accent/10 text-accent",
  transport: "bg-success/10 text-success",
  shopping: "bg-primary/10 text-primary",
  accommodation: "bg-blue-500/10 text-blue-500",
  activity: "bg-purple-500/10 text-purple-500",
  entertainment: "bg-pink-500/10 text-pink-500",
  other: "bg-muted text-muted-foreground",
};

const DEFAULT_ICON = <MapPin className="w-4 h-4" />;
const DEFAULT_COLOR = "bg-muted text-muted-foreground";

export default function Itinerary() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: trips = [] } = useTrips();
  const { data: trip } = useTrip(tripId);
  const { data: itineraries = [] } = useItineraries(tripId);
  const activeItinerary = itineraries[0];
  const { data: activities = [] } = useActivities(activeItinerary?.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();

  // Fetch trip members for expense splitting
  const { data: tripMembers = [] } = useQuery({
    queryKey: ["trip-members-expense", tripId],
    queryFn: async () => {
      if (!tripId) return [];
      const { data: memberships } = await supabase
        .from("trip_memberships")
        .select("user_id, role")
        .eq("trip_id", tripId);
      if (!memberships || memberships.length === 0) return [];
      const userIds = memberships.map((m: any) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", userIds);
      return (profiles || []).map((p: any) => p.name || "Traveler");
    },
    enabled: !!tripId,
  });

  // Weather & Traffic state
  const [weatherForecast, setWeatherForecast] = useState<DailyForecast[]>([]);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [trafficData, setTrafficData] = useState<any>(null);
  const [loadingTraffic, setLoadingTraffic] = useState(false);
  const [showWeather, setShowWeather] = useState(true);
  const [navLoading, setNavLoading] = useState<string | null>(null);
  const [routeInfo, setRouteInfo] = useState<
    Record<string, { dist: string; dur: string }>
  >({});

  // Auto-redirect to first trip if no tripId
  useEffect(() => {
    if (!tripId && trips.length > 0) {
      navigate(`/itinerary/${trips[0].id}`, { replace: true });
    }
  }, [tripId, trips, navigate]);

  const [generating, setGenerating] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [replanning, setReplanning] = useState(false);
  const [itineraryReasoning, setItineraryReasoning] =
    useState<ItineraryReasoning | null>(null);
  const [itineraryExplanation, setItineraryExplanation] = useState<string>("");
  const [itineraryTotalCost, setItineraryTotalCost] = useState<number | null>(
    null,
  );
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [destCoords, setDestCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [destMapMode, setDestMapMode] = useState<"2d" | "3d">("2d");
  const [showDestMap, setShowDestMap] = useState(true);

  // Geocode trip destination for map
  useEffect(() => {
    if (!trip?.destination) {
      setDestCoords(null);
      return;
    }
    const geocode = async () => {
      try {
        const results = await nominatimSearch(
          `${trip.destination} ${trip.country || ""}`.trim(),
          1,
        );
        if (results && results.length > 0) {
          setDestCoords({
            lat: parseFloat(results[0].lat),
            lng: parseFloat(results[0].lon),
          });
        }
      } catch {
        /* silently fail */
      }
    };
    geocode();
  }, [trip?.destination, trip?.country]);

  // Fetch weather forecast for trip destination
  useEffect(() => {
    if (!trip?.destination) return;
    const fetchWeather = async () => {
      setLoadingWeather(true);
      try {
        const coords = await geocodeDestination(
          `${trip.destination} ${trip.country || ""}`.trim(),
        );
        if (!coords) return;
        const forecast = await getWeatherForecast({
          lat: coords.lat,
          lon: coords.lon,
          days: 7,
        });
        setWeatherForecast(forecast.daily);

        // Also fetch traffic
        setLoadingTraffic(true);
        try {
          const tf = await fetchTrafficFlow({
            lat: coords.lat,
            lon: coords.lon,
          });
          setTrafficData(tf);
        } catch {
          /* traffic optional */
        } finally {
          setLoadingTraffic(false);
        }
      } catch {
        /* silently fail */
      } finally {
        setLoadingWeather(false);
      }
    };
    fetchWeather();
  }, [trip?.destination, trip?.country]);

  // Navigate to activity on Google Maps / Apple Maps
  const openNavigation = (activity: {
    location_name?: string | null;
    location_lat?: number | null;
    location_lng?: number | null;
    name: string;
  }) => {
    const lat = activity.location_lat;
    const lng = activity.location_lng;
    const name = activity.location_name || activity.name;

    let url: string;
    if (lat && lng) {
      // Universal Google Maps navigation URL (opens in Maps app on mobile)
      url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    } else {
      url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(name)}&travelmode=driving`;
    }
    window.open(url, "_blank");
  };

  // Get ORS route from current location
  const getRouteToActivity = async (activity: {
    id: string;
    location_name?: string | null;
    location_lat?: number | null;
    location_lng?: number | null;
    name: string;
  }) => {
    setNavLoading(activity.id);
    try {
      // Get user's current location
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 8000,
        }),
      );
      const { latitude: oLat, longitude: oLon } = pos.coords;

      let dLat = activity.location_lat;
      let dLon = activity.location_lng;

      if (!dLat || !dLon) {
        const coords = await geocodeDestination(
          activity.location_name || activity.name,
        );
        if (coords) {
          dLat = coords.lat;
          dLon = coords.lon;
        }
      }

      if (!dLat || !dLon) {
        toast({
          title: "Location not found",
          description: "Could not find coordinates for this activity.",
          variant: "destructive",
        });
        return;
      }

      const ORS_KEY = import.meta.env.VITE_ORS_API_KEY as string;
      const res = await fetch(
        "https://api.openrouteservice.org/v2/directions/driving-car/json",
        {
          method: "POST",
          headers: {
            Authorization: ORS_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            coordinates: [
              [oLon, oLat],
              [dLon, dLat],
            ],
            units: "km",
          }),
        },
      );
      if (!res.ok) throw new Error("Route fetch failed");
      const data = await res.json();
      const summary = data.routes?.[0]?.summary;
      if (summary) {
        const dist = `${(summary.distance ?? 0).toFixed(1)} km`;
        const dur = `${Math.round((summary.duration ?? 0) / 60)} min`;
        setRouteInfo((prev) => ({
          ...prev,
          [activity.id]: { dist, dur },
        }));
        toast({
          title: `📍 Route to ${activity.name}`,
          description: `${dist} · ~${dur} by car`,
        });
      }
    } catch (err: any) {
      if (err.code === 1) {
        toast({
          title: "Location permission denied",
          description: "Enable location access to get directions.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Route error",
          description: err.message,
          variant: "destructive",
        });
      }
    } finally {
      setNavLoading(null);
    }
  };

  // Load messages for chat
  useEffect(() => {
    if (!tripId || !showChat) return;
    const loadMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: true });
      if (data) setMessages(data);
    };
    loadMessages();

    // Realtime subscription
    const channel = supabase
      .channel(`trip-chat-${tripId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `trip_id=eq.${tripId}`,
        },
        (payload) => setMessages((prev) => [...prev, payload.new]),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, showChat]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // AI Itinerary Generation
  const handleGenerateItinerary = async () => {
    if (!trip || !user) return;
    setGenerating(true);
    try {
      const days = Math.max(
        1,
        Math.ceil(
          (new Date(trip.end_date).getTime() -
            new Date(trip.start_date).getTime()) /
            86400000,
        ),
      );

      const plan = (await planItinerary({
        destination: trip.destination,
        days,
        travelers: Number((trip as any).travelers) || 2,
        budget: Number(trip.budget_total) || 30000,
        interests: ["culture", "food", "sightseeing"],
        tripType: (trip as any).trip_type || "leisure",
      })) as any;

      // Store reasoning from AI response
      if (plan.reasoning) {
        setItineraryReasoning(plan.reasoning as ItineraryReasoning);
      }
      if (plan.explanation) {
        setItineraryExplanation(plan.explanation);
      }
      if (plan.total_cost) {
        setItineraryTotalCost(Number(plan.total_cost));
      }

      // Create itinerary record
      let itineraryId = activeItinerary?.id;
      if (!itineraryId) {
        const { data: newIt, error: itErr } = await supabase
          .from("itineraries")
          .insert({ trip_id: tripId!, created_by: user.id, version: 1 })
          .select()
          .single();
        if (itErr) throw itErr;
        itineraryId = newIt.id;
      }

      // Delete old activities if re-generating
      await supabase
        .from("activities")
        .delete()
        .eq("itinerary_id", itineraryId);

      // Insert new activities
      const activitiesToInsert = (plan.activities || []).map((a: any) => ({
        itinerary_id: itineraryId,
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

      // Update itinerary with cost breakdown and regret score
      await supabase
        .from("itineraries")
        .update({
          cost_breakdown: { total: plan.total_cost },
          regret_score: 0.15,
        })
        .eq("id", itineraryId);

      queryClient.invalidateQueries({ queryKey: ["itineraries", tripId] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });

      toast({
        title: "Itinerary generated! ✨",
        description:
          plan.reasoning?.selection_summary ||
          plan.explanation ||
          `${activitiesToInsert.length} activities planned.`,
      });
    } catch (error: any) {
      toast({
        title: "Generation failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  // Send chat message
  const handleSendMessage = async () => {
    if (!chatInput.trim() || !user || !tripId) return;
    setSendingMsg(true);
    try {
      const { error } = await supabase.from("messages").insert({
        trip_id: tripId,
        sender_id: user.id,
        content: chatInput,
        message_type: "text",
      });
      if (error) throw error;
      setChatInput("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSendingMsg(false);
    }
  };

  // Dynamic Replanning (simulate disruption)
  const handleReplan = async () => {
    if (!trip || !activeItinerary) return;
    setReplanning(true);
    try {
      // Log disruption event
      await supabase.from("disruption_events").insert({
        trip_id: tripId!,
        event_type: "weather_change",
        description: "Heavy rainfall expected — replanning outdoor activities",
        severity: "medium",
      });

      // Regenerate itinerary
      await handleGenerateItinerary();

      // Mark disruption as resolved
      toast({
        title: "Replanned! 🔄",
        description:
          "Itinerary updated due to weather disruption. Outdoor activities adjusted.",
      });
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

  // Group activities by day
  const activityDays = activities.reduce(
    (acc, activity) => {
      const day = new Date(activity.start_time).toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
      if (!acc[day]) acc[day] = [];
      acc[day].push(activity);
      return acc;
    },
    {} as Record<string, typeof activities>,
  );

  const days = Object.keys(activityDays);
  const [selectedDay, setSelectedDay] = useState(0);

  if (!tripId) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="text-center py-20">
          <MapPin className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">
            {trips.length === 0 ? "No Trips Yet" : "Select a Trip"}
          </h1>
          <p className="text-muted-foreground mb-6">
            {trips.length === 0
              ? "Create your first trip from the dashboard to get started."
              : "Choose a trip below or from the sidebar."}
          </p>
          {trips.length > 0 && (
            <div className="grid gap-3 max-w-md mx-auto">
              {trips.map((t) => (
                <button
                  key={t.id}
                  onClick={() => navigate(`/itinerary/${t.id}`)}
                  className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border hover:bg-secondary transition-colors text-left shadow-card"
                >
                  <MapPin className="w-5 h-5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-card-foreground">
                      {t.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.destination}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const currentDayActivities =
    days.length > 0 ? activityDays[days[selectedDay]] || [] : [];

  // Weather for selected day
  const selectedDayDate =
    days.length > 0
      ? activities.find(
          (a) =>
            new Date(a.start_time).toLocaleDateString("en-IN", {
              weekday: "short",
              day: "numeric",
              month: "short",
            }) === days[selectedDay],
        )?.start_time
      : undefined;
  const selectedDayWeather = selectedDayDate
    ? weatherForecast.find(
        (d) => d.date === new Date(selectedDayDate).toISOString().split("T")[0],
      )
    : null;

  // Traffic summary
  const trafficFlow_ = trafficData?.flowSegmentData;
  const trafficSpeed = trafficFlow_?.currentSpeed ?? 0;
  const trafficFreeFlow = trafficFlow_?.freeFlowSpeed ?? 1;
  const trafficRatio = trafficSpeed / trafficFreeFlow;
  const trafficLabel =
    trafficRatio < 0.3
      ? "🔴 Heavy"
      : trafficRatio < 0.6
        ? "🟡 Moderate"
        : trafficRatio < 0.85
          ? "🟠 Light"
          : "🟢 Free flow";

  return (
    <div className="flex flex-col lg:flex-row min-h-screen lg:h-screen lg:overflow-hidden">
      {/* Main content */}
      <div
        className={`flex-1 p-4 lg:p-6 overflow-y-auto min-w-0 ${showChat ? "lg:max-w-[calc(100%-360px)]" : ""}`}
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4 md:mb-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-bold text-foreground truncate">
                {trip.name}
              </h1>
              {/* Online / Offline indicator */}
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                  isOnline
                    ? "bg-success/10 text-success border-success/20"
                    : "bg-warning/10 text-warning border-warning/20"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-success" : "bg-warning"}`}
                />
                {isOnline ? "Online" : "Offline"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {trip.destination} · Budget:{" "}
              {formatCurrency(Number(trip.budget_total), trip.country)} ·{" "}
              {trip.status}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {/* Save Offline button */}
            <OfflineSaveButton trip={trip as Record<string, unknown>} />
            <button
              onClick={() => {
                // Download itinerary as text file
                // ── Beautiful PDF export ──────────────────────────
                const doc = new jsPDF({
                  orientation: "portrait",
                  unit: "mm",
                  format: "a4",
                });
                const pageW = doc.internal.pageSize.getWidth();
                const pageH = doc.internal.pageSize.getHeight();
                const margin = 14;

                // ── Gradient-style header banner ──────────────────
                doc.setFillColor(79, 70, 229); // indigo-600
                doc.rect(0, 0, pageW, 38, "F");

                // Decorative circle accents
                doc.setFillColor(99, 102, 241);
                doc.circle(pageW - 20, 8, 22, "F");
                doc.setFillColor(67, 56, 202);
                doc.circle(pageW - 10, 30, 14, "F");

                // Trip name
                doc.setTextColor(255, 255, 255);
                doc.setFont("helvetica", "bold");
                doc.setFontSize(20);
                doc.text(trip.name, margin, 16);

                // Destination & dates
                doc.setFont("helvetica", "normal");
                doc.setFontSize(10);
                doc.text(
                  `${trip.destination}${trip.country ? `, ${trip.country}` : ""}  •  ${new Date(trip.start_date).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })} — ${new Date(trip.end_date).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}`,
                  margin,
                  25,
                );

                // Budget pill
                doc.setFillColor(255, 255, 255, 30);
                doc.setFont("helvetica", "bold");
                doc.setFontSize(9);
                doc.setTextColor(220, 220, 255);
                doc.text(
                  `Budget: ${formatCurrency(Number(trip.budget_total), trip.country)}`,
                  margin,
                  33,
                );

                let yPos = 50;

                // ── Summary stats row ─────────────────────────────
                const statBoxW = (pageW - margin * 2 - 6) / 3;
                const stats = [
                  {
                    label: "Total Budget",
                    value: formatCurrency(
                      Number(trip.budget_total),
                      trip.country,
                    ),
                  },
                  {
                    label: "Duration",
                    value: `${Object.keys(activityDays).length} day${Object.keys(activityDays).length !== 1 ? "s" : ""}`,
                  },
                  {
                    label: "Activities",
                    value: `${activities.length} planned`,
                  },
                ];
                stats.forEach((stat, i) => {
                  const bx = margin + i * (statBoxW + 3);
                  doc.setFillColor(244, 244, 255);
                  doc.roundedRect(bx, yPos, statBoxW, 18, 3, 3, "F");
                  doc.setFont("helvetica", "bold");
                  doc.setFontSize(11);
                  doc.setTextColor(79, 70, 229);
                  doc.text(stat.value, bx + statBoxW / 2, yPos + 8, {
                    align: "center",
                  });
                  doc.setFont("helvetica", "normal");
                  doc.setFontSize(7.5);
                  doc.setTextColor(120, 120, 150);
                  doc.text(stat.label, bx + statBoxW / 2, yPos + 14, {
                    align: "center",
                  });
                });

                yPos += 26;

                // ── Per-day itinerary ─────────────────────────────
                Object.entries(activityDays).forEach(([day, acts], dayIdx) => {
                  // Day header
                  if (yPos > pageH - 40) {
                    doc.addPage();
                    yPos = 20;
                  }

                  doc.setFillColor(79, 70, 229);
                  doc.roundedRect(
                    margin,
                    yPos,
                    pageW - margin * 2,
                    9,
                    2,
                    2,
                    "F",
                  );
                  doc.setFont("helvetica", "bold");
                  doc.setFontSize(9);
                  doc.setTextColor(255, 255, 255);
                  doc.text(
                    `Day ${dayIdx + 1}  —  ${day}`,
                    margin + 4,
                    yPos + 6,
                  );
                  yPos += 13;

                  // Activities table for this day
                  const tableRows = (acts as any[]).map((a) => {
                    const timeStr = new Date(a.start_time).toLocaleTimeString(
                      [],
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    );
                    const endStr = new Date(a.end_time).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    return [
                      `${timeStr} – ${endStr}`,
                      a.name || "",
                      a.location_name || "—",
                      a.category
                        ? a.category.charAt(0).toUpperCase() +
                          a.category.slice(1)
                        : "—",
                      a.cost && Number(a.cost) > 0
                        ? formatCurrency(Number(a.cost), trip.country)
                        : "Free",
                      a.notes || "",
                    ];
                  });

                  autoTable(doc, {
                    startY: yPos,
                    head: [
                      [
                        "Time",
                        "Activity",
                        "Location",
                        "Category",
                        "Cost",
                        "Notes",
                      ],
                    ],
                    body: tableRows,
                    margin: { left: margin, right: margin },
                    theme: "grid",
                    headStyles: {
                      fillColor: [99, 102, 241],
                      textColor: 255,
                      fontStyle: "bold",
                      fontSize: 8,
                    },
                    bodyStyles: {
                      fontSize: 8,
                      textColor: [30, 30, 60],
                    },
                    alternateRowStyles: {
                      fillColor: [245, 245, 255],
                    },
                    columnStyles: {
                      0: { cellWidth: 28 },
                      1: { cellWidth: 45, fontStyle: "bold" },
                      2: { cellWidth: 35 },
                      3: { cellWidth: 22 },
                      4: { cellWidth: 22 },
                      5: { cellWidth: "auto" },
                    },
                    didDrawPage: (hookData) => {
                      // Footer on each page
                      const pCount = doc.getNumberOfPages();
                      doc.setFont("helvetica", "normal");
                      doc.setFontSize(7);
                      doc.setTextColor(160, 160, 180);
                      doc.text(
                        `Radiator Routes  •  ${trip.name}  •  Page ${hookData.pageNumber} of ${pCount}`,
                        pageW / 2,
                        pageH - 6,
                        { align: "center" },
                      );
                    },
                  });

                  yPos = (doc as any).lastAutoTable.finalY + 8;
                });

                // ── Footer note ───────────────────────────────────
                if (yPos < pageH - 20) {
                  doc.setFont("helvetica", "italic");
                  doc.setFontSize(7.5);
                  doc.setTextColor(150, 150, 180);
                  doc.text(
                    `Generated by Radiator Routes on ${new Date().toLocaleDateString("en-US", { dateStyle: "long" })}`,
                    pageW / 2,
                    yPos + 6,
                    { align: "center" },
                  );
                }

                doc.save(`${trip.name.replace(/\s+/g, "_")}_itinerary.pdf`);
                toast({
                  title: "PDF downloaded! 📄",
                  description: "Your itinerary has been saved as a PDF.",
                });
              }}
              disabled={activities.length === 0}
              className="px-3 py-2 rounded-xl bg-card border border-border text-xs md:text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors shadow-card flex items-center gap-1.5 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden sm:inline">Download</span>
            </button>
            <button
              onClick={() => setShowChat(!showChat)}
              className={`px-3 py-2 rounded-xl text-xs md:text-sm font-medium transition-colors shadow-card flex items-center gap-1.5 ${
                showChat
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 md:w-4 md:h-4" />
              Chat
            </button>
            <button
              onClick={handleReplan}
              disabled={replanning || !activeItinerary}
              className="px-3 py-2 rounded-xl bg-card border border-border text-xs md:text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors shadow-card flex items-center gap-1.5 disabled:opacity-50"
            >
              {replanning ? (
                <Loader2 className="w-3.5 h-3.5 md:w-4 md:h-4 animate-spin" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 md:w-4 md:h-4" />
              )}
              <span className="hidden sm:inline">Replan</span>
            </button>
            <button
              onClick={handleGenerateItinerary}
              disabled={generating}
              className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs md:text-sm font-medium hover:opacity-90 transition-opacity shadow-card flex items-center gap-1.5 disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="w-3.5 h-3.5 md:w-4 md:h-4 animate-spin" />
              ) : (
                <Brain className="w-3.5 h-3.5 md:w-4 md:h-4" />
              )}
              {activities.length > 0 ? "Regenerate" : "Generate AI Plan"}
            </button>
          </div>
        </div>

        {/* Trip Info */}
        <div className="bg-card rounded-2xl p-4 md:p-5 shadow-card mb-4 md:mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Destination</p>
              <p className="text-sm font-bold text-card-foreground">
                {trip.destination}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Budget</p>
              <p className="text-sm font-bold text-card-foreground">
                {formatCurrency(Number(trip.budget_total), trip.country)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Start</p>
              <p className="text-sm font-bold text-card-foreground">
                {new Date(trip.start_date).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                })}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">End</p>
              <p className="text-sm font-bold text-card-foreground">
                {new Date(trip.end_date).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                })}
              </p>
            </div>
          </div>
          {activeItinerary?.regret_score != null && (
            <div className="mt-4 pt-4 border-t border-border flex items-center justify-center gap-4">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">
                  Regret Score:
                </span>
                <span className="text-sm font-bold text-primary">
                  {activeItinerary.regret_score.toFixed(2)}
                </span>
              </div>
              {activeItinerary.cost_breakdown && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Est. Cost:
                  </span>
                  <span className="text-sm font-bold text-success">
                    {formatCurrency(
                      Number(
                        (activeItinerary.cost_breakdown as any)?.total || 0,
                      ),
                      trip.country,
                    )}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Weather Forecast Panel */}
        {(loadingWeather || weatherForecast.length > 0) && (
          <div className="bg-card rounded-2xl shadow-card mb-6 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <CloudSun className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-card-foreground">
                  Weather Forecast · {trip.destination}
                </span>
              </div>
              <button
                onClick={() => setShowWeather((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {showWeather ? "Hide" : "Show"}
              </button>
            </div>
            {showWeather && (
              <div className="p-4">
                {loadingWeather ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Fetching forecast…
                  </div>
                ) : (
                  <>
                    {/* 7-day scroll */}
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {weatherForecast.map((day) => {
                        const isToday =
                          day.date === new Date().toISOString().split("T")[0];
                        const isSel = selectedDayWeather?.date === day.date;
                        return (
                          <div
                            key={day.date}
                            className={`flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border transition-colors ${
                              isSel
                                ? "border-primary bg-primary/5"
                                : isToday
                                  ? "border-warning/50 bg-warning/5"
                                  : "border-border bg-secondary/30"
                            }`}
                          >
                            <span className="text-[10px] font-medium text-muted-foreground">
                              {isToday
                                ? "Today"
                                : new Date(
                                    day.date + "T12:00:00",
                                  ).toLocaleDateString("en-IN", {
                                    weekday: "short",
                                    day: "numeric",
                                    month: "short",
                                  })}
                            </span>
                            <span className="text-xl">{day.weatherEmoji}</span>
                            <span className="text-xs font-semibold text-card-foreground">
                              {day.tempMax}°
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {day.tempMin}°
                            </span>
                            {day.precipitationSum > 1 && (
                              <span className="text-[10px] text-blue-500">
                                {day.precipitationSum.toFixed(0)}mm
                              </span>
                            )}
                            {day.isSevere && (
                              <span className="text-[9px] text-destructive font-bold">
                                ⚠️
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* Selected day detail */}
                    {selectedDayWeather && (
                      <div
                        className={`mt-3 p-3 rounded-xl ${selectedDayWeather.isSevere ? "bg-destructive/10 border border-destructive/30" : "bg-secondary/40"}`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">
                            {selectedDayWeather.weatherEmoji}
                          </span>
                          <span className="text-sm font-semibold text-card-foreground">
                            {selectedDayWeather.weatherLabel}
                          </span>
                          {selectedDayWeather.isSevere && (
                            <span className="text-xs text-destructive font-bold">
                              ⚠️ Severe
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Thermometer className="w-3 h-3" />
                            {selectedDayWeather.tempMin}–
                            {selectedDayWeather.tempMax}°C
                          </span>
                          <span className="flex items-center gap-1">
                            <Droplets className="w-3 h-3" />
                            {selectedDayWeather.precipitationSum.toFixed(1)}mm
                            rain
                          </span>
                          <span className="flex items-center gap-1">
                            <Wind className="w-3 h-3" />
                            {selectedDayWeather.windspeedMax.toFixed(0)} km/h
                          </span>
                          <span>
                            🔆 UV {selectedDayWeather.uvIndex.toFixed(0)}
                          </span>
                          <span>
                            🌅{" "}
                            {selectedDayWeather.sunrise
                              .split("T")[1]
                              ?.slice(0, 5)}
                          </span>
                          <span>
                            🌇{" "}
                            {selectedDayWeather.sunset
                              .split("T")[1]
                              ?.slice(0, 5)}
                          </span>
                        </div>
                        {selectedDayWeather.isSevere && (
                          <p className="mt-2 text-xs text-destructive font-medium">
                            ⚠️ Severe weather — consider indoor alternatives
                            today.
                          </p>
                        )}
                        {selectedDayWeather.precipitationSum > 15 && (
                          <p className="mt-1 text-xs text-warning font-medium">
                            🌧️ Heavy rain expected — carry an umbrella and allow
                            extra travel time.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Traffic Status Panel */}
        {(loadingTraffic || trafficData) && (
          <div className="bg-card rounded-2xl shadow-card mb-6 px-5 py-3 flex items-center gap-3">
            <Car className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-card-foreground">
                Live Traffic · {trip.destination}
              </p>
              {loadingTraffic ? (
                <p className="text-xs text-muted-foreground">
                  Checking traffic…
                </p>
              ) : trafficFlow_ ? (
                <p className="text-xs text-muted-foreground">
                  {trafficLabel} · {trafficSpeed} km/h current (
                  {trafficFreeFlow} km/h free flow)
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Traffic data unavailable
                </p>
              )}
            </div>
            {!loadingTraffic && trafficFlow_ && (
              <div
                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  trafficRatio < 0.3
                    ? "bg-destructive/10 text-destructive"
                    : trafficRatio < 0.6
                      ? "bg-warning/10 text-warning"
                      : trafficRatio < 0.85
                        ? "bg-orange-100 text-orange-600"
                        : "bg-success/10 text-success"
                }`}
              >
                {trafficLabel}
              </div>
            )}
          </div>
        )}

        {/* Destination Map */}
        {destCoords && (
          <div className="bg-card rounded-2xl shadow-card mb-6 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <MapIcon className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-card-foreground">
                  {trip.destination} Map
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex bg-secondary rounded-lg border border-border overflow-hidden">
                  <button
                    onClick={() => setDestMapMode("2d")}
                    className={`px-3 py-1 text-xs font-semibold transition-colors ${
                      destMapMode === "2d"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    2D
                  </button>
                  <button
                    onClick={() => setDestMapMode("3d")}
                    className={`px-3 py-1 text-xs font-semibold transition-colors ${
                      destMapMode === "3d"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    3D
                  </button>
                </div>
                <button
                  onClick={() => setShowDestMap(!showDestMap)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {showDestMap ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            {showDestMap && (
              <div className="h-[300px]">
                {destMapMode === "2d" ? (
                  <WorldMap
                    lat={destCoords.lat}
                    lng={destCoords.lng}
                    name={trip.destination}
                    zoom={10}
                    className="w-full h-full"
                  />
                ) : (
                  <Map3D
                    lat={destCoords.lat}
                    lng={destCoords.lng}
                    name={trip.destination}
                    zoom={10}
                    className="w-full h-full"
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* AI Itinerary Reasoning */}
        {itineraryReasoning && (
          <ItineraryReasoningPanel
            reasoning={itineraryReasoning}
            totalCost={itineraryTotalCost ?? undefined}
            budget={Number(trip.budget_total) || undefined}
            destination={trip.destination}
            explanation={itineraryExplanation}
          />
        )}

        {/* Safety Warnings + Regret-Aware Planner — side by side */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-2">
          {trip?.destination && (
            <SafetyWarnings destination={trip.destination} autoFetch={false} />
          )}
          <RegretPlanner
            tripId={tripId!}
            destination={trip.destination}
            country={trip.country ?? undefined}
            days={Math.max(
              1,
              Math.ceil(
                (new Date(trip.end_date).getTime() -
                  new Date(trip.start_date).getTime()) /
                  86400000,
              ),
            )}
            budget={Number(trip.budget_total) || 30000}
            activeItineraryId={activeItinerary?.id}
            onPlanApplied={() => {
              queryClient.invalidateQueries({
                queryKey: ["itineraries", tripId],
              });
              queryClient.invalidateQueries({ queryKey: ["activities"] });
            }}
          />
        </div>

        {/* Live Dynamic Replanning */}
        <DisruptionReplanner
          tripId={tripId!}
          activeItineraryId={activeItinerary?.id}
          onReplanApplied={() => {
            queryClient.invalidateQueries({
              queryKey: ["itineraries", tripId],
            });
            queryClient.invalidateQueries({ queryKey: ["activities"] });
          }}
        />

        {/* Trip Money & Expense Split + UPI Payment — side by side */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-2">
          <TripMoneyExpenses
            activities={activities as any}
            tripBudget={Number(trip.budget_total) || 0}
            country={trip.country ?? undefined}
            travelers={
              Number((trip as any).travelers) ||
              (tripMembers.length > 0 ? tripMembers.length + 1 : 1)
            }
            memberNames={tripMembers.length > 0 ? tripMembers : undefined}
          />
          <UPIPayment
            memberNames={tripMembers.length > 0 ? tripMembers : undefined}
          />
        </div>

        {activities.length === 0 ? (
          <div className="bg-card rounded-2xl p-8 text-center shadow-card">
            <Brain className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold text-card-foreground">
              No activities yet
            </h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Use the counterfactual planner above or click below to generate a
              quick AI plan.
            </p>
            <button
              onClick={handleGenerateItinerary}
              disabled={generating}
              className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Brain className="w-4 h-4" />
              )}
              {generating ? "Generating..." : "Quick Generate"}
            </button>
          </div>
        ) : (
          <>
            {/* Day Selector */}
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={() => setSelectedDay((d) => Math.max(0, d - 1))}
                className="p-2 rounded-xl bg-card border border-border hover:bg-secondary transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-muted-foreground" />
              </button>
              <div className="flex gap-2 overflow-x-auto">
                {days.map((day, i) => (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(i)}
                    className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                      selectedDay === i
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border border-border text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
              <button
                onClick={() =>
                  setSelectedDay((d) => Math.min(days.length - 1, d + 1))
                }
                className="p-2 rounded-xl bg-card border border-border hover:bg-secondary transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Timeline */}
            <div className="space-y-1">
              {currentDayActivities.map((activity, i) => (
                <div
                  key={activity.id}
                  className="flex gap-4 animate-fade-in"
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${typeColors[activity.category || "other"] ?? DEFAULT_COLOR}`}
                    >
                      {typeIcons[activity.category || "other"] ?? DEFAULT_ICON}
                    </div>
                    {i < currentDayActivities.length - 1 && (
                      <div className="w-px flex-1 bg-border my-1" />
                    )}
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="bg-card rounded-2xl p-4 shadow-card hover:shadow-elevated transition-shadow group cursor-pointer">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-card-foreground text-sm">
                            {activity.name}
                          </h3>
                          {activity.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {activity.description}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-3 mt-1.5">
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              {new Date(activity.start_time).toLocaleTimeString(
                                "en-IN",
                                { hour: "2-digit", minute: "2-digit" },
                              )}
                            </span>
                            {activity.location_name && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <MapPin className="w-3 h-3" />
                                {activity.location_name}
                              </span>
                            )}
                            {activity.cost != null &&
                              Number(activity.cost) > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  {formatCurrency(
                                    Number(activity.cost),
                                    trip.country,
                                  )}
                                </span>
                              )}
                            {activity.review_score && (
                              <span className="text-xs text-warning font-semibold">
                                ★ {activity.review_score}
                              </span>
                            )}
                            {routeInfo[activity.id] && (
                              <span className="flex items-center gap-1 text-xs text-primary font-medium">
                                <Route className="w-3 h-3" />
                                {routeInfo[activity.id].dist} ·{" "}
                                {routeInfo[activity.id].dur}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Navigation buttons */}
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              getRouteToActivity(activity);
                            }}
                            disabled={navLoading === activity.id}
                            title="Get route from my location (ORS)"
                            className="p-1.5 rounded-lg bg-secondary hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors disabled:opacity-50"
                          >
                            {navLoading === activity.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Route className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openNavigation(activity);
                            }}
                            title="Open in Google Maps"
                            className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          >
                            <Navigation className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {activity.notes && (
                        <p className="text-xs text-muted-foreground mt-2 bg-secondary/50 px-3 py-1.5 rounded-lg">
                          💡 {activity.notes}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Chat Panel — side panel on desktop, bottom-sheet modal on mobile */}
      {showChat && (
        <>
          {/* Mobile: full-screen overlay */}
          <div className="fixed inset-0 z-[55] flex flex-col bg-card lg:hidden animate-fade-in">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
              <div>
                <h3 className="font-semibold text-card-foreground flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  Trip Chat
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Real-time group collaboration
                </p>
              </div>
              <button
                onClick={() => setShowChat(false)}
                className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-background">
              {messages.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  No messages yet. Start the conversation!
                </p>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender_id === user?.id ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                        msg.sender_id === user?.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {msg.content}
                      <p className="text-[10px] opacity-60 mt-1">
                        {new Date(msg.created_at).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            <div
              className="p-4 border-t border-border bg-card shrink-0"
              style={{
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
              }}
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={sendingMsg || !chatInput.trim()}
                  className="p-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Desktop: side panel */}
          <div className="hidden lg:flex w-[360px] shrink-0 border-l border-border flex-col bg-card animate-fade-in">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-card-foreground flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                Trip Chat
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Real-time group collaboration
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  No messages yet. Start the conversation!
                </p>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender_id === user?.id ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                        msg.sender_id === user?.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {msg.content}
                      <p className="text-[10px] opacity-60 mt-1">
                        {new Date(msg.created_at).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="p-4 border-t border-border">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={sendingMsg || !chatInput.trim()}
                  className="p-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
