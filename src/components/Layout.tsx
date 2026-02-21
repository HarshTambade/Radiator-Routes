import { useState } from "react";
import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { AlertTriangle, Accessibility } from "lucide-react";
import SOSPanel from "./SOSPanel";
import AccessibilityPanel from "./AccessibilityPanel";

export function Layout() {
  const [showSOS, setShowSOS] = useState(false);
  const [showA11y, setShowA11y] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* Floating SOS Button */}
      <button
        onClick={() => {
          setShowSOS(true);
          setShowA11y(false);
        }}
        aria-label="SOS Emergency"
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-red-600 text-white shadow-lg flex flex-col items-center justify-center gap-0.5 hover:bg-red-700 active:scale-95 transition-all"
        style={{
          boxShadow:
            "0 0 0 4px rgba(239,68,68,0.2), 0 4px 20px rgba(239,68,68,0.4)",
        }}
      >
        <AlertTriangle className="w-5 h-5" />
        <span className="text-[9px] font-black tracking-widest">SOS</span>
      </button>

      {/* Floating Accessibility Button */}
      <button
        onClick={() => {
          setShowA11y(true);
          setShowSOS(false);
        }}
        aria-label="Accessibility Options"
        className="fixed bottom-24 right-6 z-40 w-12 h-12 rounded-full bg-purple-600 text-white shadow-lg flex items-center justify-center hover:bg-purple-700 active:scale-95 transition-all"
        style={{
          boxShadow: "0 4px 16px rgba(147,51,234,0.35)",
        }}
      >
        <Accessibility className="w-5 h-5" />
      </button>

      {/* SOS Modal */}
      {showSOS && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setShowSOS(false)}
        >
          <div
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between bg-card rounded-t-2xl px-4 py-3 border-b border-border sticky top-0 z-10">
              <span className="text-sm font-bold text-card-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                SOS &amp; Emergency
              </span>
              <button
                onClick={() => setShowSOS(false)}
                className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-lg leading-none"
                aria-label="Close SOS panel"
              >
                ×
              </button>
            </div>
            <SOSPanel />
          </div>
        </div>
      )}

      {/* Accessibility Modal */}
      {showA11y && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setShowA11y(false)}
        >
          <div
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between bg-card rounded-t-2xl px-4 py-3 border-b border-border sticky top-0 z-10">
              <span className="text-sm font-bold text-card-foreground flex items-center gap-2">
                <Accessibility className="w-4 h-4 text-purple-600" />
                Accessibility
              </span>
              <button
                onClick={() => setShowA11y(false)}
                className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-lg leading-none"
                aria-label="Close accessibility panel"
              >
                ×
              </button>
            </div>
            <AccessibilityPanel />
          </div>
        </div>
      )}
    </div>
  );
}
