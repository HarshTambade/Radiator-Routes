import { useState, useRef, useEffect } from "react";
import { X, Camera, Compass, MapPin, Navigation2, Maximize2, Minimize2 } from "lucide-react";

interface ARViewerProps {
  lat: number;
  lng: number;
  name: string;
  description?: string;
  onClose: () => void;
}

export default function ARViewer({ lat, lng, name, description, onClose }: ARViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [heading, setHeading] = useState(0);
  const [distance, setDistance] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Start camera
  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setCameraActive(true);
        }
      } catch {
        setCameraActive(false);
      }
    };

    startCamera();

    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Get user location and compute distance
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const uLat = pos.coords.latitude;
        const uLng = pos.coords.longitude;

        // Haversine distance
        const R = 6371;
        const dLat = ((lat - uLat) * Math.PI) / 180;
        const dLng = ((lng - uLng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((uLat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
        const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        setDistance(d);

        // Bearing
        const y = Math.sin(((lng - uLng) * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180);
        const x =
          Math.cos((uLat * Math.PI) / 180) * Math.sin((lat * Math.PI) / 180) -
          Math.sin((uLat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.cos(((lng - uLng) * Math.PI) / 180);
        setHeading(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
      },
      () => {},
      { enableHighAccuracy: true }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [lat, lng]);

  const toggleFullscreen = () => {
    if (!fullscreen && containerRef.current) {
      containerRef.current.requestFullscreen?.();
      setFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
  };

  const formatDistance = (d: number) => {
    if (d < 1) return `${Math.round(d * 1000)}m`;
    return `${d.toFixed(1)}km`;
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[60] bg-black flex flex-col"
    >
      {/* Camera feed */}
      <div className="relative flex-1">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* AR Overlay */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Top HUD */}
          <div className="absolute top-0 left-0 right-0 p-4 pointer-events-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2">
                  <Camera className="w-4 h-4 text-white" />
                  <span className="text-white text-xs font-medium">AR View</span>
                  {cameraActive && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleFullscreen}
                  className="bg-black/60 backdrop-blur-md p-2 rounded-full text-white hover:bg-black/80 transition-colors"
                >
                  {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button
                  onClick={onClose}
                  className="bg-black/60 backdrop-blur-md p-2 rounded-full text-white hover:bg-black/80 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Center crosshair */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="w-16 h-16 border-2 border-white/40 rounded-full flex items-center justify-center">
              <div className="w-2 h-2 bg-white/60 rounded-full" />
            </div>
          </div>

          {/* Location marker overlay - positioned based on bearing */}
          <div
            className="absolute top-1/3 left-1/2 -translate-x-1/2 pointer-events-auto"
            style={{ transform: `translateX(${Math.sin((heading * Math.PI) / 180) * 50}px)` }}
          >
            <div className="flex flex-col items-center gap-2 animate-fade-in">
              {/* Marker pin */}
              <div className="relative">
                <div className="w-14 h-14 rounded-full bg-primary/90 backdrop-blur-md flex items-center justify-center shadow-lg border-2 border-white/30 animate-pulse">
                  <MapPin className="w-6 h-6 text-primary-foreground" />
                </div>
                {/* Pulse ring */}
                <div className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
              </div>

              {/* Info card */}
              <div className="bg-black/70 backdrop-blur-md rounded-xl px-4 py-3 max-w-[260px] border border-white/10">
                <h3 className="text-white font-bold text-sm text-center">{name}</h3>
                {description && (
                  <p className="text-white/70 text-xs mt-1 text-center line-clamp-2">{description}</p>
                )}
                <div className="flex items-center justify-center gap-3 mt-2">
                  {distance !== null && (
                    <span className="flex items-center gap-1 text-xs text-green-400 font-semibold">
                      <Navigation2 className="w-3 h-3" />
                      {formatDistance(distance)}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-xs text-blue-400 font-semibold">
                    <Compass className="w-3 h-3" />
                    {Math.round(heading)}°
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom compass bar */}
          <div className="absolute bottom-0 left-0 right-0 p-4 pointer-events-auto">
            <div className="bg-black/60 backdrop-blur-md rounded-2xl px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <Compass className="w-5 h-5 text-primary" style={{ transform: `rotate(${heading}deg)` }} />
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">{name}</p>
                  <p className="text-white/60 text-xs">
                    {lat.toFixed(4)}°N, {lng.toFixed(4)}°E
                  </p>
                </div>
              </div>
              {distance !== null && (
                <div className="text-right">
                  <p className="text-white text-lg font-bold">{formatDistance(distance)}</p>
                  <p className="text-white/60 text-xs">away</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Fallback if no camera */}
        {!cameraActive && (
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center">
            <div className="text-center text-white/70">
              <Camera className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Camera not available</p>
              <p className="text-xs mt-1">AR overlay shown on fallback view</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
