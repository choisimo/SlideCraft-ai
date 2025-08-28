import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import SearchPage from "./pages/Search";
import NotificationsPage from "./pages/Notifications";
import SettingsPage from "./pages/Settings";
import UploadPage from "./pages/Upload";
import AttachmentsPage from "./pages/Attachments";
import SlidesPage from "./pages/Slides";
import CollaborationPage from "./pages/Collaboration";
import VoicePage from "./pages/Voice";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
         <Routes>
           <Route path="/" element={<Index />} />
           <Route path="/search" element={<SearchPage />} />
           <Route path="/notifications" element={<NotificationsPage />} />
           <Route path="/settings" element={<SettingsPage />} />
           <Route path="/upload" element={<UploadPage />} />
           <Route path="/attachments" element={<AttachmentsPage />} />
           <Route path="/slides" element={<SlidesPage />} />
           <Route path="/collab" element={<CollaborationPage />} />
           <Route path="/voice" element={<VoicePage />} />
           {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
           <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
