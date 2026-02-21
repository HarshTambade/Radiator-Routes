import {
  Search,
  Mic,
  MicOff,
  Plus,
  MapPin,
  Calendar,
  Loader2,
  Users,
  User,
  Globe,
  Trash2,
  WifiOff,
} from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { useAuth } from "@/hooks/useAuth";
import { useTrips } from "@/hooks/useTrips";
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import TravelMemory from "@/components/TravelMemory";
import TripCreationChat from "@/components/TripCreationChat";
import { useOnlineStatus } from "@/hooks/useOfflineTrip";
import { getAllOfflineTrips } from "@/services/offlineTrip";

import destinationAgra from "@/assets/destination-agra.jpg";
import destinationGoa from "@/assets/destination-goa.jpg";
import destinationKerala from "@/assets/destination-kerala.jpg";
import travelBeach from "@/assets/travel-beach.jpg";
import travelBoat from "@/assets/travel-boat.jpg";
import travelOcean from "@/assets/travel-ocean.jpg";

const tripImages = [
  destinationAgra,
  destinationGoa,
  destinationKerala,
  travelBeach,
  travelBoat,
  travelOcean,
];

const tripTypes = [
  {
    value: "solo",
    label: "Solo Plan",
    icon: User,
    description: "Travel alone at your own pace",
  },
  {
    value: "group",
    label: "Group Plan",
    icon: Users,
    description: "Plan with friends & family",
  },
  {
    value: "random",
    label: "Meet Travelers",
    icon: Globe,
    description: "Match with random travelers",
  },
];

