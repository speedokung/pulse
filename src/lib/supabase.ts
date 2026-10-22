import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** False → the app runs in demo mode with local example data. */
export const configured = !!(url && key);
export const supabase = createClient(url || "http://localhost:54321", key || "demo-anon-key", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
});

export const PHOTO_BUCKET = "feed-photos";
export const photoUrl = (path: string) => supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
