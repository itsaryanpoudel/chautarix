import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safePath } from "@/lib/format";

// Email confirmation + password-reset links. Supports the recommended "token_hash" email templates
// (work on any device/browser) and the default PKCE "code" links.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safePath(url.searchParams.get("next"));
  const supabase = await createClient();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash }) : { error: new Error("missing token") };
  redirect(error ? "/login?error=link" : next);
}
