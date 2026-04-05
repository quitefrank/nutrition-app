import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import TodayPage from "./pages/TodayPage";
import FoodsPage from "./pages/FoodsPage";
import RecipesPage from "./pages/RecipesPage";
import GroceriesPage from "./pages/GroceriesPage";
import ScanPage from "./pages/ScanPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route element={<AppShell />}>
            <Route path="/today" element={<TodayPage />} />
            <Route path="/foods" element={<FoodsPage />} />
            <Route path="/recipes" element={<RecipesPage />} />
            <Route path="/groceries" element={<GroceriesPage />} />
            <Route path="/scan" element={<ScanPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
