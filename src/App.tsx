import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider } from "@/hooks/useAuth";
import { LanguageProvider } from "@/hooks/useLanguage";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import ErrorBoundary from "@/components/ErrorBoundary";

// Route-level code splitting — each page ships as its own chunk so a visitor
// landing on "/" doesn't download the itinerary planner, maps or community.
const Landing = lazy(() => import("./pages/Landing"));
const Auth = lazy(() => import("./pages/Auth"));
const JoinTrip = lazy(() => import("./pages/JoinTrip"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Itinerary = lazy(() => import("./pages/Itinerary"));
const Explore = lazy(() => import("./pages/Explore"));
const Guide = lazy(() => import("./pages/Guide"));
const Friends = lazy(() => import("./pages/Friends"));
const Community = lazy(() => import("./pages/Community"));
const Profile = lazy(() => import("./pages/Profile"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function RouteFallback() {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background"
      role="status"
      aria-live="polite"
      aria-label="Loading page"
    >
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );
}

const App = () => (
  <ErrorBoundary scope="root">
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LanguageProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/" element={<Landing />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/join/:inviteCode" element={<JoinTrip />} />
                  <Route element={<ProtectedLayout />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/itinerary" element={<Itinerary />} />
                    <Route path="/itinerary/:tripId" element={<Itinerary />} />
                    <Route path="/explore" element={<Explore />} />
                    <Route path="/guide" element={<Guide />} />
                    <Route path="/friends" element={<Friends />} />
                    <Route path="/community" element={<Community />} />
                    <Route path="/profile" element={<Profile />} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </LanguageProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
