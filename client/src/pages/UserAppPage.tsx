import { useEffect, useState } from "react";
import {
  fetchStudyBullStateFromSupabase,
  subscribeToStudyBullState,
  getStoredSupabaseConfig,
} from "@/lib/supabase";
import Home, { PreviewStandalone } from "./Home";

/**
 * UserAppPage
 * Standalone student-facing User App view accessible via /user or /app.
 * Connects directly to Supabase and renders the complete student app
 * with SandboxedHtmlView enabled for custom HTML/web content.
 */
export default function UserAppPage() {
  return <PreviewStandalone />;
}
