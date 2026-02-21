import { useState, useRef, useCallback } from "react";
import {
  Search,
  Star,
  Heart,
  MapPin,
  Loader2,
  X,
  Map,
  Eye,
  RotateCcw,
  Filter,
  Plus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { nominatimSearch } from "@/services/nominatim";
import { otmRadius, otmDetails } from "@/services/opentripmap";
import WorldMap from "@/components/WorldMap";
import Map3D from "@/components/Map3D";
import ARViewer from "@/components/ARViewer";
import StreetView360 from "@/components/StreetView360";
import AddToTripButton from "@/components/AddToTripButton";

import destinationAgra from "@/assets/destination-agra.jpg";
import destinationGoa from "@/assets/destination-goa.jpg";
import destinationKerala from "@/assets/destination-kerala.jpg";
import travelBeach from "@/assets/travel-beach.jpg";
import travelBoat from "@/assets/travel-boat.jpg";
import travelKayak from "@/assets/travel-kayak.jpg";

const fallbackImages = [
  destinationAgra,
  destinationGoa,
  destinationKerala,
  travelBeach,
  travelBoat,
  travelKayak,
];

// Expanded categories mapped to OpenTripMap "kinds"
const categories = [
  { label: "All", kinds: "interesting_places" },
  { label: "Temples", kinds: "religion" },
  { label: "Restaurants", kinds: "foods,restaurants" },
  { label: "Malls & Shopping", kinds: "shops,malls" },
  { label: "Historic", kinds: "historic" },
  { label: "Nature", kinds: "natural" },
  { label: "Architecture", kinds: "architecture" },
  { label: "Museums", kinds: "museums" },
  { label: "Amusements", kinds: "amusements" },
  { label: "Accommodation", kinds: "accomodations" },
  { label: "Local Shops", kinds: "shops" },
  { label: "Cultural", kinds: "cultural" },
];

// Convert OpenTripMap rate (1-7) to 5-star scale
function toFiveStars(rate: number | undefined): number | null {
  if (!rate || rate <= 0) return null;
  return Math.round((rate / 7) * 5 * 10) / 10;
}

// Cache type
type SearchCache = Record<string, any[]>;

export default function Explore() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [places, setPlaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<any | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [mapMode, setMapMode] = useState<"2d" | "3d">("2d");
  const [arPlace, setArPlace] = useState<any | null>(null);
  const [streetViewPlace, setStreetViewPlace] = useState<any | null>(null);
  const { toast } = useToast();

  // Cache results so switching tabs doesn't lose data
  const cacheRef = useRef<SearchCache>({});

  const getCacheKey = (query: string, filter: string) =>
    `${query.toLowerCase().trim()}|${filter}`;

  const handleSearch = useCallback(
    async (filterOverride?: string) => {
      if (!searchQuery.trim()) return;

      const currentFilter = filterOverride || activeFilter;
      const cacheKey = getCacheKey(searchQuery, currentFilter);

      // Return cached results if available
      if (cacheRef.current[cacheKey]) {
        setPlaces(cacheRef.current[cacheKey]);
        setSearched(true);
        return;
      }

      setLoading(true);
      setSearched(true);

      try {
        const geoResults = await nominatimSearch(searchQuery, 1);

        if (!geoResults || geoResults.length === 0) {
          toast({
            title: "Location not found",
            description: "Try a different search term.",
            variant: "destructive",
          });
          setPlaces([]);
          setLoading(false);
          return;
        }

        const { lat, lon } = geoResults[0];
        const catObj =
          categories.find((c) => c.label === currentFilter) || categories[0];

        // Fetch more places — increased radius and limit
        const raw = await otmRadius({
          lat: parseFloat(lat),
          lon: parseFloat(lon),
          radius: 20000,
          kinds: catObj.kinds,
          limit: 50,
        });

        const items = (raw as any)?.features
          ? (raw as any).features.map((f: any) => ({
              ...f.properties,
              point: f.geometry,
            }))
          : Array.isArray(raw)
            ? raw
            : [];

        // Sort by rate descending to prioritize famous places, then fetch details for top results
        const sorted = [...items].sort(
          (a: any, b: any) => (b.rate || 0) - (a.rate || 0),
        );

        const detailed: any[] = [];
        for (const p of sorted.slice(0, 20)) {
          if (!p.xid) continue;
          try {
            const detail = await otmDetails(p.xid);
            if (detail) detailed.push(detail);
            await new Promise((r) => setTimeout(r, 200));
          } catch {
            detailed.push({ ...p, name: p.name || "Unknown Place" });
          }
        }

        const results = detailed.filter(
          (p: any) => p.name && p.name.trim() !== "",
        );

        // Cache the results
        cacheRef.current[cacheKey] = results;
        setPlaces(results);

        if (results.length === 0) {
          toast({
            title: "No named places found",
            description: "Try a broader search or different category.",
          });
        }
      } catch (error: any) {
        toast({
          title: "Search failed",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    [searchQuery, activeFilter, toast],
  );

  const handleFilterChange = (filter: string) => {
    setActiveFilter(filter);
    if (searched && searchQuery.trim()) {
      handleSearch(filter);
    }
  };

  const handleCardClick = (place: any) => {
    setSelectedPlace(place);
    setShowMap(true);
  };

  const getPlaceCoords = (place: any) => {
    const lat = place.point?.coordinates?.[1] ?? place.point?.lat ?? place.lat;
    const lng =
      place.point?.coordinates?.[0] ??
      place.point?.lon ??
      place.lon ??
      place.lng;
    return { lat: parseFloat(lat), lng: parseFloat(lng) };
  };

  const openAR = (place: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const coords = getPlaceCoords(place);
    if (isNaN(coords.lat) || isNaN(coords.lng)) {
      toast({
        title: "Location unavailable",
        description: "No coordinates for this place.",
        variant: "destructive",
      });
      return;
    }
    setArPlace({ ...place, ...coords });
  };

  return (
    <div className="p-6 h-screen overflow-hidden flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Explore Destinations
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Discover amazing places for your next adventure
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search a city or destination..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-card"
          />
        </div>
        <button
          onClick={() => handleSearch()}
          disabled={loading}
          className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
        </button>
      </div>

      {/* Category Filters */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {categories.map((cat) => (
          <button
            key={cat.label}
            onClick={() => handleFilterChange(cat.label)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
              activeFilter === cat.label
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* AR Viewer */}
      {arPlace && (
        <ARViewer
          lat={arPlace.lat}
          lng={arPlace.lng}
          name={arPlace.name}
          description={arPlace.wikipedia_extracts?.text?.slice(0, 120)}
          onClose={() => setArPlace(null)}
        />
      )}

      {/* 360° Street View */}
      {streetViewPlace && (
        <StreetView360
          lat={streetViewPlace.lat}
          lng={streetViewPlace.lng}
          name={streetViewPlace.name}
          onClose={() => setStreetViewPlace(null)}
        />
      )}

      {/* Detail Modal with Map */}
      {selectedPlace && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6"
          onClick={() => {
            setSelectedPlace(null);
            setShowMap(false);
            setMapMode("2d");
          }}
        >
          <div
            className="bg-card rounded-2xl max-w-3xl w-full overflow-hidden shadow-elevated animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col md:flex-row">
              {/* Left: Image + Details */}
              <div className="flex-1 min-w-0">
                <div className="relative h-48">
                  <img
                    src={selectedPlace.preview?.source || fallbackImages[0]}
                    alt={selectedPlace.name}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => {
                      setSelectedPlace(null);
                      setShowMap(false);
                      setMapMode("2d");
                    }}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full bg-card/80 backdrop-blur-sm flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-foreground" />
                  </button>
                </div>
                <div className="p-5 space-y-3">
                  <h2 className="text-lg font-bold text-card-foreground">
                    {selectedPlace.name}
                  </h2>
                  <div className="flex items-center gap-3 flex-wrap">
                    {selectedPlace.address?.city && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        {[
                          selectedPlace.address.city,
                          selectedPlace.address.state,
                          selectedPlace.address.country,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    )}
                    {toFiveStars(selectedPlace.rate) && (
                      <span className="flex items-center gap-1 text-xs text-warning font-semibold">
                        <Star className="w-3 h-3 fill-warning" />
                        {toFiveStars(selectedPlace.rate)}/5
                      </span>
                    )}
                  </div>
                  {selectedPlace.kinds && (
                    <div className="flex gap-1.5 flex-wrap">
                      {selectedPlace.kinds
                        .split(",")
                        .slice(0, 5)
                        .map((tag: string) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded-full bg-secondary text-xs font-medium text-secondary-foreground capitalize"
                          >
                            {tag.replace(/_/g, " ")}
                          </span>
                        ))}
                    </div>
                  )}
                  {selectedPlace.wikipedia_extracts?.text && (
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                      {selectedPlace.wikipedia_extracts.text}
                    </p>
                  )}
                  {/* Action buttons */}
                  <div className="flex gap-2 pt-2 flex-wrap">
                    <AddToTripButton
                      activity={{
                        name: selectedPlace.name,
                        description:
                          selectedPlace.wikipedia_extracts?.text?.slice(0, 200),
                        location_name:
                          selectedPlace.address?.city || selectedPlace.name,
                        category:
                          selectedPlace.kinds
                            ?.split(",")[0]
                            ?.replace(/_/g, " ") || "attraction",
                      }}
                    />
                    <button
                      onClick={() => openAR(selectedPlace)}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      AR View
                    </button>
                    <button
                      onClick={() => {
                        const coords = getPlaceCoords(selectedPlace);
                        if (!isNaN(coords.lat) && !isNaN(coords.lng)) {
                          setStreetViewPlace({
                            ...selectedPlace,
                            lat: coords.lat,
                            lng: coords.lng,
                          });
                        } else {
                          toast({
                            title: "No coordinates",
                            description:
                              "360° view unavailable for this location.",
                            variant: "destructive",
                          });
                        }
                      }}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent text-accent-foreground text-xs font-medium hover:opacity-90 transition-opacity"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      360° View
                    </button>
                    {selectedPlace.url && (
                      <a
                        href={selectedPlace.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors"
                      >
                        Learn more →
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Map with 2D/3D toggle */}
              {showMap &&
                (() => {
                  const coords = getPlaceCoords(selectedPlace);
                  return !isNaN(coords.lat) && !isNaN(coords.lng) ? (
                    <div className="w-full md:w-[340px] h-[300px] md:h-auto shrink-0 border-t md:border-t-0 md:border-l border-border flex flex-col">
                      {/* 2D/3D Toggle */}
                      <div className="flex items-center justify-between px-3 py-2 bg-secondary/50 border-b border-border">
                        <span className="text-xs font-medium text-muted-foreground">
                          Map View
                        </span>
                        <div className="flex bg-card rounded-lg border border-border overflow-hidden">
                          <button
                            onClick={() => setMapMode("2d")}
                            className={`px-3 py-1 text-xs font-semibold transition-colors ${
                              mapMode === "2d"
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            2D
                          </button>
                          <button
                            onClick={() => setMapMode("3d")}
                            className={`px-3 py-1 text-xs font-semibold transition-colors ${
                              mapMode === "3d"
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            3D
                          </button>
                        </div>
                      </div>
                      {/* Map */}
                      <div className="flex-1 min-h-[250px]">
                        {mapMode === "2d" ? (
                          <WorldMap
                            lat={coords.lat}
                            lng={coords.lng}
                            name={selectedPlace.name}
                            zoom={15}
                            className="w-full h-full"
                          />
                        ) : (
                          <Map3D
                            lat={coords.lat}
                            lng={coords.lng}
                            name={selectedPlace.name}
                            zoom={15}
                            className="w-full h-full"
                          />
                        )}
                      </div>
                    </div>
                  ) : null;
                })()}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        {!searched ? (
          <div className="text-center py-20">
            <Compass className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold text-foreground text-lg">
              Search to discover places
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Try "Kathmandu", "Paris", "Tokyo" and more
            </p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : places.length === 0 ? (
          <div className="text-center py-20">
            <MapPin className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold text-foreground">No places found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Try a different location or category
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {places.map((place, i) => {
              const coords = getPlaceCoords(place);
              const hasCoords = !isNaN(coords.lat) && !isNaN(coords.lng);
              const starRating = toFiveStars(place.rate);

              return (
                <div
                  key={place.xid || i}
                  onClick={() => handleCardClick(place)}
                  className="bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-elevated transition-all cursor-pointer group animate-fade-in"
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  <div className="relative h-44 overflow-hidden bg-primary/5">
                    <img
                      src={
                        place.preview?.source ||
                        fallbackImages[i % fallbackImages.length]
                      }
                      alt={place.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute top-3 right-3 flex gap-1.5">
                      {hasCoords && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openAR(place, e);
                          }}
                          className="w-8 h-8 rounded-full bg-card/80 backdrop-blur-sm flex items-center justify-center hover:bg-card transition-colors"
                          title="AR/VR View"
                        >
                          <Eye className="w-4 h-4 text-primary" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="w-8 h-8 rounded-full bg-card/80 backdrop-blur-sm flex items-center justify-center hover:bg-card transition-colors"
                      >
                        <Heart className="w-4 h-4 text-primary" />
                      </button>
                    </div>
                    {hasCoords && (
                      <div className="absolute bottom-3 left-3 bg-card/80 backdrop-blur-sm px-2 py-1 rounded-lg flex items-center gap-1">
                        <Map className="w-3 h-3 text-primary" />
                        <span className="text-[10px] font-medium text-card-foreground">
                          View on map
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-card-foreground">
                      {place.name}
                    </h3>
                    {place.address?.city && (
                      <div className="flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {[place.address.city, place.address.state]
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                      </div>
                    )}
                    {starRating && (
                      <div className="flex items-center gap-1 mt-2">
                        <Star className="w-3 h-3 text-warning fill-warning" />
                        <span className="text-xs font-semibold text-card-foreground">
                          {starRating}/5
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex gap-1.5 flex-wrap flex-1">
                        {place.kinds
                          ?.split(",")
                          .slice(0, 2)
                          .map((tag: string) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 rounded-full bg-secondary text-xs font-medium text-secondary-foreground capitalize"
                            >
                              {tag.replace(/_/g, " ")}
                            </span>
                          ))}
                      </div>
                      <AddToTripButton
                        activity={{
                          name: place.name,
                          description: place.wikipedia_extracts?.text?.slice(
                            0,
                            200,
                          ),
                          location_name: place.address?.city || place.name,
                          category:
                            place.kinds?.split(",")[0]?.replace(/_/g, " ") ||
                            "attraction",
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Compass(props: any) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}
