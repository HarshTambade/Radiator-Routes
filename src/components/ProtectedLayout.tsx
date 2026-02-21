import { useState, useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AppSidebar } from "./AppSidebar";
import AIAssistant from "./AIAssistant";
import MobileNav from "./MobileNav";
import MobileHeader from "./MobileHeader";
import PWAInstallPrompt from "./PWAInstallPrompt";
import SOSPanel from "./SOSPanel";
import AccessibilityPanel from "./AccessibilityPanel";
import { AlertTriangle, Accessibility, X } from "lucide-react";

export function ProtectedLayout() {
  const { user, loading } = useAuth();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showSOS, setShowSOS] = useState(false);
  const [showA11y, setShowA11y] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, []);

  // Prevent body scroll when modal/drawer open
  useEffect(() => {
    const shouldLock = mobileSidebarOpen || showSOS || showA11y;
    document.body.style.overflow = shouldLock ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileSidebarOpen, showSOS, showA11y]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center">
            <span className="text-white font-black text-sm">RR</span>
          </div>
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* ── Desktop Sidebar (hidden on mobile) ── */}
      <div className="hidden md:flex md:shrink-0">
        <AppSidebar
          onSOSOpen={() => setShowSOS(true)}
          onA11yOpen={() => setShowA11y(true)}
        />
      </div>

      {/* ── Mobile Sidebar Drawer ── */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          aria-modal="true"
          role="dialog"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
          />
          {/* Drawer */}
          <div className="absolute left-0 top-0 bottom-0 w-[280px] bg-card shadow-2xl overflow-y-auto animate-slide-in-left">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-card z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
                  <span className="text-white font-black text-xs">RR</span>
                </div>
                <span className="font-bold text-card-foreground text-sm">
                  Radiator Routes
                </span>
              </div>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
                aria-label="Close menu"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <AppSidebar
              onSOSOpen={() => {
                setMobileSidebarOpen(false);
                setShowSOS(true);
              }}
              onA11yOpen={() => {
                setMobileSidebarOpen(false);
                setShowA11y(true);
              }}
              mobileDrawer
            />
          </div>
        </div>
      )}

      {/* ── Mobile Top Header (hidden on desktop) ── */}
      <MobileHeader
        onMenuOpen={() => setMobileSidebarOpen(true)}
        onSOSOpen={() => setShowSOS(true)}
      />

      {/* ── Main Content ── */}
      <main className="flex-1 overflow-auto min-w-0 pt-14 md:pt-0 pb-20 md:pb-0">
        <Outlet />
      </main>

      {/* ── AI Assistant (desktop only) ── */}
      <div className="hidden md:block">
        <AIAssistant />
      </div>

      {/* ── Mobile Bottom Nav ── */}
      <MobileNav />

      {/* ── Floating SOS Button (mobile: above bottom nav, desktop: bottom-right) ── */}
      <button
        onClick={() => setShowSOS(true)}
        aria-label="SOS Emergency"
        className="fixed bottom-[88px] right-4 md:bottom-6 md:right-6 z-40 w-13 h-13 md:w-14 md:h-14 rounded-full bg-red-600 text-white shadow-lg flex flex-col items-center justify-center gap-0.5 hover:bg-red-700 active:scale-95 transition-all select-none"
        style={{
          width: "3.25rem",
          height: "3.25rem",
          boxShadow:
            "0 0 0 4px rgba(239,68,68,0.2), 0 4px 20px rgba(239,68,68,0.4)",
        }}
      >
        <AlertTriangle
          className="w-4.5 h-4.5"
          style={{ width: "1.1rem", height: "1.1rem" }}
        />
        <span className="text-[8px] font-black tracking-widest leading-none">
          SOS
        </span>
      </button>

      {/* ── Floating Accessibility Button ── */}
      <button
        onClick={() => setShowA11y(true)}
        aria-label="Accessibility Options"
        className="fixed bottom-[148px] right-4 md:bottom-[88px] md:right-6 z-40 rounded-full bg-purple-600 text-white shadow-lg flex items-center justify-center hover:bg-purple-700 active:scale-95 transition-all"
        style={{
          width: "2.75rem",
          height: "2.75rem",
          boxShadow: "0 4px 16px rgba(147,51,234,0.35)",
        }}
      >
        <Accessibility className="w-4 h-4" />
      </button>

      {/* ── SOS Modal ── */}
      {showSOS && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setShowSOS(false)}
        >
          <div
            className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl shadow-2xl bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border sticky top-0 bg-card z-10">
              <span className="text-sm font-bold text-card-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                SOS &amp; Emergency
              </span>
              <button
                onClick={() => setShowSOS(false)}
                className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <SOSPanel />
            <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
          </div>
        </div>
      )}

      {/* ── Accessibility Modal ── */}
      {showA11y && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setShowA11y(false)}
        >
          <div
            className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl shadow-2xl bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border sticky top-0 bg-card z-10">
              <span className="text-sm font-bold text-card-foreground flex items-center gap-2">
                <Accessibility className="w-4 h-4 text-purple-600" />
                Accessibility
              </span>
              <button
                onClick={() => setShowA11y(false)}
                className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <AccessibilityPanel />
            <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
          </div>
        </div>
      )}

      {/* ── PWA Install Prompt ── */}
      <PWAInstallPrompt />
    </div>
  );
}
