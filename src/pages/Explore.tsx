import { useState, useRef, useCallback } from "react";
import { useLanguage } from "@/hooks/useLanguage";
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
  Plane,
  Hotel,
  Utensils,
  Compass as CompassIcon,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { nominatimSearch } from "@/services/nominatim";
import { otmRadius, otmDetails } from "@/services/opentripmap";
import {
  amadeusFlightOffers,
  amadeusHotelList,
  amadeusCitySearch,
} from "@/services/amadeus";
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
  { label: "Historic", kinds: "historic" },
  { label: "Nature", kinds: "natural" },
  { label: "Architecture", kinds: "architecture" },
  { label: "Museums", kinds: "museums" },
  { label: "Amusements", kinds: "amusements" },
  { label: "Malls & Shopping", kinds: "shops,malls" },
  { label: "Local Shops", kinds: "shops" },
  { label: "Cultural", kinds: "cultural" },
];

type SearchMode = "places" | "flights" | "hotels" | "restaurants";

// Convert OpenTripMap rate (1‑7) to 5‑star scale
// OTM rates: 1=low interest, 2=some interest, 3=good, 4-5=notable, 6=worth a trip, 7=world class
// Only show rating if >= 2 (avoids displaying 0.5★ for uninteresting places)
function toFiveStars(rate: number | undefined): number | null {
  if (!rate || rate < 2) return null;
  // Map 2-7 → 2.5-5 stars (more realistic for travellers)
  const stars = 2.5 + ((rate - 2) / 5) * 2.5;
  return Math.round(stars * 10) / 10;
}

