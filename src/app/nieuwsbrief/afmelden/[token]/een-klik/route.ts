import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { newsletterTokenHash } from "@/lib/newsletter-delivery";

// RFC 8058: mailprogramma's sturen POST met "List-Unsubscribe=One-Click"; het formulier op de pagina gebruikt dezelfde route.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let ok = false;
  if (/^[0-9a-f]{64}$/.test(token)) {
    const supabase = await createClient();
    const result = await supabase.rpc("newsletter_one_click_unsubscribe", { p_token_hash: newsletterTokenHash(token) });
    ok = result.data === true && !result.error;
  }
  const body = await request.text().catch(() => "");
  if (body.includes("List-Unsubscribe=One-Click")) return new NextResponse(ok ? "OK" : "Ongeldig", { status: ok ? 200 : 404 });
  return NextResponse.redirect(new URL(`/nieuwsbrief/status?resultaat=${ok ? "uitgeschreven" : "ongeldig"}`, request.url), 303);
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return NextResponse.redirect(new URL(/^[0-9a-f]{64}$/.test(token) ? `/nieuwsbrief/afmelden/${token}` : "/nieuwsbrief/status?resultaat=ongeldig", request.url), 303);
}
