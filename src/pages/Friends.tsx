import { useState, useEffect, useRef } from "react";
import {
  Link as LinkIcon,
  UserPlus,
  Users as UsersIcon,
  Copy,
  Check,
  X,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  Search,
  MessageCircle,
  Send,
  Globe,
  UserCheck,
  ChevronLeft,
  Users2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTrips, useActivities, useItineraries } from "@/hooks/useTrips";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import CollaborativePlanner from "@/components/CollaborativePlanner";
import { useLanguage } from "@/hooks/useLanguage";

type Tab = "discover" | "friends" | "requests" | "invites" | "collaborate";

interface Profile {
  id: string;
  name: string;
  avatar_url: string | null;
  preferences: any;
}

interface DmMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  read: boolean;
}

function getInitials(name: string) {
  return (
    name
      .split(" ")
      .map((n) => n[0] || "")
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?"
  );
}

export default function Friends() {
  const { user } = useAuth();
  const { data: trips = [] } = useTrips();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const [activeTab, setActiveTab] = useState<Tab>("discover");
  const [collaborateTripId, setCollaborateTripId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [chatWithUser, setChatWithUser] = useState<Profile | null>(null);
  const [chatMsg, setChatMsg] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [dmMessages, setDmMessages] = useState<DmMessage[]>([]);
  const [loadingDm, setLoadingDm] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── All app users ──────────────────────────────────────────────────────────
  const { data: allUsers = [], isLoading: loadingUsers } = useQuery<Profile[]>({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, avatar_url, preferences")
        .neq("id", user!.id)
        .order("name");
      if (error) throw error;
      return (data as Profile[]) || [];
    },
    enabled: !!user,
  });

  // ── Friend requests ────────────────────────────────────────────────────────
  const { data: friendRequests = [] } = useQuery({
    queryKey: ["friend-requests", user?.id],
    queryFn: async () => {
      // Step 1: fetch raw friend requests without relying on FK joins
      const { data: requests, error } = await supabase
        .from("friend_requests")
        .select("*")
        .or(`sender_id.eq.${user!.id},receiver_id.eq.${user!.id}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!requests || requests.length === 0) return [];

      // Step 2: collect unique user IDs involved in those requests
      const userIds = Array.from(
        new Set(requests.flatMap((r: any) => [r.sender_id, r.receiver_id])),
      );

      // Step 3: fetch profiles for those IDs
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, avatar_url")
        .in("id", userIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      // Step 4: attach sender/receiver profile objects
      return requests.map((r: any) => ({
        ...r,
        sender: profileMap.get(r.sender_id) ?? {
          id: r.sender_id,
          name: "Unknown",
          avatar_url: null,
        },
        receiver: profileMap.get(r.receiver_id) ?? {
          id: r.receiver_id,
          name: "Unknown",
          avatar_url: null,
        },
      }));
    },
    enabled: !!user,
  });

  const acceptedFriends = (friendRequests as any[]).filter(
    (r) => r.status === "accepted",
  );

  // Build a map of friendId → list of trip names they've been added to
  const friendTripMap = new Map<string, string[]>();
  for (const trip of trips) {
    // We'll populate this below after trip-memberships query
  }
  const pendingReceived = (friendRequests as any[]).filter(
    (r) => r.status === "pending" && r.receiver_id === user?.id,
  );
  const pendingSent = (friendRequests as any[]).filter(
    (r) => r.status === "pending" && r.sender_id === user?.id,
  );

  const friendIds = new Set(
    acceptedFriends.map((r) =>
      r.sender_id === user?.id ? r.receiver_id : r.sender_id,
    ),
  );
  const sentToIds = new Set(pendingSent.map((r: any) => r.receiver_id));

  // ── Invite links ───────────────────────────────────────────────────────────
  const { data: invites = [] } = useQuery({
    queryKey: ["trip-invites", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_invites")
        .select("*, trips(name, destination)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // ── Join requests (for organizers) ─────────────────────────────────────────
  const { data: joinRequests = [] } = useQuery({
    queryKey: ["join-requests", user?.id],
    queryFn: async () => {
      const orgTrips = trips.filter((t) => t.organizer_id === user?.id);
      if (orgTrips.length === 0) return [];

      // Fetch join requests without relying on FK join for profiles
      const { data: requests, error } = await supabase
        .from("trip_join_requests")
        .select("*, trips(name, destination)")
        .in(
          "trip_id",
          orgTrips.map((t) => t.id),
        )
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!requests || requests.length === 0) return [];

      // Separately fetch profiles for the requesting users
      const requesterIds = Array.from(
        new Set((requests as any[]).map((r) => r.user_id)),
      );
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, avatar_url")
        .in("id", requesterIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      return (requests as any[]).map((r) => ({
        ...r,
        profiles: profileMap.get(r.user_id) ?? {
          name: "Unknown User",
          avatar_url: null,
        },
      }));
    },
    enabled: trips.length > 0 && !!user,
  });

  // ── My join requests ───────────────────────────────────────────────────────
  const { data: myRequests = [] } = useQuery({
    queryKey: ["my-join-requests", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_join_requests")
        .select("*, trips(name, destination)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // ── Send join request to a trip ───────────────────────────────────────────
  const sendJoinRequest = async (tripId: string, tripName: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from("trip_join_requests")
        .insert({ trip_id: tripId, user_id: user.id, status: "pending" });
      if (error) {
        if (
          error.message?.toLowerCase().includes("duplicate") ||
          error.code === "23505"
        ) {
          toast({
            title: "Already requested",
            description: "You already sent a join request for this trip.",
          });
          return;
        }
        throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["my-join-requests"] });
      toast({ title: `Join request sent for "${tripName}"! ✅` });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  // ── Load DMs ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chatWithUser || !user) return;
    setLoadingDm(true);
    const load = async () => {
      const { data } = await supabase
        .from("direct_messages")
        .select("*")
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${chatWithUser.id}),and(sender_id.eq.${chatWithUser.id},receiver_id.eq.${user.id})`,
        )
        .order("created_at", { ascending: true });
      setDmMessages((data as DmMessage[]) || []);
      setLoadingDm(false);
    };
    load();

    const channel = supabase
      .channel(`dm-${[user.id, chatWithUser.id].sort().join("-")}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload) => {
          const msg = payload.new as DmMessage;
          if (
            (msg.sender_id === user.id &&
              msg.receiver_id === chatWithUser.id) ||
            (msg.sender_id === chatWithUser.id && msg.receiver_id === user.id)
          ) {
            setDmMessages((prev) => [...prev, msg]);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatWithUser, user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [dmMessages]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const sendFriendRequest = async (toId: string) => {
    try {
      const { error } = await supabase
        .from("friend_requests")
        .insert({ sender_id: user!.id, receiver_id: toId, status: "pending" });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["friend-requests"] });
      toast({ title: "Friend request sent! 👋" });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const respondFriendRequest = async (
    requestId: string,
    action: "accepted" | "rejected",
  ) => {
    try {
      const { error } = await supabase
        .from("friend_requests")
        .update({ status: action })
        .eq("id", requestId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["friend-requests"] });
      toast({
        title: action === "accepted" ? "Friend added! 🎉" : "Request declined",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const sendDm = async () => {
    if (!chatMsg.trim() || !chatWithUser || !user) return;
    setSendingMsg(true);
    try {
      const { error } = await supabase.from("direct_messages").insert({
        sender_id: user.id,
        receiver_id: chatWithUser.id,
        content: chatMsg.trim(),
        read: false,
      });
      if (error) throw error;
      setChatMsg("");
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSendingMsg(false);
    }
  };

  const addFriendToTrip = async (friendId: string, tripId: string) => {
    try {
      const { error } = await supabase.from("trip_memberships").insert({
        trip_id: tripId,
        user_id: friendId,
        role: "member",
      });
      if (error && error.message.toLowerCase().includes("duplicate")) {
        toast({
          title: "Already in trip",
          description: "This person is already a member.",
        });
        return;
      }
      if (error) throw error;
      // Invalidate all relevant queries so the UI refreshes immediately
      queryClient.invalidateQueries({ queryKey: ["trip-members"] });
      queryClient.invalidateQueries({ queryKey: ["trip-memberships"] });
      queryClient.invalidateQueries({
        queryKey: ["friend-requests", user?.id],
      });
      queryClient.invalidateQueries({ queryKey: ["all-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      const tripName = trips.find((t) => t.id === tripId)?.name ?? "your trip";
      toast({
        title: `Added to ${tripName}! ✅`,
        description: "They can now view and collaborate on this trip.",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleGenerateInvite = async () => {
    if (!selectedTripId) {
      toast({ title: "Select a trip", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const { error } = await supabase
        .from("trip_invites")
        .insert({ trip_id: selectedTripId, created_by: user!.id });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["trip-invites"] });
      toast({ title: "Invite link created! 🔗" });
      setShowInvite(false);
      setSelectedTripId("");
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const copyInviteLink = (code: string) => {
    const url = `${window.location.origin}/join/${code}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
    toast({ title: "Link copied! 📋" });
  };

  const handleJoinRequest = async (
    requestId: string,
    action: "accepted" | "rejected",
    tripId: string,
    userId: string,
  ) => {
    // Map UI action to DB-allowed status values:
    // DB CHECK constraint allows: 'pending' | 'approved' | 'rejected'
    const dbStatus = action === "accepted" ? "approved" : "rejected";
    try {
      const { error } = await supabase
        .from("trip_join_requests")
        .update({ status: dbStatus, resolved_at: new Date().toISOString() })
        .eq("id", requestId);
      if (error) throw error;
      if (action === "accepted") {
        const { error: memErr } = await supabase
          .from("trip_memberships")
          .insert({ trip_id: tripId, user_id: userId, role: "member" });
        if (memErr && !memErr.message.includes("duplicate")) throw memErr;
      }
      queryClient.invalidateQueries({ queryKey: ["join-requests"] });
      queryClient.invalidateQueries({ queryKey: ["trip-members"] });
      toast({
        title: action === "accepted" ? "Member added! ✅" : "Request rejected",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const filteredUsers = allUsers.filter((u) =>
    u.name?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Public trips the user could request to join (not organizer, not already member)
  const { data: publicTrips = [] } = useQuery({
    queryKey: ["public-trips-for-join", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("id, name, destination, country, organizer_id")
        .neq("organizer_id", user!.id)
        .order("start_date", { ascending: true })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch trip memberships for friends so we can show which trip they're in
  const { data: tripMemberships = [] } = useQuery({
    queryKey: ["trip-memberships", user?.id],
    queryFn: async () => {
      if (!trips.length) return [];
      const tripIds = trips.map((t) => t.id);
      const { data, error } = await supabase
        .from("trip_memberships")
        .select("trip_id, user_id, role")
        .in("trip_id", tripIds);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && trips.length > 0,
  });

  // Build friendId → trip names map
  const friendInTripsMap = new Map<string, string[]>();
  for (const mem of tripMemberships as any[]) {
    const trip = trips.find((t) => t.id === mem.trip_id);
    if (!trip) continue;
    if (!friendInTripsMap.has(mem.user_id)) {
      friendInTripsMap.set(mem.user_id, []);
    }
    friendInTripsMap.get(mem.user_id)!.push(trip.name);
  }

  const totalRequestBadge =
    pendingReceived.length + joinRequests.length || undefined;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "discover", label: t("discover") + " People" },
    {
      id: "friends",
      label: t("friends"),
      badge: acceptedFriends.length || undefined,
    },
    {
      id: "requests",
      label: t("requests"),
      badge: totalRequestBadge,
    },
    { id: "invites", label: t("invites") },
    { id: "collaborate", label: t("collaborate") },
  ];

  // ── Collaborate tab state ─────────────────────────────────────────────────
  const effectiveCollabTripId = collaborateTripId || (trips[0]?.id ?? "");
  const { data: collabItineraries = [] } = useItineraries(
    effectiveCollabTripId || undefined,
  );
  const activeCollabItinerary =
    (collabItineraries as any[]).find((it: any) => it.is_active) ??
    (collabItineraries as any[])[0] ??
    null;
  const { data: collabActivities = [] } = useActivities(
    activeCollabItinerary?.id,
  );

  // ── Chat screen ────────────────────────────────────────────────────────────
  if (chatWithUser) {
    return (
      <div className="flex flex-col h-[calc(100dvh-140px)] md:h-[calc(100dvh-64px)] max-w-2xl mx-auto">
        {/* header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border shadow-sm">
          <button
            onClick={() => setChatWithUser(null)}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm shrink-0">
            {getInitials(chatWithUser.name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-card-foreground text-sm truncate">
              {chatWithUser.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {friendIds.has(chatWithUser.id) ? "Friend" : "App User"}
            </p>
          </div>
          {trips.filter((t) => t.organizer_id === user?.id).length > 0 && (
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value)
                  addFriendToTrip(chatWithUser.id, e.target.value);
                (e.target as HTMLSelectElement).value = "";
              }}
              className="text-xs px-3 py-1.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">+ Add to trip</option>
              {trips
                .filter((t) => t.organizer_id === user?.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          )}
        </div>

        {/* messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-background">
          {loadingDm ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : dmMessages.length === 0 ? (
            <div className="text-center py-16">
              <MessageCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No messages yet. Say hello! 👋
              </p>
            </div>
          ) : (
            dmMessages.map((msg) => {
              const isMe = msg.sender_id === user?.id;
              return (
                <div
                  key={msg.id}
                  className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                      isMe
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-card text-card-foreground border border-border rounded-bl-sm"
                    }`}
                  >
                    <p>{msg.content}</p>
                    <p
                      className={`text-[10px] mt-1 ${
                        isMe
                          ? "text-primary-foreground/60"
                          : "text-muted-foreground"
                      }`}
                    >
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={chatEndRef} />
        </div>

        {/* input */}
        <div className="p-4 bg-card border-t border-border">
          <div className="flex gap-2">
            <input
              type="text"
              value={chatMsg}
              onChange={(e) => setChatMsg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendDm()}
              placeholder={`Message ${chatWithUser.name}...`}
              className="flex-1 px-4 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              onClick={sendDm}
              disabled={sendingMsg || !chatMsg.trim()}
              className="p-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {sendingMsg ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main view ──────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 md:mb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">
            Travel Friends
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Connect, chat &amp; travel together
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 flex items-center gap-2 self-start sm:self-auto"
        >
          <LinkIcon className="w-4 h-4" />
          Invite Link
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 md:mb-6 bg-secondary/50 p-1 rounded-xl overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition-all whitespace-nowrap flex-1 justify-center ${
              activeTab === tab.id
                ? "bg-card text-foreground shadow-card"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span className="bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[1rem] h-4 px-1 flex items-center justify-center">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── DISCOVER TAB ── */}
      {activeTab === "discover" && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search travelers by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-card"
            />
          </div>

          {loadingUsers ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-7 h-7 text-primary animate-spin" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-16">
              <Globe className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold text-foreground">
                No travelers found
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Try a different search term
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredUsers.map((person) => {
                const isFriend = friendIds.has(person.id);
                const sent = sentToIds.has(person.id);
                const receivedReq = (friendRequests as any[]).find(
                  (r) =>
                    r.sender_id === person.id &&
                    r.receiver_id === user?.id &&
                    r.status === "pending",
                );

                return (
                  <div
                    key={person.id}
                    className="bg-card rounded-2xl p-4 shadow-card flex items-center gap-3"
                  >
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                      {getInitials(person.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-card-foreground text-sm truncate">
                        {person.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isFriend
                          ? "✓ Friend"
                          : receivedReq
                            ? "Wants to connect"
                            : sent
                              ? "Request sent"
                              : "Traveler"}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                      {isFriend ? (
                        <>
                          <button
                            onClick={() => setChatWithUser(person)}
                            className="p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                            title="Message"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </button>
                          {trips.filter((t) => t.organizer_id === user?.id)
                            .length > 0 && (
                            <select
                              defaultValue=""
                              onChange={(e) => {
                                if (e.target.value)
                                  addFriendToTrip(person.id, e.target.value);
                                (e.target as HTMLSelectElement).value = "";
                              }}
                              className="text-xs px-2 py-1.5 rounded-xl border border-border bg-background focus:outline-none cursor-pointer"
                              title="Add to trip"
                            >
                              <option value="">+ Trip</option>
                              {trips
                                .filter((t) => t.organizer_id === user?.id)
                                .map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                            </select>
                          )}
                        </>
                      ) : receivedReq ? (
                        <>
                          <button
                            onClick={() =>
                              respondFriendRequest(receivedReq.id, "accepted")
                            }
                            className="p-2 rounded-xl bg-success/10 text-success hover:bg-success/20 transition-colors"
                            title="Accept"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() =>
                              respondFriendRequest(receivedReq.id, "rejected")
                            }
                            className="p-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                            title="Decline"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </>
                      ) : sent ? (
                        <span className="text-xs px-3 py-1.5 rounded-xl bg-secondary text-muted-foreground">
                          Pending
                        </span>
                      ) : (
                        <button
                          onClick={() => sendFriendRequest(person.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 text-xs font-medium transition-colors"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          Connect
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── FRIENDS TAB ── */}
      {activeTab === "friends" && (
        <div className="space-y-4">
          {acceptedFriends.length === 0 ? (
            <div className="text-center py-16">
              <UsersIcon className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold text-foreground">No friends yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Go to Discover to connect with travelers!
              </p>
              <button
                onClick={() => setActiveTab("discover")}
                className="mt-4 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90"
              >
                Discover Travelers
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {acceptedFriends.map((r: any) => {
                const friend = r.sender_id === user?.id ? r.receiver : r.sender;
                if (!friend) return null;
                const friendTrips = friendInTripsMap.get(friend.id) || [];
                return (
                  <div
                    key={r.id}
                    className="bg-card rounded-2xl p-4 shadow-card flex items-center gap-3"
                  >
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-success/20 to-success/5 flex items-center justify-center text-sm font-bold text-success shrink-0">
                      {getInitials(friend.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-card-foreground text-sm truncate">
                        {friend.name}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <UserCheck className="w-3 h-3 text-success" />
                        Friend
                      </p>
                      {friendTrips.length > 0 && (
                        <p className="text-[10px] text-primary font-medium mt-0.5 truncate">
                          ✈️ In: {friendTrips.slice(0, 2).join(", ")}
                          {friendTrips.length > 2
                            ? ` +${friendTrips.length - 2}`
                            : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                      <button
                        onClick={() => setChatWithUser(friend as Profile)}
                        className="p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        title="Message"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                      {trips.filter((t) => t.organizer_id === user?.id).length >
                        0 && (
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value)
                              addFriendToTrip(friend.id, e.target.value);
                            (e.target as HTMLSelectElement).value = "";
                          }}
                          className="text-xs px-2 py-1.5 rounded-xl border border-border bg-background focus:outline-none cursor-pointer"
                          title="Add to travel group"
                        >
                          <option value="">+ Trip</option>
                          {trips
                            .filter((t) => t.organizer_id === user?.id)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* REQUESTS TAB */}
      {activeTab === "requests" && (
        <div className="space-y-6">
          {pendingReceived.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Friend Requests ({pendingReceived.length})
              </h2>
              <div className="space-y-2">
                {pendingReceived.map((r: any) => (
                  <div
                    key={r.id}
                    className="bg-card rounded-2xl p-4 shadow-card flex items-center gap-3"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                      {getInitials(r.sender?.name || "?")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-card-foreground">
                        {r.sender?.name || "Unknown"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Wants to be travel friends
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => respondFriendRequest(r.id, "accepted")}
                        className="p-2 rounded-xl bg-success/10 text-success hover:bg-success/20 transition-colors"
                      >
                        <CheckCircle className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => respondFriendRequest(r.id, "rejected")}
                        className="p-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {joinRequests.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Trip Join Requests ({joinRequests.length})
              </h2>
              <div className="space-y-2">
                {(joinRequests as any[]).map((req: any) => (
                  <div
                    key={req.id}
                    className="bg-card rounded-2xl p-4 shadow-card flex items-center gap-4"
                  >
                    <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-warning" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-card-foreground">
                        {req.profiles?.name || "Unknown User"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        wants to join{" "}
                        <span className="font-medium">{req.trips?.name}</span>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          handleJoinRequest(
                            req.id,
                            "accepted",
                            req.trip_id,
                            req.user_id,
                          )
                        }
                        className="p-2 rounded-xl bg-success/10 text-success hover:bg-success/20 transition-colors"
                      >
                        <CheckCircle className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() =>
                          handleJoinRequest(
                            req.id,
                            "rejected",
                            req.trip_id,
                            req.user_id,
                          )
                        }
                        className="p-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(myRequests as any[]).length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                My Trip Requests
              </h2>
              <div className="space-y-2">
                {(myRequests as any[]).map((req: any) => (
                  <div
                    key={req.id}
                    className="bg-card rounded-2xl p-4 shadow-card flex items-center gap-3"
                  >
                    <div
                      className={
                        "w-8 h-8 rounded-full flex items-center justify-center " +
                        (req.status === "accepted"
                          ? "bg-success/10"
                          : req.status === "rejected"
                            ? "bg-destructive/10"
                            : "bg-warning/10")
                      }
                    >
                      {req.status === "accepted" ? (
                        <CheckCircle className="w-4 h-4 text-success" />
                      ) : req.status === "rejected" ? (
                        <XCircle className="w-4 h-4 text-destructive" />
                      ) : (
                        <Clock className="w-4 h-4 text-warning" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-card-foreground">
                        <span className="font-medium">{req.trips?.name}</span>
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {req.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pendingReceived.length === 0 &&
            joinRequests.length === 0 &&
            myRequests.length === 0 && (
              <div className="text-center py-16">
                <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="font-semibold text-foreground">
                  No pending requests
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  All caught up!
                </p>
              </div>
            )}
        </div>
      )}

      {/* INVITES TAB */}
      {activeTab === "invites" && (
        <div className="space-y-4">
          {invites.length === 0 ? (
            <div className="text-center py-16">
              <LinkIcon className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold text-foreground">
                No invite links yet
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Create a link to invite friends to your trip
              </p>
              <button
                onClick={() => setShowInvite(true)}
                className="mt-4 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90"
              >
                Create Invite Link
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {(invites as any[]).map((inv: any) => (
                <div
                  key={inv.id}
                  className="bg-card rounded-2xl p-4 shadow-card flex items-center gap-4"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <LinkIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-card-foreground truncate">
                      {inv.trips?.name} — {inv.trips?.destination}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {window.location.origin}/join/{inv.invite_code}
                    </p>
                  </div>
                  <button
                    onClick={() => copyInviteLink(inv.invite_code)}
                    className="p-2 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors shrink-0"
                  >
                    {copiedCode === inv.invite_code ? (
                      <Check className="w-4 h-4 text-success" />
                    ) : (
                      <Copy className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── COLLABORATE TAB ── */}
      {activeTab === "collaborate" && (
        <div className="space-y-4">
          {/* Trip selector */}
          <div className="bg-card rounded-2xl p-4 shadow-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <Users2 className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-card-foreground">
                  Collaborative Space
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Vote, edit & manage trip activities with your group
                </p>
              </div>
            </div>

            {trips.length === 0 ? (
              <div className="text-center py-8">
                <Users2 className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No trips yet. Create a trip first to collaborate.
                </p>
              </div>
            ) : (
              <div>
                <label className="text-[11px] text-muted-foreground mb-1.5 block">
                  Select trip to collaborate on
                </label>
                <select
                  value={effectiveCollabTripId}
                  onChange={(e) => setCollaborateTripId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {trips.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} — {t.destination}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* CollaborativePlanner */}
          {effectiveCollabTripId && collabActivities.length > 0 ? (
            <CollaborativePlanner
              tripId={effectiveCollabTripId}
              activities={collabActivities as any}
              onActivityUpdated={() => {
                queryClient.invalidateQueries({ queryKey: ["activities"] });
              }}
            />
          ) : effectiveCollabTripId && collabActivities.length === 0 ? (
            <div className="bg-card rounded-2xl p-8 text-center shadow-card">
              <Users2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold text-foreground text-sm">
                No activities yet
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Generate an AI itinerary for this trip first, then come back to
                collaborate with your group.
              </p>
            </div>
          ) : null}
        </div>
      )}

      {/* Generate Invite Modal */}
      {showInvite && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6"
          onClick={() => setShowInvite(false)}
        >
          <div
            className="bg-card rounded-2xl max-w-md w-full p-6 shadow-elevated animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-card-foreground">
                Generate Invite Link
              </h3>
              <button
                onClick={() => setShowInvite(false)}
                className="p-1 rounded-lg hover:bg-secondary"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  Select a trip
                </label>
                <select
                  value={selectedTripId}
                  onChange={(e) => setSelectedTripId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Choose a trip...</option>
                  {trips
                    .filter((t) => t.organizer_id === user?.id)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} — {t.destination}
                      </option>
                    ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                A unique link will be generated. Share it with friends so they
                can request to join your trip.
              </p>
              <button
                onClick={handleGenerateInvite}
                disabled={generating || !selectedTripId}
                className="w-full px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LinkIcon className="w-4 h-4" />
                )}
                Generate Link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