// Fetch an accurate image for a place using Wikipedia/Wikimedia Commons API
// Priority: OTM image → OTM preview → Wikimedia via wikidata → Wikipedia by name → category fallback
async function fetchPlaceImage(place: any): Promise<string | null> {
  // 1. Use OTM-provided image directly
  if (
    place.image &&
    typeof place.image === "string" &&
    place.image.startsWith("http")
  ) {
    return place.image;
  }
  if (
    place.preview?.source &&
    typeof place.preview.source === "string" &&
    place.preview.source.startsWith("http")
  ) {
    return place.preview.source;
  }

  // 2. Try Wikimedia Commons via wikidata ID (most accurate)
  if (place.wikidata) {
    try {
      const wd = place.wikidata;
      const url = `https://commons.wikimedia.org/w/api.php?action=wbgetentities&ids=${wd}&props=claims&format=json&origin=*`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const entity = data?.entities?.[wd];
        // P18 = image claim in Wikidata
        const imageClaim = entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
        if (imageClaim) {
          // Convert file name to Commons URL
          const fileName = imageClaim.replace(/ /g, "_");
          const encoded = encodeURIComponent(fileName);
          return `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=600`;
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 3. Try Wikipedia page image by place name
  if (place.name && place.name.trim().length > 2) {
    try {
      const encoded = encodeURIComponent(place.name.trim());
      const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encoded}&prop=pageimages&pithumbsize=600&format=json&origin=*`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const pages = data?.query?.pages || {};
        const page = Object.values(pages)[0] as any;
        if (page?.thumbnail?.source) return page.thumbnail.source;
      }
    } catch {
      /* ignore */
    }
  }

  return null;
}

// Category-based Unsplash keyword fallback for when no image found
function getCategoryImageKeyword(kinds: string | undefined): string {
  if (!kinds) return "travel,landmark";
  if (kinds.includes("temple") || kinds.includes("religion"))
    return "temple,india";
  if (kinds.includes("historic") || kinds.includes("fort"))
    return "historic,fort,india";
  if (kinds.includes("natural") || kinds.includes("park"))
    return "nature,landscape,india";
  if (kinds.includes("museum")) return "museum,art,heritage";
  if (kinds.includes("beach")) return "beach,coastal";
  if (kinds.includes("mountain")) return "mountain,himalaya";
  if (kinds.includes("architecture")) return "architecture,india";
  if (kinds.includes("amusement")) return "amusement,park";
  return "travel,india,destination";
}

type SearchCache = Record<string, any[]>;

export default function Explore() {
  const { t } = useLanguage();
  const [searchMode, setSearchMode] = useState<SearchMode>("places");

  // ── Places state ──────────────────────────────────────────────────────────
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

  // ── Flights state ─────────────────────────────────────────────────────────
  const [flightOrigin, setFlightOrigin] = useState("");
  const [flightDest, setFlightDest] = useState("");
  const [flightDate, setFlightDate] = useState("");
  const [flightReturn, setFlightReturn] = useState("");
  const [flightAdults, setFlightAdults] = useState(1);
  const [flightResults, setFlightResults] = useState<any[]>([]);
  const [flightLoading, setFlightLoading] = useState(false);
  const [flightSearched, setFlightSearched] = useState(false);

  // ── Hotels state ──────────────────────────────────────────────────────────
  const [hotelCity, setHotelCity] = useState("");
  const [hotelCheckIn, setHotelCheckIn] = useState("");
  const [hotelCheckOut, setHotelCheckOut] = useState("");
  const [hotelAdults, setHotelAdults] = useState(1);
  const [hotelResults, setHotelResults] = useState<any[]>([]);
  const [hotelLoading, setHotelLoading] = useState(false);
  const [hotelSearched, setHotelSearched] = useState(false);

  // ── Restaurants state ─────────────────────────────────────────────────────
  const [restaurantQuery, setRestaurantQuery] = useState("");
  const [restaurantResults, setRestaurantResults] = useState<any[]>([]);
  const [restaurantLoading, setRestaurantLoading] = useState(false);
  const [restaurantSearched, setRestaurantSearched] = useState(false);

  const { toast } = useToast();
  const cacheRef = useRef<SearchCache>({});
  const getCacheKey = (query: string, filter: string) =>
    `${query.toLowerCase().trim()}|${filter}`;

  // ── Places search (OpenTripMap) ───────────────────────────────────────────
  const handleSearch = useCallback(
    async (filterOverride?: string) => {
      if (!searchQuery.trim()) return;
      const currentFilter = filterOverride || activeFilter;
      const cacheKey = getCacheKey(searchQuery, currentFilter);
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
        const sorted = [...items].sort(
          (a: any, b: any) => (b.rate || 0) - (a.rate || 0),
        );
        const detailed: any[] = [];
        for (const p of sorted.slice(0, 20)) {
          if (!p.xid) continue;
          try {
            const detail = await otmDetails(p.xid);
            if (detail) {
              // Fetch accurate image asynchronously (non-blocking, fills in later)
              const enriched = { ...detail };
              detailed.push(enriched);
            }
            await new Promise((r) => setTimeout(r, 200));
          } catch {
            detailed.push({ ...p, name: p.name || "Unknown Place" });
          }
        }
        const results = detailed.filter(
          (p: any) => p.name && p.name.trim() !== "",
        );

        // Enrich images in background — fetch Wikipedia/Wikidata images
        const enriched = await Promise.all(
          results.map(async (place: any) => {
            const img = await fetchPlaceImage(place).catch(() => null);
            return img ? { ...place, _resolvedImage: img } : place;
          }),
        );

        cacheRef.current[cacheKey] = enriched;
        setPlaces(enriched);
        if (enriched.length === 0)
          toast({
            title: "No named places found",
            description: "Try a broader search or different category.",
          });
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
    if (searched && searchQuery.trim()) handleSearch(filter);
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

  // ── Flights search (Amadeus) ──────────────────────────────────────────────
  const handleFlightSearch = async () => {
    if (!flightOrigin.trim() || !flightDest.trim() || !flightDate) {
      toast({
        title: "Missing fields",
        description: "Please enter origin, destination and departure date.",
        variant: "destructive",
      });
      return;
    }
    setFlightLoading(true);
    setFlightSearched(true);
    setFlightResults([]);
    try {
      const data = await amadeusFlightOffers({
        origin: flightOrigin.trim().toUpperCase(),
        destination: flightDest.trim().toUpperCase(),
        departureDate: flightDate,
        adults: flightAdults,
        max: 10,
        returnDate: flightReturn || undefined,
      });
      const offers = (data as any)?.data || [];
      setFlightResults(offers);
      if (offers.length === 0)
        toast({
          title: "No flights found",
          description: "Try different dates or airports.",
        });
    } catch (err: any) {
      toast({
        title: "Flight search failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setFlightLoading(false);
    }
  };

  // ── Hotels search (Amadeus) ───────────────────────────────────────────────
  const handleHotelSearch = async () => {
    if (!hotelCity.trim()) {
      toast({
        title: "Missing city",
        description: "Please enter a city to search hotels.",
        variant: "destructive",
      });
      return;
    }
    setHotelLoading(true);
    setHotelSearched(true);
    setHotelResults([]);
    try {
      const cityData = await amadeusCitySearch({
        keyword: hotelCity.trim(),
        subType: "CITY",
      });
      const cities = (cityData as any)?.data || [];
      const cityCode =
        cities[0]?.iataCode || hotelCity.trim().slice(0, 3).toUpperCase();
      const hotelData = await amadeusHotelList({ cityCode, radius: 5 });
      const hotels = (hotelData as any)?.data || [];
      setHotelResults(hotels.slice(0, 20));
      if (hotels.length === 0)
        toast({
          title: "No hotels found",
          description: "Try a different city name or IATA code.",
        });
    } catch (err: any) {
      toast({
        title: "Hotel search failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setHotelLoading(false);
    }
  };

  // ── Restaurants search (OpenTripMap foods) ────────────────────────────────
  const handleRestaurantSearch = async () => {
    if (!restaurantQuery.trim()) return;
    setRestaurantLoading(true);
    setRestaurantSearched(true);
    setRestaurantResults([]);
    try {
      const geoResults = await nominatimSearch(restaurantQuery, 1);
      if (!geoResults || geoResults.length === 0) {
        toast({
          title: "Location not found",
          description: "Try a different city name.",
          variant: "destructive",
        });
        setRestaurantLoading(false);
        return;
      }
      const { lat, lon } = geoResults[0];
      const raw = await otmRadius({
        lat: parseFloat(lat),
        lon: parseFloat(lon),
        radius: 5000,
        kinds: "foods,restaurants,fast_food,cafes",
        limit: 40,
      });
      const items = (raw as any)?.features
        ? (raw as any).features.map((f: any) => ({
            ...f.properties,
            point: f.geometry,
          }))
        : Array.isArray(raw)
          ? raw
          : [];
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

      // Enrich with accurate images
      const enriched = await Promise.all(
        results.map(async (place: any) => {
          const img = await fetchPlaceImage(place).catch(() => null);
          return img ? { ...place, _resolvedImage: img } : place;
        }),
      );
      setRestaurantResults(enriched);
      if (enriched.length === 0)
        toast({
          title: "No restaurants found",
          description: "Try a broader area.",
        });
    } catch (err: any) {
      toast({
        title: "Search failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setRestaurantLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-6 flex flex-col min-h-screen lg:h-screen lg:overflow-hidden">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 md:mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">
            {t("explore")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("discover")} · {t("flights")} · {t("hotels")}
          </p>
        </div>
      </div>

      {/* Mode switcher tabs */}
      <div className="flex gap-1 mb-4 bg-secondary/50 p-1 rounded-xl overflow-x-auto shrink-0">
        {(
          [
            {
              id: "places" as SearchMode,
              label: t("explore"),
              icon: CompassIcon,
            },
            { id: "flights" as SearchMode, label: t("flights"), icon: Plane },
            { id: "hotels" as SearchMode, label: t("hotels"), icon: Hotel },
            {
              id: "restaurants" as SearchMode,
              label: t("discover") + " Food",
              icon: Utensils,
            },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSearchMode(id)}
            className={`flex items-center gap-1 md:gap-1.5 px-2 md:px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition-all whitespace-nowrap flex-1 justify-center ${
              searchMode === id
                ? "bg-card text-foreground shadow-card"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* ── PLACES ── */}
      {searchMode === "places" && (
        <>
          {/* Search bar */}
          <div className="flex gap-2 md:gap-3 mb-3 md:mb-4 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search a city or destination…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-card"
              />
            </div>
            <button
              onClick={() => handleSearch()}
              disabled={loading}
              className="px-4 md:px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 shrink-0"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t("search")
              )}
            </button>
          </div>

          {/* Category filters */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1 shrink-0">
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

          {/* Detail Modal */}
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
                      <div className="flex gap-2 pt-2 flex-wrap">
                        <AddToTripButton
                          activity={{
                            name: selectedPlace.name,
                            description:
                              selectedPlace.wikipedia_extracts?.text?.slice(
                                0,
                                200,
                              ),
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
                  {showMap &&
                    (() => {
                      const coords = getPlaceCoords(selectedPlace);
                      return !isNaN(coords.lat) && !isNaN(coords.lng) ? (
                        <div className="w-full md:w-[340px] h-[300px] md:h-auto shrink-0 border-t md:border-t-0 md:border-l border-border flex flex-col">
                          <div className="flex items-center justify-between px-3 py-2 bg-secondary/50 border-b border-border">
                            <span className="text-xs font-medium text-muted-foreground">
                              Map View
                            </span>
                            <div className="flex bg-card rounded-lg border border-border overflow-hidden">
                              <button
                                onClick={() => setMapMode("2d")}
                                className={`px-3 py-1 text-xs font-semibold transition-colors ${mapMode === "2d" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                              >
                                2D
                              </button>
                              <button
                                onClick={() => setMapMode("3d")}
                                className={`px-3 py-1 text-xs font-semibold transition-colors ${mapMode === "3d" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                              >
                                3D
                              </button>
                            </div>
                          </div>
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

          {/* Places grid */}
          <div className="flex-1 overflow-y-auto">
            {!searched ? (
              <div className="text-center py-20">
                <CompassIcon className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
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
                <h3 className="font-semibold text-foreground">
                  No places found
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Try a different location or category
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
                {places.map((place, i) => {
                  const coords = getPlaceCoords(place);
                  const hasCoords = !isNaN(coords.lat) && !isNaN(coords.lng);
                  const starRating = toFiveStars(place.rate);
                  // Image priority: resolved Wikipedia/Wikidata → OTM preview → OTM image → fallback
                  const placeImage =
                    place._resolvedImage ||
                    place.preview?.source ||
                    place.image ||
                    null;
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
                            placeImage ||
                            fallbackImages[i % fallbackImages.length]
                          }
                          alt={place.name}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              fallbackImages[i % fallbackImages.length];
                          }}
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
                            onClick={(e) => e.stopPropagation()}
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
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`w-3 h-3 ${
                                  s <= Math.floor(starRating)
                                    ? "text-warning fill-warning"
                                    : s - starRating < 1
                                      ? "text-warning fill-warning/40"
                                      : "text-muted-foreground"
                                }`}
                              />
                            ))}
                            <span className="text-xs font-semibold text-card-foreground ml-0.5">
                              {starRating}
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
                              description:
                                place.wikipedia_extracts?.text?.slice(0, 200),
                              location_name: place.address?.city || place.name,
                              category:
                                place.kinds
                                  ?.split(",")[0]
                                  ?.replace(/_/g, " ") || "attraction",
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
        </>
      )}

      {/* ── FLIGHTS ── */}
      {searchMode === "flights" && (
        <div className="flex-1 overflow-y-auto space-y-4">
          <div className="bg-card rounded-2xl p-4 md:p-5 shadow-card mb-4 shrink-0">
            <h3 className="font-semibold text-card-foreground mb-3 md:mb-4 flex items-center gap-2">
              <Plane className="w-4 h-4 text-primary" />
              Search Flights (Amadeus)
            </h3>
            <p className="text-xs text-muted-foreground">
              Enter IATA airport codes (e.g. DEL, BOM, GOI, JFK, LHR)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 mb-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  From (IATA)
                </label>
                <input
                  type="text"
                  placeholder="e.g. DEL"
                  value={flightOrigin}
                  onChange={(e) =>
                    setFlightOrigin(e.target.value.toUpperCase())
                  }
                  maxLength={3}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 uppercase font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  To (IATA)
                </label>
                <input
                  type="text"
                  placeholder="e.g. BOM"
                  value={flightDest}
                  onChange={(e) => setFlightDest(e.target.value.toUpperCase())}
                  maxLength={3}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 uppercase font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Departure Date
                </label>
                <input
                  type="date"
                  value={flightDate}
                  onChange={(e) => setFlightDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Return Date (optional)
                </label>
                <input
                  type="date"
                  value={flightReturn}
                  onChange={(e) => setFlightReturn(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Passengers
                </label>
                <input
                  type="number"
                  min={1}
                  max={9}
                  value={flightAdults}
                  onChange={(e) => setFlightAdults(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
            <button
              onClick={handleFlightSearch}
              disabled={flightLoading}
              className="w-full px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {flightLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plane className="w-4 h-4" />
              )}
              Search Flights
            </button>
          </div>

          {flightLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          )}

          {flightSearched && !flightLoading && flightResults.length === 0 && (
            <div className="text-center py-12">
              <Plane className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold text-foreground">No flights found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Try different dates or airport codes
              </p>
            </div>
          )}

          {flightResults.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-muted-foreground">
                {flightResults.length} flight offer
                {flightResults.length !== 1 ? "s" : ""} found
              </p>
              {flightResults.map((offer: any, i: number) => {
                const price = offer?.price;
                const itinerary = offer?.itineraries?.[0];
                const segments = itinerary?.segments || [];
                const firstSeg = segments[0];
                const lastSeg = segments[segments.length - 1];
                const dep = firstSeg?.departure;
                const arr = lastSeg?.arrival;
                const stops = segments.length - 1;
                const rawDur = itinerary?.duration || "";
                const duration = rawDur
                  .replace("PT", "")
                  .replace("H", "h ")
                  .replace("M", "m")
                  .trim();
                return (
                  <div
                    key={i}
                    className="bg-card rounded-2xl p-4 shadow-card hover:shadow-elevated transition-shadow"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Plane className="w-4 h-4 text-primary" />
                        <span className="text-sm font-semibold text-card-foreground">
                          {firstSeg?.carrierCode} {firstSeg?.number}
                        </span>
                        {stops === 0 ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success font-medium">
                            Non-stop
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning font-medium">
                            {stops} stop{stops > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-primary">
                          {price?.currency === "INR" || !price?.currency
                            ? "₹"
                            : price?.currency === "USD"
                              ? "₹"
                              : price?.currency}{" "}
                          {Number(price?.total || 0).toLocaleString("en-IN")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          per traveller
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 py-2">
                      <div className="text-center min-w-[56px]">
                        <p className="text-xl font-bold text-card-foreground">
                          {dep?.iataCode}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {dep?.at
                            ? new Date(dep.at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "--"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {dep?.at
                            ? new Date(dep.at).toLocaleDateString([], {
                                day: "numeric",
                                month: "short",
                              })
                            : ""}
                        </p>
                      </div>
                      <div className="flex-1 flex flex-col items-center gap-1">
                        <p className="text-[10px] text-muted-foreground">
                          {duration}
                        </p>
                        <div className="w-full flex items-center gap-1">
                          <div className="flex-1 border-t border-dashed border-border" />
                          <Plane className="w-3 h-3 text-muted-foreground rotate-90" />
                          <div className="flex-1 border-t border-dashed border-border" />
                        </div>
                        {stops > 0 && (
                          <p className="text-[10px] text-warning">
                            via{" "}
                            {segments
                              .slice(0, -1)
                              .map((s: any) => s.arrival?.iataCode)
                              .join(", ")}
                          </p>
                        )}
                      </div>
                      <div className="text-center min-w-[56px]">
                        <p className="text-xl font-bold text-card-foreground">
                          {arr?.iataCode}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {arr?.at
                            ? new Date(arr.at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "--"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {arr?.at
                            ? new Date(arr.at).toLocaleDateString([], {
                                day: "numeric",
                                month: "short",
                              })
                            : ""}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 pt-3 border-t border-border flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs text-muted-foreground">
                        Cabin:{" "}
                        {offer?.travelerPricings?.[0]?.fareDetailsBySegment?.[0]
                          ?.cabin || "Economy"}
                      </span>
                      <span className="text-xs font-semibold text-card-foreground">
                        {flightAdults} pax · Total: ₹
                        {Number(
                          price?.grandTotal || price?.total || 0,
                        ).toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── HOTELS ── */}
      {searchMode === "hotels" && (
        <div className="flex-1 overflow-y-auto space-y-4">
          <div className="bg-card rounded-2xl p-4 md:p-5 shadow-card mb-4 shrink-0">
            <h3 className="font-semibold text-card-foreground mb-3 md:mb-4 flex items-center gap-2">
              <Hotel className="w-4 h-4 text-primary" />
              Search Hotels (Amadeus)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 mb-4">
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">
                  City Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Mumbai, Paris, New York, Tokyo"
                  value={hotelCity}
                  onChange={(e) => setHotelCity(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Check-in (optional)
                </label>
                <input
                  type="date"
                  value={hotelCheckIn}
                  onChange={(e) => setHotelCheckIn(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Check-out (optional)
                </label>
                <input
                  type="date"
                  value={hotelCheckOut}
                  onChange={(e) => setHotelCheckOut(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Guests
                </label>
                <input
                  type="number"
                  min={1}
                  max={9}
                  value={hotelAdults}
                  onChange={(e) => setHotelAdults(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
            <button
              onClick={handleHotelSearch}
              disabled={hotelLoading}
              className="w-full px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {hotelLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Hotel className="w-4 h-4" />
              )}
              Search Hotels
            </button>
          </div>

          {hotelLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          )}

          {hotelSearched && !hotelLoading && hotelResults.length === 0 && (
            <div className="text-center py-12">
              <Hotel className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold text-foreground">No hotels found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Try a different city name
              </p>
            </div>
          )}

          {hotelResults.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-muted-foreground">
                {hotelResults.length} hotels found near {hotelCity}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {hotelResults.map((hotel: any, i: number) => (
                  <div
                    key={hotel.hotelId || i}
                    className="bg-card rounded-2xl p-4 shadow-card hover:shadow-elevated transition-shadow"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Hotel className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-card-foreground truncate">
                          {hotel.name || "Hotel"}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3" />
                          {hotel.address?.cityName || hotelCity}
                          {hotel.address?.countryCode
                            ? `, ${hotel.address.countryCode}`
                            : ""}
                        </p>
                        {hotel.distance && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            📍 {Number(hotel.distance?.value || 0).toFixed(1)}{" "}
                            {hotel.distance?.unit || "KM"} from center
                          </p>
                        )}
                        {hotel.rating && (
                          <div className="flex items-center gap-1 mt-1">
                            {[
                              ...Array(
                                Math.min(5, Math.round(Number(hotel.rating))),
                              ),
                            ].map((_, j) => (
                              <Star
                                key={j}
                                className="w-3 h-3 text-warning fill-warning"
                              />
                            ))}
                            <span className="text-xs text-muted-foreground">
                              {hotel.rating}-star
                            </span>
                          </div>
                        )}
                        {hotelCheckIn && hotelCheckOut && (
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(hotelCheckIn).toLocaleDateString([], {
                              day: "numeric",
                              month: "short",
                            })}
                            {" → "}
                            {new Date(hotelCheckOut).toLocaleDateString([], {
                              day: "numeric",
                              month: "short",
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-border">
                      <AddToTripButton
                        activity={{
                          name: hotel.name || "Hotel",
                          description: `${hotel.rating ? hotel.rating + "-star hotel" : "Hotel"} in ${hotel.address?.cityName || hotelCity}`,
                          location_name: hotel.address?.cityName || hotelCity,
                          category: "accommodation",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── RESTAURANTS ── */}
      {searchMode === "restaurants" && (
        <div className="flex-1 overflow-y-auto space-y-4">
          <div className="bg-card rounded-2xl p-4 md:p-5 shadow-card mb-4 shrink-0">
            <h3 className="font-semibold text-card-foreground mb-3 md:mb-4 flex items-center gap-2">
              <Utensils className="w-4 h-4 text-primary" />
              Find Restaurants & Cafes
            </h3>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search a city (e.g. Mumbai, Paris)..."
                  value={restaurantQuery}
                  onChange={(e) => setRestaurantQuery(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleRestaurantSearch()
                  }
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <button
                onClick={handleRestaurantSearch}
                disabled={restaurantLoading}
                className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              >
                {restaurantLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Utensils className="w-4 h-4" />
                )}
                Search
              </button>
            </div>
          </div>

          {restaurantLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          )}

          {restaurantSearched &&
            !restaurantLoading &&
            restaurantResults.length === 0 && (
              <div className="text-center py-12">
                <Utensils className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="font-semibold text-foreground">
                  No restaurants found
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Try a different city
                </p>
              </div>
            )}

          {restaurantResults.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-muted-foreground">
                {restaurantResults.length} restaurants found near{" "}
                {restaurantQuery}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 overflow-y-auto">
                {restaurantResults.map((place: any, i: number) => {
                  const starRating = toFiveStars(place.rate);
                  const placeImage =
                    place._resolvedImage ||
                    place.preview?.source ||
                    place.image ||
                    null;
                  return (
                    <div
                      key={place.xid || i}
                      className="bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-elevated transition-shadow animate-fade-in"
                      style={{ animationDelay: `${i * 0.05}s` }}
                    >
                      <div className="relative h-36 overflow-hidden bg-warning/5">
                        <img
                          src={
                            placeImage ||
                            fallbackImages[i % fallbackImages.length]
                          }
                          alt={place.name}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              fallbackImages[i % fallbackImages.length];
                          }}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                        <div className="absolute bottom-2 left-3">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-warning/90 text-white font-medium">
                            🍽️ Restaurant
                          </span>
                        </div>
                      </div>
                      <div className="p-4">
                        <p className="font-semibold text-card-foreground text-sm">
                          {place.name}
                        </p>
                        {place.address?.city && (
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {[place.address.city, place.address.state]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                        )}
                        {starRating && (
                          <div className="flex items-center gap-1 mt-2">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`w-3 h-3 ${
                                  s <= Math.floor(starRating)
                                    ? "text-warning fill-warning"
                                    : s - starRating < 1
                                      ? "text-warning fill-warning/40"
                                      : "text-muted-foreground"
                                }`}
                              />
                            ))}
                            <span className="text-xs font-semibold text-card-foreground ml-0.5">
                              {starRating}
                            </span>
                          </div>
                        )}
                        {place.wikipedia_extracts?.text && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                            {place.wikipedia_extracts.text}
                          </p>
                        )}
                        <div className="mt-3">
                          <AddToTripButton
                            activity={{
                              name: place.name,
                              description:
                                place.wikipedia_extracts?.text?.slice(0, 200),
                              location_name: place.address?.city || place.name,
                              category: "food",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!restaurantSearched && (
            <div className="text-center py-20">
              <Utensils className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-foreground text-lg">
                Find places to eat
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Search any city to discover restaurants and cafes
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