// Local date helpers to avoid UTC shift
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(start: string, end: string): number {
  const s = parseLocalDate(start);
  const e = parseLocalDate(end);
  return Math.round((e.getTime() - s.getTime()) / 86400000);
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data: trips = [], isLoading } = useTrips();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showNewTrip, setShowNewTrip] = useState(false);
  const [selectedTripType, setSelectedTripType] = useState("solo");
  const isOnline = useOnlineStatus();
  const [offlineTripIds, setOfflineTripIds] = useState<Set<string>>(new Set());

  // Load offline-saved trip IDs on mount
  useEffect(() => {
    getAllOfflineTrips().then((data) => {
      setOfflineTripIds(new Set(data.map((d) => d.tripId)));
    });
  }, []);

  const userName =
    user?.user_metadata?.name || user?.email?.split("@")[0] || "Traveler";

  const upcomingTrips = trips.filter(
    (t) =>
      parseLocalDate(t.start_date) > new Date() && t.status !== "completed",
  );

  const getDaysLeft = (dateStr: string) => {
    const target = parseLocalDate(dateStr);
    const now = new Date();
    // Normalize "now" to start of local day for accurate day count
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const diff = target.getTime() - todayStart.getTime();
    return Math.max(0, Math.ceil(diff / 86400000));
  };

  const getTripDuration = (startDate: string, endDate: string) => {
    const days = daysBetween(startDate, endDate);
    return days > 0 ? days : 1;
  };

  const handleDeleteTrip = async (
    tripId: string,
    tripName: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    if (!confirm(`Delete "${tripName}"? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from("trips").delete().eq("id", tripId);
      if (error) throw error;
      toast({
        title: "Trip deleted",
        description: `"${tripName}" has been removed.`,
      });
      queryClient.invalidateQueries({ queryKey: ["trips"] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 p-4 lg:p-6 min-h-screen lg:h-screen lg:overflow-hidden">
      <div className="flex-1 overflow-y-auto lg:pr-2 space-y-4 lg:space-y-6 min-w-0">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl lg:text-2xl font-bold text-foreground">
                Good Morning, {userName} 👋
              </h1>
              {/* Global online/offline indicator */}
              {!isOnline && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-warning/10 text-warning border border-warning/20">
                  <WifiOff className="w-3 h-3" />
                  Offline Mode
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">
              {isOnline
                ? "Plan your itinerary with us"
                : "Viewing cached data — some features unavailable offline"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search destinations..."
                className="pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm w-full sm:w-56 lg:w-64 focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-card"
              />
            </div>
          </div>
        </div>

        {/* New Trip Button */}
        {!showNewTrip && (
          <button
            onClick={() => setShowNewTrip(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity shadow-card"
          >
            <Plus className="w-4 h-4" />
            Create New Trip
          </button>
        )}

        {/* Interactive Trip Creation */}
        {showNewTrip && (
          <div className="space-y-4 animate-fade-in">
            {/* Trip Type Selector */}
            <div className="bg-card rounded-2xl p-4 shadow-card">
              <p className="text-sm font-medium text-card-foreground mb-3">
                Choose your travel style
              </p>
              <div className="grid grid-cols-3 gap-3">
                {tripTypes.map((type) => {
                  const Icon = type.icon;
                  return (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setSelectedTripType(type.value)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        selectedTripType === type.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30 bg-background"
                      }`}
                    >
                      <Icon
                        className={`w-5 h-5 mb-1.5 ${selectedTripType === type.value ? "text-primary" : "text-muted-foreground"}`}
                      />
                      <p
                        className={`text-sm font-semibold ${selectedTripType === type.value ? "text-primary" : "text-card-foreground"}`}
                      >
                        {type.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {type.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Chat-based creation */}
            <TripCreationChat
              onClose={() => setShowNewTrip(false)}
              tripType={selectedTripType}
            />
          </div>
        )}

        {/* Trips */}
        <div>
          <div className="flex items-center justify-between mb-3 lg:mb-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                My Trips
              </h2>
              <p className="text-sm text-muted-foreground">
                {trips.length === 0
                  ? "Create your first trip to get started!"
                  : `${trips.length} trip${trips.length !== 1 ? "s" : ""} planned`}
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : trips.length === 0 ? (
            <div className="bg-card rounded-2xl p-8 text-center shadow-card">
              <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-semibold text-card-foreground">
                No trips yet
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Create your first trip to start planning!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
              {trips.map((trip, idx) => {
                const duration = getTripDuration(
                  trip.start_date,
                  trip.end_date,
                );
                const daysLeft = getDaysLeft(trip.start_date);
                return (
                  <div
                    key={trip.id}
                    onClick={() => navigate(`/itinerary/${trip.id}`)}
                    className="bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-elevated transition-shadow cursor-pointer group"
                  >
                    <div className="relative h-28 sm:h-32 overflow-hidden">
                      <img
                        src={
                          trip.image_url || tripImages[idx % tripImages.length]
                        }
                        alt={trip.destination}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                      <div className="absolute bottom-3 right-3 bg-card/90 backdrop-blur-sm px-2.5 py-1 rounded-lg text-xs font-semibold">
                        <span className="text-foreground">
                          {daysLeft > 0 ? `${daysLeft} days left` : "Started"}
                        </span>
                      </div>
                      <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold text-primary-foreground ${
                            trip.status === "planning"
                              ? "bg-warning"
                              : trip.status === "booked"
                                ? "bg-success"
                                : trip.status === "ongoing"
                                  ? "bg-primary"
                                  : "bg-muted-foreground"
                          }`}
                        >
                          {trip.status}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-card/80 text-card-foreground backdrop-blur-sm">
                          {duration} day{duration > 1 ? "s" : ""}
                        </span>
                        {/* Offline saved badge */}
                        {offlineTripIds.has(trip.id) && (
                          <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-success/80 text-white backdrop-blur-sm">
                            <WifiOff className="w-2.5 h-2.5" />
                            Offline
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-card-foreground text-sm">
                          {trip.name}
                        </h3>
                        <button
                          onClick={(e) =>
                            handleDeleteTrip(trip.id, trip.name, e)
                          }
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete trip"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {trip.destination}
                        {trip.country ? `, ${trip.country}` : ""}
                      </p>
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-bold text-card-foreground">
                            {formatCurrency(
                              Number(trip.budget_total),
                              trip.country,
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          {parseLocalDate(trip.start_date).toLocaleDateString(
                            "en-US",
                            { day: "numeric", month: "short" },
                          )}
                          {" → "}
                          {parseLocalDate(trip.end_date).toLocaleDateString(
                            "en-US",
                            { day: "numeric", month: "short" },
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-full lg:w-[320px] xl:w-[340px] shrink-0 space-y-4 lg:space-y-6 lg:overflow-y-auto">
        {/* Quick Stats */}
        <div className="bg-card rounded-2xl p-4 lg:p-5 shadow-card">
          <h3 className="font-semibold text-card-foreground mb-3 lg:mb-4">
            Quick Stats
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-3 lg:gap-4">
            <div className="text-center p-3 rounded-xl bg-primary/5">
              <p className="text-xl lg:text-2xl font-bold text-primary">
                {trips.length}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Total Trips
              </p>
            </div>
            <div className="text-center p-3 rounded-xl bg-success/10">
              <p className="text-xl lg:text-2xl font-bold text-foreground">
                {upcomingTrips.length}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Upcoming</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-warning/10">
              <p className="text-base lg:text-lg font-bold text-foreground">
                {trips.length > 0
                  ? formatCurrency(
                      trips.reduce(
                        (sum, t) => sum + Number(t.budget_total || 0),
                        0,
                      ),
                      trips[0].country,
                    )
                  : "₹0"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Total Budget
              </p>
            </div>
            <div className="text-center p-3 rounded-xl bg-accent/10">
              <p className="text-xl lg:text-2xl font-bold text-foreground">
                {new Set(trips.map((t) => t.destination)).size}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Destinations
              </p>
            </div>
          </div>
        </div>

        {/* Upcoming Trip Preview */}
        {upcomingTrips.length > 0 && (
          <div className="bg-card rounded-2xl p-4 lg:p-5 shadow-card">
            <h3 className="font-semibold text-card-foreground mb-3">
              Next Trip
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-card-foreground">
                  {upcomingTrips[0].name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {upcomingTrips[0].destination}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 lg:gap-3">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Budget</p>
                  <p className="text-sm font-bold text-card-foreground">
                    {formatCurrency(
                      Number(upcomingTrips[0].budget_total),
                      upcomingTrips[0].country,
                    )}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Duration</p>
                  <p className="text-sm font-bold text-card-foreground">
                    {getTripDuration(
                      upcomingTrips[0].start_date,
                      upcomingTrips[0].end_date,
                    )}{" "}
                    days
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Days Left</p>
                  <p className="text-sm font-bold text-card-foreground">
                    {getDaysLeft(upcomingTrips[0].start_date)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Travel Memory */}
        <TravelMemory />
      </div>
    </div>
  );
}
