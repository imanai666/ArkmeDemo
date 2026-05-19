import { useState } from "react";
import AdminMessageConsole from "@/pages/AdminMessageConsole";
import Home from "@/pages/Home";
import { PreferencesProvider } from "@/settings/preferences";

export type PageType = "records" | "schedule" | "insight" | "mine";

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageType>("records");
  const isAdminConsole =
    typeof window !== "undefined" && window.location.pathname === "/sendtest";

  return (
    <PreferencesProvider>
      {isAdminConsole ? (
        <AdminMessageConsole />
      ) : (
        <Home currentPage={currentPage} onNavigate={setCurrentPage} />
      )}
    </PreferencesProvider>
  );
}
