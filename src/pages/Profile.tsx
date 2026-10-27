import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Calendar,
  Camera,
  CheckCircle2,
  Globe,
  Heart,
  ImagePlus,
  Loader2,
  Mail,
  MapPin,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Utensils,
  User,
  Wallet,
  Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTrips } from "@/hooks/useTrips";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { formatMoney, formatMoneyTotals } from "@/lib/currency";
import { useLanguage } from "@/hooks/useLanguage";
import { errorMessage } from "@/lib/errors";
import AIProviderSettings from "@/components/AIProviderSettings";
import TravelPreferencesForm from "@/components/TravelPreferencesForm";

type ProfileRecord = Database["public"]["Tables"]["profiles"]["Row"];
type ProfilePreferences = Record<string, unknown>;

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_AVATAR_UPLOAD_BYTES = 2 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

async function makeAvatarImage(file: File): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.src = objectUrl;
    if (typeof image.decode === "function") {
      await image.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("This image could not be opened."));
      });
    }

    const side = Math.min(image.naturalWidth, image.naturalHeight);
    if (!side) throw new Error("This image has no readable dimensions.");

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image editing is unavailable in this browser.");

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error("This image could not be prepared for upload.")),
        "image/webp",
        0.86,
      );
    });

    if (blob.size > MAX_AVATAR_UPLOAD_BYTES) {
      throw new Error("This image is still too large after resizing. Try a smaller photo.");
    }
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getAvatarObjectPath(publicUrl: string | null | undefined, userId: string) {
  if (!publicUrl) return null;
  try {
    const url = new URL(publicUrl);
    const marker = "/storage/v1/object/public/profile-avatars/";
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    const path = url.pathname.slice(markerIndex + marker.length)
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
    return path.startsWith(`${userId}/`) ? path : null;
  } catch {
    return null;
  }
}

function displayDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(date);
}

function asPreferences(value: unknown): ProfilePreferences {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as ProfilePreferences
    : {};
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "A";
}

