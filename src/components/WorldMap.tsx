import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icons in bundlers
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Leaflet resolves its default marker icons via relative URLs that break under
// a bundler. Drop the internal resolver and point at the imported assets.
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)
  ._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface WorldMapProps {
  lat: number;
  lng: number;
  name?: string;
  zoom?: number;
  className?: string;
}

export default function WorldMap({ lat, lng, name, zoom = 14, className = "" }: WorldMapProps) {
  return (
    <div className={`rounded-xl overflow-hidden ${className}`}>
      <MapContainer
        center={[lat, lng]}
        zoom={zoom}
        scrollWheelZoom={true}
        className="w-full h-full"
        style={{ minHeight: "250px" }}
        key={`${lat}-${lng}`}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[lat, lng]}>
          {name && <Popup>{name}</Popup>}
        </Marker>
      </MapContainer>
    </div>
  );
}
