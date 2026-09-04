import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MapPin, Loader2, CheckCircle, XCircle, LogIn } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useSeo } from "@/hooks/useSeo";
import { errorMessage } from "@/lib/errors";

export default function JoinTrip() {
  const { inviteCode } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<any>(null);
  const [trip, setTrip] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "sent" | "already" | "error">("idle");

  // Names the tab and the share sheet once the invite resolves. Kept in a hook
  // because each of this page's four branches (loading, invalid, signed out,
  // signed in) should be labelled.
  //
  // The route registry marks /join/:inviteCode noindex — an invite link is
  // private. Note this only reaches JS-capable clients, so the link preview a
  // recipient sees in WhatsApp or Slack is still the generic site card from
  // index.html. Giving those scrapers the trip name would take a server-side
  // renderer for this route; see docs/BACKLOG.md.
  useSeo({
    title: trip?.name ? `Join ${trip.name}` : undefined,
    description: trip?.name
      ? `You have been invited to join ${trip.name}${trip.destination ? ` in ${trip.destination}` : ""} on Atlas AI.`
      : undefined,
  });

  useEffect(() => {
    const loadInvite = async () => {
      if (!inviteCode) return;
      // Fetch invite - need to use a public approach since user might not be a member
      // We'll use an edge function or RPC for this
      // For now, if user is logged in, we try to get the invite info
      const { data, error } = await supabase
        .from("trip_invites")
        .select("*, trips(name, destination, start_date, end_date)")
        .eq("invite_code", inviteCode)
        .single();

      if (error || !data) {
        setLoading(false);
        return;
      }

      setInvite(data);
      setTrip((data as any).trips);
      setLoading(false);
    };
    loadInvite();
  }, [inviteCode]);

  const handleJoinRequest = async () => {
    if (!user || !invite) return;
    setSubmitting(true);
    try {
      // Check if already a member
      const { data: existing } = await supabase
        .from("trip_memberships")
        .select("id")
        .eq("trip_id", invite.trip_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        setStatus("already");
        toast({ title: "You're already a member of this trip!" });
        return;
      }

      // Create join request
      const { error } = await supabase
        .from("trip_join_requests")
        .insert({ trip_id: invite.trip_id, user_id: user.id, invite_id: invite.id });

      if (error) {
        if (errorMessage(error).includes("duplicate")) {
          setStatus("already");
          toast({ title: "You already have a pending request for this trip." });
        } else {
          throw error;
        }
        return;
      }

      setStatus("sent");
      toast({ title: "Join request sent! ✅", description: "The trip organizer will review your request." });
    } catch (error: unknown) {
      setStatus("error");
      toast({ title: "Error", description: errorMessage(error), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="bg-card rounded-2xl p-8 shadow-card text-center max-w-md">
          <XCircle className="w-12 h-12 text-destructive mx-auto mb-3" />
          <h1 className="text-xl font-bold text-card-foreground mb-2">Invalid Invite</h1>
          <p className="text-sm text-muted-foreground mb-4">This invite link is invalid or has expired.</p>
          <button onClick={() => navigate("/")} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="bg-card rounded-2xl p-8 shadow-card text-center max-w-md">
          <MapPin className="w-12 h-12 text-primary mx-auto mb-3" />
          <h1 className="text-xl font-bold text-card-foreground mb-2">Join Trip: {trip?.name}</h1>
          <p className="text-sm text-muted-foreground mb-1">{trip?.destination}</p>
          <p className="text-xs text-muted-foreground mb-6">
            {trip?.start_date && new Date(trip.start_date).toLocaleDateString()} — {trip?.end_date && new Date(trip.end_date).toLocaleDateString()}
          </p>
          <p className="text-sm text-muted-foreground mb-4">Sign in or create an account to join this trip.</p>
          <button
            onClick={() => navigate(`/auth?redirect=/join/${inviteCode}`)}
            className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 inline-flex items-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            Sign In to Join
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="bg-card rounded-2xl p-8 shadow-card text-center max-w-md w-full">
        <MapPin className="w-12 h-12 text-primary mx-auto mb-3" />
        <h1 className="text-xl font-bold text-card-foreground mb-2">{trip?.name}</h1>
        <p className="text-sm text-muted-foreground mb-1">{trip?.destination}</p>
        <p className="text-xs text-muted-foreground mb-6">
          {trip?.start_date && new Date(trip.start_date).toLocaleDateString()} — {trip?.end_date && new Date(trip.end_date).toLocaleDateString()}
        </p>

        {status === "sent" ? (
          <div>
            <CheckCircle className="w-10 h-10 text-success mx-auto mb-3" />
            <p className="text-sm font-semibold text-card-foreground">Request Sent!</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">The trip organizer will accept or reject your request.</p>
            <button onClick={() => navigate("/dashboard")} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">
              Go to Dashboard
            </button>
          </div>
        ) : status === "already" ? (
          <div>
            <CheckCircle className="w-10 h-10 text-success mx-auto mb-3" />
            <p className="text-sm font-semibold text-card-foreground">Already Joined!</p>
            <button onClick={() => navigate("/dashboard")} className="mt-4 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">
              Go to Dashboard
            </button>
          </div>
        ) : (
          <button
            onClick={handleJoinRequest}
            disabled={submitting}
            className="w-full px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            Request to Join Trip
          </button>
        )}
      </div>
    </div>
  );
}
