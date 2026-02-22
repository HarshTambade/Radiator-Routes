import { useState, useRef, useEffect } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import {
  Plus,
  Users,
  MessageSquare,
  Calendar,
  Send,
  Loader2,
  X,
  MapPin,
  ChevronLeft,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const CATEGORIES = [
  "general",
  "backpacking",
  "luxury",
  "adventure",
  "cultural",
  "foodie",
  "solo",
  "group",
];

export default function Community() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedCommunity, setSelectedCommunity] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "events" | "members">(
    "chat",
  );
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [creating, setCreating] = useState(false);

  // Fetch all public communities
  const { data: communities = [], isLoading } = useQuery({
    queryKey: ["communities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communities")
        .select("*")
        .order("member_count", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch user's memberships
  const { data: myMemberships = [] } = useQuery({
    queryKey: ["my-community-memberships", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_memberships")
        .select("community_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data.map((m) => m.community_id);
    },
    enabled: !!user,
  });

  const isMember = (communityId: string) => myMemberships.includes(communityId);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { error } = await supabase.from("communities").insert({
        name: newName,
        description: newDesc,
        category: newCategory,
        created_by: user!.id,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["communities"] });
      queryClient.invalidateQueries({ queryKey: ["my-community-memberships"] });
      toast({ title: "Community created! 🎉" });
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (communityId: string) => {
    try {
      const { error } = await supabase
        .from("community_memberships")
        .insert({ community_id: communityId, user_id: user!.id });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["communities"] });
      queryClient.invalidateQueries({ queryKey: ["my-community-memberships"] });
      toast({ title: "Joined community! 🤝" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleLeave = async (communityId: string) => {
    try {
      const { error } = await supabase
        .from("community_memberships")
        .delete()
        .eq("community_id", communityId)
        .eq("user_id", user!.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["communities"] });
      queryClient.invalidateQueries({ queryKey: ["my-community-memberships"] });
      toast({ title: "Left community" });
      if (selectedCommunity?.id === communityId) setSelectedCommunity(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (selectedCommunity && isMember(selectedCommunity.id)) {
    return (
      <CommunityDetail
        community={selectedCommunity}
        onBack={() => setSelectedCommunity(null)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 md:mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">
            {t("community")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Join travel communities and plan together
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          {t("create")} Community
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-card rounded-2xl max-w-md w-full p-6 shadow-elevated animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-card-foreground">
                {t("create")} Community
              </h3>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1 rounded-lg hover:bg-secondary"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Southeast Asia Backpackers"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  Description
                </label>
                <textarea
                  placeholder="What's this community about?"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none h-20"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  Category
                </label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setNewCategory(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                        newCategory === cat
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="w-full px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {t("create")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Communities Grid */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : communities.length === 0 ? (
        <div className="text-center py-20">
          <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-foreground">{t("noResults")}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Be the first to create one!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
          {communities.map((c: any) => (
            <div
              key={c.id}
              className="bg-card rounded-2xl p-5 shadow-card hover:shadow-elevated transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-card-foreground">{c.name}</h3>
                  <span className="inline-block px-2 py-0.5 rounded-full bg-secondary text-xs font-medium text-secondary-foreground capitalize mt-1">
                    {c.category}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="w-3 h-3" />
                  {c.member_count}
                </div>
              </div>
              {c.description && (
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                  {c.description}
                </p>
              )}
              {isMember(c.id) ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedCommunity(c);
                      setActiveTab("chat");
                    }}
                    className="flex-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
                  >
                    {t("open")}
                  </button>
                  <button
                    onClick={() => handleLeave(c.id)}
                    className="px-4 py-2 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80"
                  >
                    {t("leave")}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleJoin(c.id)}
                  className="w-full px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
                >
                  {t("join")} Community
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================
// Community Detail View (chat, events, members)
// =============================================

function CommunityDetail({
  community,
  onBack,
  activeTab,
  setActiveTab,
}: {
  community: any;
  onBack: () => void;
  activeTab: "chat" | "events" | "members";
  setActiveTab: (t: "chat" | "events" | "members") => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5 md:mb-6">
        <button
          onClick={onBack}
          className="p-2 rounded-xl bg-card border border-border hover:bg-secondary transition-colors shrink-0"
        >
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <div>
          <h1 className="text-lg md:text-xl font-bold text-foreground">
            {community.name}
          </h1>
          <p className="text-xs text-muted-foreground capitalize">
            {community.category} · {community.member_count} members
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5 md:mb-6 overflow-x-auto">
        {(
          [
            ["chat", MessageSquare, "Chat"],
            ["events", Calendar, "Events"],
            ["members", Users, "Members"],
          ] as const
        ).map(([tab, Icon, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors ${
              activeTab === tab
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "chat" && <CommunityChat communityId={community.id} />}
      {activeTab === "events" && <CommunityEvents communityId={community.id} />}
      {activeTab === "members" && (
        <CommunityMembers communityId={community.id} />
      )}
    </div>
  );
}

// Chat Tab
function CommunityChat({ communityId }: { communityId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("community_messages")
        .select("*, profiles:sender_id(name)")
        .eq("community_id", communityId)
        .order("created_at", { ascending: true })
        .limit(100);
      if (data) setMessages(data);
    };
    load();

    const channel = supabase
      .channel(`community-${communityId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "community_messages",
          filter: `community_id=eq.${communityId}`,
        },
        async (payload) => {
          // Fetch with profile
          const { data } = await supabase
            .from("community_messages")
            .select("*, profiles:sender_id(name)")
            .eq("id", (payload.new as any).id)
            .single();
          if (data) setMessages((prev) => [...prev, data]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [communityId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || !user) return;
    setSending(true);
    try {
      const { error } = await supabase.from("community_messages").insert({
        community_id: communityId,
        sender_id: user.id,
        content: input,
      });
      if (error) throw error;
      setInput("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="bg-card rounded-2xl shadow-card flex flex-col"
      style={{ height: "clamp(320px, calc(100dvh - 300px), 600px)" }}
    >
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            No messages yet. Start chatting!
          </p>
        ) : (
          messages.map((msg: any) => (
            <div
              key={msg.id}
              className={`flex ${msg.sender_id === user?.id ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] px-3 py-2 rounded-xl text-sm ${
                  msg.sender_id === user?.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {msg.sender_id !== user?.id && (
                  <p className="text-[10px] font-semibold opacity-70 mb-0.5">
                    {(msg as any).profiles?.name || "Unknown"}
                  </p>
                )}
                {msg.content}
                <p className="text-[10px] opacity-50 mt-1">
                  {new Date(msg.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="p-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Events Tab
function CommunityEvents({ communityId }: { communityId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [dest, setDest] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: events = [] } = useQuery({
    queryKey: ["community-events", communityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_events")
        .select("*, event_rsvps(user_id, status)")
        .eq("community_id", communityId)
        .order("event_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const handleCreate = async () => {
    if (!title.trim() || !eventDate) return;
    setCreating(true);
    try {
      const { error } = await supabase.from("community_events").insert({
        community_id: communityId,
        title,
        description: desc,
        destination: dest,
        event_date: eventDate,
        created_by: user!.id,
      });
      if (error) throw error;
      queryClient.invalidateQueries({
        queryKey: ["community-events", communityId],
      });
      toast({ title: "Event created! 📅" });
      setShowCreate(false);
      setTitle("");
      setDesc("");
      setDest("");
      setEventDate("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleRSVP = async (eventId: string, status: string) => {
    try {
      // Try upsert
      const { error } = await supabase
        .from("event_rsvps")
        .upsert(
          { event_id: eventId, user_id: user!.id, status },
          { onConflict: "event_id,user_id" },
        );
      if (error) throw error;
      queryClient.invalidateQueries({
        queryKey: ["community-events", communityId],
      });
      toast({
        title: status === "going" ? "You're going! 🎉" : "Maybe next time",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Event
        </button>
      </div>

      {showCreate && (
        <div className="bg-card rounded-2xl p-5 shadow-card mb-4 space-y-3">
          <input
            type="text"
            placeholder="Event title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <input
            type="text"
            placeholder="Destination (optional)"
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <textarea
            placeholder="Description (optional)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none h-16"
          />
          <input
            type="datetime-local"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !title.trim() || !eventDate}
            className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
          >
            {creating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Create Event"
            )}
          </button>
        </div>
      )}

      {events.length === 0 ? (
        <div className="text-center py-12">
          <Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No events yet. Create one!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((ev: any) => {
            const goingCount =
              ev.event_rsvps?.filter((r: any) => r.status === "going").length ||
              0;
            const userRsvp = ev.event_rsvps?.find(
              (r: any) => r.user_id === user?.id,
            );
            return (
              <div key={ev.id} className="bg-card rounded-2xl p-5 shadow-card">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-card-foreground">
                      {ev.title}
                    </h3>
                    {ev.destination && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3" /> {ev.destination}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      📅 {new Date(ev.event_date).toLocaleDateString()} at{" "}
                      {new Date(ev.event_date).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {ev.description && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {ev.description}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {goingCount} going
                  </span>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => handleRSVP(ev.id, "going")}
                    className={`px-4 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                      userRsvp?.status === "going"
                        ? "bg-success text-success-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    }`}
                  >
                    ✅ Going
                  </button>
                  <button
                    onClick={() => handleRSVP(ev.id, "maybe")}
                    className={`px-4 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                      userRsvp?.status === "maybe"
                        ? "bg-warning text-warning-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    }`}
                  >
                    🤔 Maybe
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Members Tab
function CommunityMembers({ communityId }: { communityId: string }) {
  const queryClient = useQueryClient();

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["community-members", communityId],
    queryFn: async () => {
      // Step 1: fetch memberships (no FK join — avoids RLS/schema issues)
      const { data: memberships, error } = await supabase
        .from("community_memberships")
        .select("id, user_id, role, created_at")
        .eq("community_id", communityId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (!memberships || memberships.length === 0) return [];

      // Step 2: collect unique user IDs
      const userIds = Array.from(
        new Set(memberships.map((m: any) => m.user_id)),
      );

      // Step 3: fetch profiles for those IDs
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, avatar_url")
        .in("id", userIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      // Step 4: merge profile data onto each membership
      return memberships.map((m: any) => ({
        ...m,
        profile: profileMap.get(m.user_id) ?? {
          id: m.user_id,
          name: "Unknown",
          avatar_url: null,
        },
      }));
    },
    staleTime: 30_000,
  });

  const getInitials = (name: string) =>
    (name || "?")
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-muted-foreground">
          {members.length} member{members.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={() =>
            queryClient.invalidateQueries({
              queryKey: ["community-members", communityId],
            })
          }
          className="text-xs text-primary hover:underline font-medium"
        >
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : members.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No members yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {members.map((m: any) => {
            const profile = m.profile;
            const initials = getInitials(profile?.name || "?");
            return (
              <div
                key={m.id}
                className="bg-card rounded-2xl p-4 shadow-card flex items-center gap-3"
              >
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.name}
                    className="w-10 h-10 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                    {initials}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-card-foreground truncate">
                    {profile?.name || "Unknown User"}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize flex items-center gap-1">
                    {m.role === "admin" ? (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
                        ⭐ Admin
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Member</span>
                    )}
                  </p>
                </div>
                <div
                  className="w-2 h-2 rounded-full bg-green-500 shrink-0"
                  title="Active"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
