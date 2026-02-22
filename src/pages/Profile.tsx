import { useState, useEffect } from "react";
import {
  User,
  MapPin,
  Calendar,
  Wallet,
  Utensils,
  Heart,
  Zap,
  Globe,
  Camera,
  Loader2,
  Save,
  Mail,
  Phone,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTrips } from "@/hooks/useTrips";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/currency";
import { useLanguage } from "@/hooks/useLanguage";

export default function Profile() {
  const { user } = useAuth();
  const { data: trips = [] } = useTrips();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (data) {
        setProfile(data);
        setEditName(data.name || "");
        setEditPhone(data.phone_number || "");
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          name: editName,
          phone_number: editPhone || null,
        })
        .eq("id", user.id);
      if (error) throw error;
      setProfile((prev: any) => ({
        ...prev,
        name: editName,
        phone_number: editPhone,
      }));
      toast({ title: "Profile updated! ✅" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
        <span className="ml-2 text-sm text-muted-foreground">
          {t("loading")}
        </span>
      </div>
    );
  }

  const prefs = profile?.preferences || {};
  const personality = profile?.travel_personality || {};
  const history = profile?.travel_history || [];
  const totalBudget = trips.reduce(
    (sum, t) => sum + Number(t.budget_total || 0),
    0,
  );
  const destinations = new Set(trips.map((t) => t.destination));
  const countries = new Set(
    trips.filter((t) => t.country).map((t) => t.country),
  );

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header Card */}
      <div className="bg-card rounded-2xl p-6 shadow-card">
        <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-5">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl sm:text-3xl font-bold text-primary shrink-0">
            {(profile?.name || "?")[0].toUpperCase()}
          </div>
          <div className="flex-1 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {t("profile")}
                </label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Phone
                </label>
                <input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Mail className="w-3.5 h-3.5" />
                {user?.email}
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {t("save")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[
          {
            label: t("trips"),
            value: trips.length,
            icon: MapPin,
            color: "text-primary",
          },
          {
            label: t("destinations"),
            value: destinations.size,
            icon: Globe,
            color: "text-success",
          },
          {
            label: "Countries",
            value: countries.size,
            icon: Globe,
            color: "text-warning",
          },
          {
            label: t("budget"),
            value:
              totalBudget > 0
                ? formatCurrency(totalBudget, trips[0]?.country)
                : "₹0",
            icon: Wallet,
            color: "text-accent",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-card rounded-2xl p-3 md:p-4 shadow-card text-center"
          >
            <stat.icon
              className={`w-4 h-4 md:w-5 md:h-5 mx-auto mb-1.5 md:mb-2 ${stat.color}`}
            />
            <p className="text-base md:text-lg font-bold text-card-foreground">
              {stat.value}
            </p>
            <p className="text-[11px] md:text-xs text-muted-foreground">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* Preferences */}
      <div className="bg-card rounded-2xl p-5 shadow-card">
        <h3 className="font-semibold text-card-foreground mb-3 md:mb-4 flex items-center gap-2">
          <Heart className="w-4 h-4 text-primary" /> Travel Preferences
        </h3>
        {Object.keys(prefs).length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            {prefs.food_preference && (
              <div className="p-3 rounded-xl bg-secondary/50">
                <Utensils className="w-4 h-4 text-warning mb-1" />
                <p className="text-xs text-muted-foreground">Food</p>
                <p className="text-sm font-semibold text-card-foreground capitalize">
                  {prefs.food_preference}
                </p>
              </div>
            )}
            {prefs.accommodation && (
              <div className="p-3 rounded-xl bg-secondary/50">
                <Heart className="w-4 h-4 text-primary mb-1" />
                <p className="text-xs text-muted-foreground">Stay</p>
                <p className="text-sm font-semibold text-card-foreground capitalize">
                  {prefs.accommodation}
                </p>
              </div>
            )}
            {prefs.pace && (
              <div className="p-3 rounded-xl bg-secondary/50">
                <Zap className="w-4 h-4 text-success mb-1" />
                <p className="text-xs text-muted-foreground">Pace</p>
                <p className="text-sm font-semibold text-card-foreground capitalize">
                  {prefs.pace}
                </p>
              </div>
            )}
            {prefs.interests && prefs.interests.length > 0 && (
              <div className="p-3 rounded-xl bg-secondary/50 col-span-1">
                <Camera className="w-4 h-4 text-accent mb-1" />
                <p className="text-xs text-muted-foreground">Interests</p>
                <p className="text-sm font-semibold text-card-foreground capitalize">
                  {prefs.interests.join(", ")}
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No preferences set yet. {t("createTrip")} to set them!
          </p>
        )}
      </div>

      {/* Personality */}
      {Object.keys(personality).length > 0 && (
        <div className="bg-card rounded-2xl p-5 shadow-card">
          <h3 className="font-semibold text-card-foreground mb-3 md:mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-primary" /> Travel Personality
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
            {Object.entries(personality).map(([key, value]) => (
              <div key={key} className="p-3 rounded-xl bg-secondary/50">
                <p className="text-xs text-muted-foreground capitalize">
                  {key.replace(/_/g, " ")}
                </p>
                <p className="text-sm font-semibold text-card-foreground">
                  {String(value)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trip History */}
      <div className="bg-card rounded-2xl p-5 shadow-card">
        <h3 className="font-semibold text-card-foreground mb-3 md:mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" /> {t("trips")} History
        </h3>
        {trips.length > 0 ? (
          <div className="space-y-3">
            {trips.map((trip) => (
              <div
                key={trip.id}
                className="flex items-center gap-4 p-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-card-foreground truncate">
                    {trip.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {trip.destination}
                    {trip.country ? `, ${trip.country}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-card-foreground">
                    {formatCurrency(Number(trip.budget_total), trip.country)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(trip.start_date).toLocaleDateString("en-US", {
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("noResults")} — {t("createTrip")}!
          </p>
        )}
      </div>
    </div>
  );
}
