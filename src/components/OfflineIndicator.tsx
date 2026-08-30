import { useEffect, useState } from "react";
import { AlertCircle, WifiOff, Wifi, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export type ConnectionStatus = "online" | "offline" | "slow";

const ConnectionStatusContext = {
  status: "online" as ConnectionStatus,
  setOffline: () => {},
  setOnline: () => {},
  setSlow: () => {},
};

export function useConnectionStatus() {
  return ConnectionStatusContext;
}

export function OfflineIndicator() {
  const [status, setStatus] = useState<ConnectionStatus>("online");
  const { toast } = useToast();

  useEffect(() => {
    const checkConnection = () => {
      const isConnected = navigator.onLine;
      if (!isConnected) {
        setStatus("offline");
        toast({
          title: "Offline",
          description: "You're offline. Some features may be limited.",
          variant: "destructive",
        });
      } else if (status === "offline") {
        setStatus("online");
        toast({
          title: "Reconnected",
          description: "You're back online. All features are available.",
        });
      }
    };

    checkConnection();
    window.addEventListener("online", checkConnection);
    window.addEventListener("offline", checkConnection);

    return () => {
      window.removeEventListener("online", checkConnection);
      window.removeEventListener("offline", checkConnection);
    };
  }, [status, toast]);

  if (status === "online") {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-destructive text-destructive-foreground p-3 text-sm md:text-base animate-in slide-in-from-bottom-5 duration-300">
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
        <WifiOff className="h-5 w-5 md:h-6 md:w-6 flex-shrink-0" />
        <span className="font-medium">
          {status === "offline" ? "You're offline. Some features may be limited." : "Slow connection detected. Some features may be limited."}
        </span>
      </div>
    </div>
  );
}

export function OfflineAware({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isOnline && fallback) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

export default OfflineIndicator;
