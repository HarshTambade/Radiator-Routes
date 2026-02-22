import {
  Star,
  Bookmark,
  Search,
  MapPin,
  Loader2,
  ChevronRight,
  X,
  IndianRupee,
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { planItinerary } from "@/services/aiPlanner";
import AddToTripButton from "@/components/AddToTripButton";

import destinationAgra from "@/assets/destination-agra.jpg";
import destinationGoa from "@/assets/destination-goa.jpg";
import destinationKerala from "@/assets/destination-kerala.jpg";
import travelSummit from "@/assets/travel-summit.jpg";
import travelKayak from "@/assets/travel-kayak.jpg";
import travelBeach from "@/assets/travel-beach.jpg";

const guideImages = [
  destinationAgra,
  destinationGoa,
  destinationKerala,
  travelSummit,
  travelKayak,
  travelBeach,
];

export default function Guide() {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [guides, setGuides] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedGuide, setSelectedGuide] = useState<any | null>(null);
  const { toast } = useToast();

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setSearched(true);

    try {
      const res = (await planItinerary({
        destination: searchQuery,
        days: 3,
        travelers: 2,
        budget: 30000,
        interests: ["culture", "food", "sightseeing"],
        tripType: "leisure",
      })) as any;

      const activities = res?.activities || [];
      const guideCards = activities.slice(0, 6).map((a: any, i: number) => ({
        id: i,
        title: a.name,
        description: a.description || a.notes || "",
        location: a.location_name || searchQuery,
        category: a.category,
        cost: a.cost,
        rating: a.review_score || 4.5,
        notes: a.notes,
        start_time: a.start_time,
        end_time: a.end_time,
        estimated_steps: a.estimated_steps,
        image: guideImages[i % guideImages.length],
      }));

      setGuides(guideCards);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 md:mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">
            {t("guide")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Get AI-curated travel recommendations for any destination
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-2 md:gap-3 mb-5 md:mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search a destination... e.g. Jaipur, Goa, Kerala"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-card"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-4 md:px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 shrink-0"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "Generate Guide"
          )}
        </button>
      </div>

      {/* Detail Modal */}
      {selectedGuide && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6"
          onClick={() => setSelectedGuide(null)}
        >
          <div
            className="bg-card rounded-2xl max-w-lg w-full overflow-hidden shadow-elevated animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-48">
              <img
                src={selectedGuide.image}
                alt={selectedGuide.title}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => setSelectedGuide(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-card/80 backdrop-blur-sm flex items-center justify-center"
              >
                <X className="w-4 h-4 text-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <h2 className="text-lg font-bold text-card-foreground">
                {selectedGuide.title}
              </h2>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="w-3 h-3" />
                  {selectedGuide.location}
                </span>
                <span className="flex items-center gap-1 text-xs text-warning font-semibold">
                  <Star className="w-3 h-3 fill-warning" />
                  {selectedGuide.rating}
                </span>
                {selectedGuide.cost > 0 && (
                  <span className="flex items-center gap-0.5 text-xs font-semibold text-card-foreground">
                    <IndianRupee className="w-3 h-3" />
                    {Number(selectedGuide.cost).toLocaleString("en-IN")}
                  </span>
                )}
              </div>
              <span className="inline-block px-3 py-1 rounded-full bg-secondary text-xs font-medium text-secondary-foreground capitalize">
                {selectedGuide.category || "general"}
              </span>
              {selectedGuide.description && (
                <p className="text-sm text-muted-foreground">
                  {selectedGuide.description}
                </p>
              )}
              {selectedGuide.notes && (
                <div className="bg-secondary/50 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground">
                    💡 {selectedGuide.notes}
                  </p>
                </div>
              )}
              {selectedGuide.estimated_steps && (
                <p className="text-xs text-muted-foreground">
                  🚶 Estimated steps:{" "}
                  {selectedGuide.estimated_steps.toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {!searched ? (
        <div className="text-center py-20">
          <Bookmark className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold text-foreground text-lg">
            {t("search")} {t("guide")}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Our AI will create personalized travel recommendations
          </p>
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        </div>
      ) : guides.length === 0 ? (
        <div className="text-center py-20">
          <MapPin className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold text-foreground">
            No recommendations found
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Try a different destination
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
          {guides.map((guide) => (
            <div
              key={guide.id}
              onClick={() => setSelectedGuide(guide)}
              className="bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-elevated transition-all cursor-pointer group animate-fade-in"
            >
              <div className="relative h-36 overflow-hidden">
                <img
                  src={guide.image}
                  alt={guide.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-card-foreground">
                      {guide.title}
                    </h3>
                    <div className="flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {guide.location}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-warning fill-warning" />
                    <span className="text-xs font-semibold">
                      {guide.rating}
                    </span>
                  </div>
                </div>
                {guide.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {guide.description}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1 rounded-full bg-secondary text-xs font-medium text-secondary-foreground capitalize">
                    {guide.category || "general"}
                  </span>
                  <div className="flex items-center gap-2">
                    {guide.cost > 0 && (
                      <span className="text-sm font-semibold text-card-foreground">
                        ₹{Number(guide.cost).toLocaleString("en-IN")}
                      </span>
                    )}
                    <AddToTripButton
                      activity={{
                        name: guide.title,
                        description: guide.description,
                        location_name: guide.location,
                        category: guide.category || "attraction",
                        cost: guide.cost,
                        notes: guide.notes,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
