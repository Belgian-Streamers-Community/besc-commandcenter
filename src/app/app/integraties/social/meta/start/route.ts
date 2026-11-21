import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/lib/auth-context";
import { metaConfiguration, metaScopes, type MetaPlatform } from "@/lib/meta-integration";
import { metaConsentCapability, type MetaConsentCapability } from "@/lib/meta-inbox-consent";

export async function GET(request: Request) {
  const { supabase, membership } = await requireActiveMembership();
  if (!["admin", "board"].includes(membership.role)) return NextResponse.redirect(new URL("/app?fout=rechten", request.url));
  const requestUrl = new URL(request.url);
  const accountId = requestUrl.searchParams.get("account");
  let capability: MetaConsentCapability;
  try {
    capability = metaConsentCapability(requestUrl.searchParams.get("rechten"), process.env);
  } catch {
    return NextResponse.redirect(new URL("/app/integraties/social?fout=inboxrechten-uit", request.url));
  }
  if (!accountId) return NextResponse.redirect(new URL("/app/integraties/social?fout=account", request.url));
  const { data: account } = await supabase.from("social_accounts").select("id,platform").eq("id", accountId).eq("organization_id", membership.organization_id).in("platform", ["facebook", "instagram"]).is("deleted_at", null).maybeSingle();
  if (!account) return NextResponse.redirect(new URL("/app/integraties/social?fout=account", request.url));
  const platform = account.platform as MetaPlatform;
  const config = metaConfiguration(platform);
  if (!config.configured) return NextResponse.redirect(new URL(`/app/integraties/social?fout=${encodeURIComponent(config.missing.join(","))}`, request.url));

  const state = randomBytes(32).toString("base64url");
  const cookieStore = await cookies();
  const options = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/app/integraties/social/meta", maxAge: 600 };
  cookieStore.set("besc_meta_oauth_state", state, options);
  cookieStore.set("besc_meta_oauth_account", account.id, options);
  cookieStore.set("besc_meta_oauth_capability", capability, options);
  const parameters = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.callbackUrl,
    response_type: "code",
    scope: metaScopes(platform, capability).join(","),
    state,
  });
  return NextResponse.redirect(`https://www.facebook.com/${config.apiVersion}/dialog/oauth?${parameters.toString()}`);
}
