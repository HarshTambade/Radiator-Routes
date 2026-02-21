import { useState, useRef, useEffect } from "react";
import { Plus, Check, Loader2 } from "lucide-react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTrips } from "@/hooks/useTrips";
import { useToast } from "@/hooks/use-toast";

interface Props {
  activity: {
    name: string;
    description?: string;
    location_name?: string;
    category?: string;
    cost?: number;
    notes?: string;
  };
  className?: string;
}

export default function AddToTripButton({ activity, className = "" }: Props) {
  const { user } = useAuth();
  const { data: trips = [] } = useTrips();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState({
    top: 0,
    left: 0,
    width: 220,
  });

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceRight = window.innerWidth - rect.left;
      const dropW = 220;

      let top = rect.bottom + 6;
      let left = rect.right - dropW;

      // Flip up if not enough space below
      if (spaceBelow < 200) {
        top = rect.top - 6; // will be adjusted after render
      }

      // Ensure doesn't go off left edge
      if (left < 8) left = 8;
      // Ensure doesn't go off right edge
      if (left + dropW > window.innerWidth - 8)
        left = window.innerWidth - dropW - 8;

      setDropdownPos({ top, left, width: dropW });
    }
  }, [open]);

  const handleAdd = async (tripId: string) => {
    if (!user) return;
    setAdding(true);
    try {
      // Get or create itinerary
      let { data: itin } = await supabase
        .from("itineraries")
        .select("id")
        .eq("trip_id", tripId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!itin) {
        const { data: newItin, error } = await supabase
          .from("itineraries")
          .insert({ trip_id: tripId, created_by: user.id, version: 1 })
          .select()
          .single();
        if (error) throw error;
        itin = newItin;
      }

      // Add activity
      const now = new Date();
      const { error } = await supabase.from("activities").insert({
        itinerary_id: itin.id,
        name: activity.name,
        description: activity.description || null,
        location_name: activity.location_name || null,
        category: activity.category || "attraction",
        cost: activity.cost || 0,
        notes: activity.notes || null,
        start_time: new Date(now.getTime() + 86400000).toISOString(),
        end_time: new Date(now.getTime() + 86400000 + 3600000).toISOString(),
        status: "pending",
      });
      if (error) throw error;

      setAdded(true);
      setOpen(false);
      toast({
        title: "Added to trip! ✅",
        description: `${activity.name} added to itinerary.`,
      });
      setTimeout(() => setAdded(false), 3000);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  };

  if (!user || trips.length === 0) return null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
          added
            ? "bg-success/10 text-success"
            : "bg-primary/10 text-primary hover:bg-primary/20"
        } ${className}`}
      >
        {added ? (
          <Check className="w-3.5 h-3.5" />
        ) : adding ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Plus className="w-3.5 h-3.5" />
        )}
        {added ? "Added" : "Add to Trip"}
      </button>

      {open &&
        createPortal(
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-[9998]"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
            />
            {/* Dropdown */}
            <div
              className="fixed z-[9999] bg-card rounded-xl shadow-elevated border border-border p-2 animate-fade-in"
              style={{
                top: dropdownPos.top,
                left: dropdownPos.left,
                width: dropdownPos.width,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-xs text-muted-foreground px-2 py-1 font-semibold uppercase tracking-wide">
                Select a trip
              </p>
              <div className="max-h-52 overflow-y-auto">
                {trips.map((trip) => (
                  <button
                    key={trip.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAdd(trip.id);
                    }}
                    disabled={adding}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-secondary text-sm text-card-foreground transition-colors disabled:opacity-50"
                  >
                    <p className="font-medium truncate">{trip.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {trip.destination}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