export default function Profile() {
  const { user } = useAuth();
  const { data: trips = [] } = useTrips();
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const photoInput = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoRemoving, setPhotoRemoving] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editHomeCity, setEditHomeCity] = useState("");
  const [editHomeCountry, setEditHomeCountry] = useState("");

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();
        if (error) throw error;
        if (cancelled) return;

        setProfile(data);
        setEditName(data?.name || "");
        setEditPhone(data?.phone_number || "");
        setEditBio(data?.bio || "");
        setEditHomeCity(data?.home_city || "");
        setEditHomeCountry(data?.home_country || "");
      } catch (error: unknown) {
        if (!cancelled) {
          toast({
            title: "Could not load your profile",
            description: errorMessage(error),
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user, toast]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;

    const name = editName.trim();
    if (!name) {
      toast({
        title: "Add your name",
        description: "Your name is required for your travel profile.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          name,
          phone_number: editPhone.trim() || null,
          avatar_url: profile?.avatar_url ?? null,
          bio: editBio.trim(),
          home_city: editHomeCity.trim() || null,
          home_country: editHomeCountry.trim() || null,
        }, { onConflict: "id" })
        .select("*")
        .single();
      if (error) throw error;

      setProfile(data);
      void queryClient.invalidateQueries({ queryKey: ["profile-summary", user.id] });
      void queryClient.invalidateQueries({ queryKey: ["all-profiles"] });
      void queryClient.invalidateQueries({ queryKey: ["friend-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["community-members"] });
      toast({
        title: "Profile saved",
        description: "Your account and travel details are up to date.",
      });
    } catch (error: unknown) {
      toast({
        title: "Could not save your profile",
        description: errorMessage(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user) return;

    if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
      toast({
        title: "Choose a supported image",
        description: "Use a JPEG, PNG, WebP, or GIF photo.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast({
        title: "Photo is too large",
        description: "Choose an image under 8 MB. It will be resized before upload.",
        variant: "destructive",
      });
      return;
    }

    setPhotoUploading(true);
    let uploadedPath: string | null = null;
    try {
      const image = await makeAvatarImage(file);
      const extension = image.type === "image/webp" ? "webp" : "png";
      const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { data: uploaded, error: uploadError } = await supabase.storage
        .from("profile-avatars")
        .upload(path, image, {
          contentType: image.type,
          cacheControl: "31536000",
          upsert: false,
        });
      if (uploadError) throw uploadError;
      uploadedPath = uploaded.path;

      const { data: publicUrlData } = supabase.storage
        .from("profile-avatars")
        .getPublicUrl(uploaded.path);
      const { data, error: profileError } = await supabase
        .from("profiles")
        .upsert({ id: user.id, avatar_url: publicUrlData.publicUrl }, { onConflict: "id" })
        .select("*")
        .single();
      if (profileError) throw profileError;

      setProfile(data);
      void queryClient.invalidateQueries({ queryKey: ["profile-summary", user.id] });
      void queryClient.invalidateQueries({ queryKey: ["all-profiles"] });
      void queryClient.invalidateQueries({ queryKey: ["friend-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["community-members"] });
      const oldPath = getAvatarObjectPath(profile?.avatar_url, user.id);
      if (oldPath && oldPath !== uploaded.path) {
        try {
          await supabase.storage.from("profile-avatars").remove([oldPath]);
        } catch {
          // A failed cleanup leaves only an unused old image; the new avatar is live.
        }
      }
      toast({ title: "Profile photo updated" });
    } catch (error: unknown) {
      if (uploadedPath) {
        try {
          await supabase.storage.from("profile-avatars").remove([uploadedPath]);
        } catch {
          // Keep the original save error visible if storage cleanup also fails.
        }
      }
      toast({
        title: "Could not update your photo",
        description: errorMessage(error),
        variant: "destructive",
      });
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!user || !profile?.avatar_url) return;
    setPhotoRemoving(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", user.id)
        .select("*")
        .single();
      if (error) throw error;
      setProfile(data);
      void queryClient.invalidateQueries({ queryKey: ["profile-summary", user.id] });
      void queryClient.invalidateQueries({ queryKey: ["all-profiles"] });
      void queryClient.invalidateQueries({ queryKey: ["friend-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["community-members"] });

      const oldPath = getAvatarObjectPath(profile.avatar_url, user.id);
      if (oldPath) {
        try {
          await supabase.storage.from("profile-avatars").remove([oldPath]);
        } catch {
          // The profile no longer references this object, so a missed cleanup
          // does not affect the account or display.
        }
      }
      toast({ title: "Profile photo removed" });
    } catch (error: unknown) {
      toast({
        title: "Could not remove your photo",
        description: errorMessage(error),
        variant: "destructive",
      });
    } finally {
      setPhotoRemoving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
        <span className="ml-2 text-sm text-muted-foreground">{t("loading")}</span>
      </div>
    );
  }

  const preferences = asPreferences(profile?.preferences);
  const personality = asPreferences(profile?.travel_personality);
  const interests = Array.isArray(preferences.interests)
    ? preferences.interests.filter((item): item is string => typeof item === "string")
    : [];
  const totalBudget = trips.reduce((sum, trip) => sum + Number(trip.budget_total || 0), 0);
  const destinations = new Set(trips.map((trip) => trip.destination).filter(Boolean));
  const countries = new Set(trips.map((trip) => trip.country).filter(Boolean));
  const totalSpentDisplay = totalBudget > 0
    ? formatMoneyTotals(trips.map((trip) => ({
        amount: Number(trip.budget_total || 0),
        currency: trip.currency,
      })))
    : formatMoney(0, "INR");
  const displayName = editName.trim() || user?.email?.split("@")[0] || "Radiator Routes traveller";
  const stats = [
    { label: "Trips planned", value: trips.length, icon: Calendar, tone: "text-primary bg-primary/10" },
    { label: "Destinations", value: destinations.size, icon: MapPin, tone: "text-success bg-success/10" },
    { label: "Countries", value: countries.size, icon: Globe, tone: "text-warning bg-warning/10" },
    { label: "Planned budget", value: totalSpentDisplay, icon: Wallet, tone: "text-accent bg-accent/10" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 pb-8 md:p-6 md:pb-10">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Your account</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground md:text-3xl">Travel profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your identity, travel style, and the details Radiator Routes uses to plan with you.</p>
      </header>

      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-card" aria-labelledby="profile-overview-heading">
        <div className="h-28 bg-gradient-to-r from-primary/90 via-orange-400 to-amber-300 md:h-36" />
        <div className="px-5 pb-5 md:px-8 md:pb-7">
          <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-3xl border-4 border-card bg-primary/10 shadow-lg md:h-28 md:w-28">
                {profile?.avatar_url && (
                  <img
                    src={profile.avatar_url}
                    alt={`${displayName}'s profile`}
                    className="absolute inset-0 z-10 h-full w-full object-cover"
                    onError={(event) => { event.currentTarget.style.display = "none"; }}
                  />
                )}
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 to-amber-100 text-3xl font-bold text-primary">
                  {getInitials(displayName)}
                </div>
                <button
                  type="button"
                  onClick={() => photoInput.current?.click()}
                  disabled={photoUploading || photoRemoving}
                  className="absolute bottom-1.5 right-1.5 z-20 flex h-8 w-8 items-center justify-center rounded-xl border-2 border-card bg-primary text-primary-foreground shadow-md transition hover:scale-105 disabled:opacity-60"
                  aria-label="Choose a profile photo"
                  title="Choose a profile photo"
                >
                  {photoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                </button>
              </div>
              <div className="min-w-0 pb-1">
                <h2 id="profile-overview-heading" className="truncate text-xl font-bold text-foreground md:text-2xl">{displayName}</h2>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {user?.email || "Email unavailable"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 sm:justify-end">
              <input
                ref={photoInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={handlePhotoSelected}
                aria-label="Upload profile photo"
              />
              <button
                type="button"
                onClick={() => photoInput.current?.click()}
                disabled={photoUploading || photoRemoving}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {photoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                {photoUploading ? "Uploading…" : profile?.avatar_url ? "Change photo" : "Add profile photo"}
              </button>
              {profile?.avatar_url && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  disabled={photoUploading || photoRemoving}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium text-muted-foreground transition hover:bg-secondary disabled:opacity-50"
                >
                  {photoRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Remove
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />
              {user?.email_confirmed_at ? "Email verified" : "Radiator Routes account"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
              Member since {displayDate(profile?.created_at || user?.created_at)}
            </span>
            {(profile?.home_city || profile?.home_country) && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                {[profile.home_city, profile.home_country].filter(Boolean).join(", ")}
              </span>
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">JPEG, PNG, WebP, or GIF · up to 8 MB · cropped square and resized before upload. Profile photos are publicly accessible so trip members can view them.</p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Travel summary">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </div>
            <p className="truncate text-lg font-bold text-card-foreground md:text-xl">{value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-card md:p-6" aria-labelledby="about-heading">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <User className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="about-heading" className="font-semibold text-card-foreground">About you</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Help your travel group recognize you and give Radiator Routes a little context.</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Full name <span className="text-destructive" aria-hidden="true">*</span>
              <input
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                autoComplete="name"
                maxLength={100}
                required
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-normal text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                placeholder="Your name"
              />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Phone number
              <input
                type="tel"
                value={editPhone}
                onChange={(event) => setEditPhone(event.target.value)}
                autoComplete="tel"
                maxLength={30}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-normal text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                placeholder="Include your country code"
              />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Home city
              <input
                value={editHomeCity}
                onChange={(event) => setEditHomeCity(event.target.value)}
                autoComplete="address-level2"
                maxLength={80}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-normal text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                placeholder="e.g. Mumbai"
              />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Home country
              <input
                value={editHomeCountry}
                onChange={(event) => setEditHomeCountry(event.target.value)}
                autoComplete="country-name"
                maxLength={80}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-normal text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                placeholder="e.g. India"
              />
            </label>
          </div>

          <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
            A little about you
            <textarea
              value={editBio}
              onChange={(event) => setEditBio(event.target.value)}
              maxLength={280}
              rows={3}
              className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-normal text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder="What do you enjoy about travelling? What should your travel companions know?"
            />
            <span className="block text-right text-[11px] font-normal">{editBio.length}/280</span>
          </label>

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="mr-1">{user?.email || "Email unavailable"}</span>
              {user?.email_confirmed_at && <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-label="Verified email" />}
            </div>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving…" : "Save profile"}
            </button>
          </div>
        </form>
      </section>

      <TravelPreferencesForm
        country={trips[0]?.country ?? profile?.home_country ?? undefined}
        onSaved={() => {
          setProfile((previous) => previous ? { ...previous } : previous);
        }}
      />

      <section className="rounded-2xl border border-border bg-card p-5 shadow-card md:p-6" aria-labelledby="travel-style-heading">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
            <Heart className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="travel-style-heading" className="font-semibold text-card-foreground">Your travel style</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">A quick summary of preferences Radiator Routes has learned from you.</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Food", value: preferences.food_preference, icon: Utensils },
            { label: "Stay", value: preferences.accommodation, icon: Heart },
            { label: "Pace", value: preferences.pace, icon: Zap },
          ].filter((item) => typeof item.value === "string" && item.value.length > 0).map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl bg-secondary/50 p-3">
              <Icon className="mb-2 h-4 w-4 text-primary" aria-hidden="true" />
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className="mt-0.5 text-sm font-semibold capitalize text-card-foreground">{value as string}</p>
            </div>
          ))}
          {interests.length > 0 && (
            <div className="rounded-xl bg-secondary/50 p-3 sm:col-span-2 lg:col-span-1">
              <Camera className="mb-2 h-4 w-4 text-accent" aria-hidden="true" />
              <p className="text-[11px] text-muted-foreground">Interests</p>
              <p className="mt-0.5 text-sm font-semibold capitalize text-card-foreground">{interests.join(", ")}</p>
            </div>
          )}
          {Object.keys(personality).length > 0 && Object.entries(personality).slice(0, 4).map(([key, value]) => (
            <div key={key} className="rounded-xl bg-secondary/50 p-3">
              <Sparkles className="mb-2 h-4 w-4 text-primary" aria-hidden="true" />
              <p className="text-[11px] capitalize text-muted-foreground">{key.replace(/_/g, " ")}</p>
              <p className="mt-0.5 text-sm font-semibold capitalize text-card-foreground">{String(value)}</p>
            </div>
          ))}
        </div>
        {Object.keys(preferences).length === 0 && Object.keys(personality).length === 0 && (
          <p className="rounded-xl bg-secondary/40 p-4 text-sm text-muted-foreground">
            Your travel style will appear here as you plan trips and save preferences.
          </p>
        )}
      </section>

      <AIProviderSettings />

      <section className="rounded-2xl border border-border bg-card p-5 shadow-card md:p-6" aria-labelledby="trip-history-heading">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Calendar className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="trip-history-heading" className="font-semibold text-card-foreground">Trip history</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Your saved plans and the places you have explored.</p>
            </div>
          </div>
          <Link to="/itinerary" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline">
            All trips <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        {trips.length > 0 ? (
          <div className="divide-y divide-border">
            {trips.map((trip) => (
              <Link
                key={trip.id}
                to={`/itinerary/${trip.id}`}
                className="group flex items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <MapPin className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-card-foreground group-hover:text-primary">{trip.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[trip.destination, trip.country].filter(Boolean).join(", ")} · {displayDate(trip.start_date)}
                  </p>
                </div>
                <p className="shrink-0 text-xs font-semibold text-card-foreground">
                  {formatMoney(Number(trip.budget_total || 0), trip.currency)}
                </p>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-xl bg-secondary/40 p-5 text-center">
            <p className="text-sm font-medium text-card-foreground">Your next adventure starts here.</p>
            <p className="mt-1 text-xs text-muted-foreground">Create a trip and it will show up in your history.</p>
            <Link to="/itinerary" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
              Plan a trip <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
