import { useState, useEffect, useRef } from "react";
import {
  Users, ThumbsUp, ThumbsDown, Check, X, Edit2, Save, Send,
  MessageSquare, Loader2, CheckCircle2, XCircle, Clock, UserCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/errors";
import { mutateWithOfflineQueue, newId } from "@/lib/offlineMutation";

interface Activity {
  id: string;
  name: string;
  description: string | null;
  location_name: string | null;
  start_time: string;
  end_time: string;
  category: string | null;
  cost: number | null;
  status: string;
  itinerary_id: string;
  notes: string | null;
  /**
   * Concurrency stamp. Sent back as a precondition on queued edits so a replay
   * cannot overwrite a change another member made in the meantime. Optional
   * because a row read before the column existed simply has no value, in which
   * case the write falls back to last-write-wins.
   */
  updated_at?: string | null;
}

interface Vote {
  id: string;
  activity_id: string;
  user_id: string;
  vote: string;
}

interface Message {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  message_type: string | null;
}

interface Props {
  tripId: string;
  activities: Activity[];
  onActivityUpdated: () => void;
}

export default function CollaborativePlanner({ tripId, activities, onActivityUpdated }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [votes, setVotes] = useState<Vote[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Activity>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load votes
  useEffect(() => {
    if (activities.length === 0) return;
    const actIds = activities.map(a => a.id);
    supabase
      .from("activity_votes")
      .select("*")
      .in("activity_id", actIds)
      .then(({ data }) => { if (data) setVotes(data); });

    // Realtime votes
    const channel = supabase
      .channel(`collab-votes-${tripId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_votes" },
        () => {
          supabase.from("activity_votes").select("*").in("activity_id", actIds)
            .then(({ data }) => { if (data) setVotes(data); });
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activities, tripId]);

  // Load members
  useEffect(() => {
    supabase
      .from("trip_memberships")
      .select("user_id, role")
      .eq("trip_id", tripId)
      .then(({ data }) => { if (data) setMembers(data); });
  }, [tripId]);

  // Load chat
  useEffect(() => {
    if (!showChat) return;
    supabase
      .from("messages")
      .select("*")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: true })
      .then(({ data }) => { if (data) setMessages(data); });

    const channel = supabase
      .channel(`collab-chat-${tripId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `trip_id=eq.${tripId}` },
        (payload) => setMessages(prev => [...prev, payload.new as Message]))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tripId, showChat]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getVoteCounts = (activityId: string) => {
    const actVotes = votes.filter(v => v.activity_id === activityId);
    return {
      up: actVotes.filter(v => v.vote === "up").length,
      down: actVotes.filter(v => v.vote === "down").length,
      myVote: actVotes.find(v => v.user_id === user?.id)?.vote || null,
    };
  };

  const handleVote = async (activityId: string, vote: "up" | "down") => {
    if (!user) return;
    const existing = votes.find(v => v.activity_id === activityId && v.user_id === user.id);
    try {
      if (existing) {
        if (existing.vote === vote) {
          await supabase.from("activity_votes").delete().eq("id", existing.id);
        } else {
          await supabase.from("activity_votes").update({ vote }).eq("id", existing.id);
        }
      } else {
        await supabase.from("activity_votes").insert({
          activity_id: activityId,
          user_id: user.id,
          vote,
        });
      }
    } catch (e: unknown) {
      toast({ title: "Vote error", description: errorMessage(e), variant: "destructive" });
    }
  };

  const handleMarkStatus = async (activity: Activity, status: string) => {
    const activityId = activity.id;
    try {
      // Ticking activities off happens mid-trip, which is exactly when signal is
      // worst — so this write queues rather than failing.
      const result = await mutateWithOfflineQueue(
        async () => {
          const { error } = await supabase
            .from("activities")
            .update({ status })
            .eq("id", activityId);
          if (error) throw error;
        },
        {
          table: "activities",
          action: "update",
          payload: { status },
          matchValue: activityId,
          // Guards the replay: if another member changed this activity while the
          // edit sat in the queue, the write is rejected and reported instead of
          // silently winning on arrival order.
          expectedUpdatedAt: activity.updated_at ?? undefined,
          description: `Mark "${activity.name}" ${status}`,
          invalidate: [["activities"], ["itineraries", tripId]],
        },
      );

      onActivityUpdated();
      toast({
        title: result.queued
          ? "Saved offline — will sync"
          : status === "done"
            ? "Marked done ✅"
            : status === "skipped"
              ? "Skipped ⏭️"
              : "Reset to pending",
      });
    } catch (e: unknown) {
      toast({ title: "Error", description: errorMessage(e), variant: "destructive" });
    }
  };

  const startEdit = (activity: Activity) => {
    setEditingId(activity.id);
    setEditForm({
      name: activity.name,
      description: activity.description,
      cost: activity.cost,
      notes: activity.notes,
      location_name: activity.location_name,
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const original = activities.find((a) => a.id === editingId);
    const payload = {
      name: editForm.name,
      description: editForm.description,
      cost: editForm.cost,
      notes: editForm.notes,
      location_name: editForm.location_name,
    };

    try {
      const result = await mutateWithOfflineQueue(
        async () => {
          const { error } = await supabase
            .from("activities")
            .update(payload)
            .eq("id", editingId);
          if (error) throw error;
        },
        {
          table: "activities",
          action: "update",
          payload,
          matchValue: editingId,
          // Concurrent edits to the same activity are the case last-write-wins
          // got wrong; this makes the loser visible rather than silent.
          expectedUpdatedAt: original?.updated_at ?? undefined,
          description: `Edit "${editForm.name ?? "activity"}"`,
          invalidate: [["activities"], ["itineraries", tripId]],
        },
      );

      setEditingId(null);
      onActivityUpdated();
      toast({
        title: result.queued ? "Saved offline — will sync" : "Activity updated ✏️",
      });
    } catch (e: unknown) {
      toast({ title: "Error", description: errorMessage(e), variant: "destructive" });
    }
  };

  const sendMessage = async () => {
    if (!chatInput.trim() || !user) return;
    setSendingMsg(true);
    try {
      // Group chat while travelling is a prime no-signal case. The id is
      // generated here so the queued row keeps its identity on replay.
      const row = {
        id: newId(),
        trip_id: tripId,
        sender_id: user.id,
        content: chatInput,
        message_type: "text",
      };

      const result = await mutateWithOfflineQueue(
        async () => {
          const { error } = await supabase.from("messages").insert(row);
          if (error) throw error;
        },
        {
          table: "messages",
          action: "insert",
          payload: row,
          matchValue: row.id,
          description: "Send chat message",
          invalidate: [["messages", tripId]],
        },
      );

      setChatInput("");
      if (result.queued) {
        toast({
          title: "Message queued",
          description: "It will send when you're back online.",
        });
      }
    } catch (e: unknown) {
      toast({ title: "Error", description: errorMessage(e), variant: "destructive" });
    } finally {
      setSendingMsg(false);
    }
  };

  const statusIcon = (status: string) => {
    if (status === "done") return <CheckCircle2 className="w-4 h-4 text-success" />;
    if (status === "skipped") return <XCircle className="w-4 h-4 text-destructive" />;
    return <Clock className="w-4 h-4 text-muted-foreground" />;
  };

  if (activities.length === 0) return null;

  return (
    <div className="bg-card rounded-2xl shadow-card overflow-hidden mb-6">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-card-foreground">Collaborative Space</h3>
            <p className="text-[10px] text-muted-foreground">{members.length} member{members.length !== 1 ? "s" : ""} · Vote, edit & mark activities</p>
          </div>
        </div>
        <button
          onClick={() => setShowChat(!showChat)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
            showChat ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
        >
          <MessageSquare className="w-3 h-3" />
          Group Chat
        </button>
      </div>

      <div className="flex">
        {/* Activities List */}
        <div className={`flex-1 divide-y divide-border ${showChat ? "max-w-[60%]" : ""}`}>
          {activities.map(activity => {
            const { up, down, myVote } = getVoteCounts(activity.id);
            const isEditing = editingId === activity.id;

            return (
              <div key={activity.id} className={`p-4 transition-colors ${
                activity.status === "done" ? "bg-success/5" : activity.status === "skipped" ? "bg-destructive/5" : ""
              }`}>
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      value={editForm.name || ""}
                      onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="Activity name"
                    />
                    <input
                      value={editForm.description || ""}
                      onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="Description"
                    />
                    <div className="flex gap-2">
                      <input
                        value={editForm.location_name || ""}
                        onChange={e => setEditForm({ ...editForm, location_name: e.target.value })}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="Location"
                      />
                      <input
                        type="number"
                        value={editForm.cost ?? ""}
                        onChange={e => setEditForm({ ...editForm, cost: Number(e.target.value) })}
                        className="w-28 px-3 py-1.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="Cost ₹"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveEdit} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1">
                        <Save className="w-3 h-3" /> Save
                      </button>
                      <button onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    {/* Status indicator */}
                    <div className="mt-1">{statusIcon(activity.status)}</div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className={`text-sm font-semibold ${activity.status === "done" ? "line-through text-muted-foreground" : "text-card-foreground"}`}>
                          {activity.name}
                        </h4>
                        {activity.category && (
                          <span className="px-2 py-0.5 rounded-full bg-secondary text-[10px] font-medium text-secondary-foreground capitalize">
                            {activity.category}
                          </span>
                        )}
                      </div>
                      {activity.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{activity.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(activity.start_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {activity.location_name && (
                          <span className="text-[11px] text-muted-foreground">{activity.location_name}</span>
                        )}
                        {activity.cost != null && activity.cost > 0 && (
                          <span className="text-[11px] font-medium text-card-foreground">₹{Number(activity.cost).toLocaleString("en-IN")}</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Vote buttons */}
                      <button
                        onClick={() => handleVote(activity.id, "up")}
                        className={`p-1.5 rounded-lg transition-colors ${
                          myVote === "up" ? "bg-success/20 text-success" : "hover:bg-secondary text-muted-foreground"
                        }`}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                      </button>
                      <span className={`text-xs font-semibold min-w-[20px] text-center ${
                        up - down > 0 ? "text-success" : up - down < 0 ? "text-destructive" : "text-muted-foreground"
                      }`}>
                        {up - down > 0 ? "+" : ""}{up - down}
                      </span>
                      <button
                        onClick={() => handleVote(activity.id, "down")}
                        className={`p-1.5 rounded-lg transition-colors ${
                          myVote === "down" ? "bg-destructive/20 text-destructive" : "hover:bg-secondary text-muted-foreground"
                        }`}
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                      </button>

                      <div className="w-px h-5 bg-border mx-1" />

                      {/* Mark buttons */}
                      <button
                        onClick={() => handleMarkStatus(activity, activity.status === "done" ? "pending" : "done")}
                        className={`p-1.5 rounded-lg transition-colors ${
                          activity.status === "done" ? "bg-success/20 text-success" : "hover:bg-secondary text-muted-foreground"
                        }`}
                        title="Mark done"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleMarkStatus(activity, activity.status === "skipped" ? "pending" : "skipped")}
                        className={`p-1.5 rounded-lg transition-colors ${
                          activity.status === "skipped" ? "bg-destructive/20 text-destructive" : "hover:bg-secondary text-muted-foreground"
                        }`}
                        title="Skip"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>

                      <div className="w-px h-5 bg-border mx-1" />

                      {/* Edit */}
                      <button
                        onClick={() => startEdit(activity)}
                        className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Group Chat Panel */}
        {showChat && (
          <div className="w-[40%] border-l border-border flex flex-col">
            <div className="p-3 border-b border-border bg-secondary/30">
              <p className="text-xs font-semibold text-card-foreground">Group Chat</p>
              <p className="text-[10px] text-muted-foreground">{members.length} member{members.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[400px]">
              {messages.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No messages yet. Start the conversation!</p>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.sender_id === user?.id ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] px-3 py-1.5 rounded-xl text-xs ${
                      msg.sender_id === user?.id
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-secondary text-secondary-foreground rounded-bl-sm"
                    }`}>
                      {msg.sender_id !== user?.id && (
                        <div className="flex items-center gap-1 mb-0.5">
                          <UserCircle className="w-3 h-3" />
                          <span className="font-semibold text-[10px]">{msg.sender_id.slice(0, 8)}</span>
                        </div>
                      )}
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="p-3 border-t border-border">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-1.5 rounded-lg bg-background border border-border text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  onClick={sendMessage}
                  disabled={!chatInput.trim() || sendingMsg}
                  className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
                >
                  {sendingMsg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
