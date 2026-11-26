"use client";
import { createBrowserClient } from "@supabase/ssr";

/** Browser client – used only for auth calls so Supabase rate-limits per user IP. */
export const createBrowserSupabase = () =>
  createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
