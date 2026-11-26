"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveMembership } from "@/lib/auth-context";
import { parseSocialImport, SOCIAL_IMPORT_MAX_BYTES } from "@/lib/social-history-import";

const PATH = "/app/social/importeren";

export async function importSocialHistoryAction(formData: FormData) {
  const { membership, user } = await requireActiveMembership();
  if (membership.role !== "admin" && membership.role !== "board") redirect("/app/social?fout=geen-toegang");
  const file = formData.get("bestand");
  if (!(file instanceof File) || file.size === 0) redirect(`${PATH}?fout=geen-bestand`);
  if (file.size > SOCIAL_IMPORT_MAX_BYTES) redirect(`${PATH}?fout=te-groot`);
  const check = parseSocialImport(await file.text());
  if (!check.ok) redirect(`${PATH}?fout=ongeldig&detail=${encodeURIComponent(check.error.slice(0, 300))}`);
  let destination: string;
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { data, error } = await createAdminClient().rpc("social_history_import", { p_org: membership.organization_id, p_actor: user.id, p_posts: check.file.posts });
    if (error) throw new Error(error.message);
    const result = data as { total: number; created: number; channels: number; skipped: number; failed: { ref: string | null; error: string }[] };
    const failed = Array.isArray(result.failed) ? result.failed : [];
    const params = new URLSearchParams({ succes: "1", totaal: String(result.total ?? 0), nieuw: String(result.created ?? 0), kanalen: String(result.channels ?? 0), overgeslagen: String(result.skipped ?? 0), mislukt: String(failed.length) });
    if (failed.length) params.set("eerste_fout", `${failed[0].ref ?? "?"}: ${failed[0].error}`.slice(0, 200));
    destination = `${PATH}?${params}`;
  } catch (error) {
    const code = error instanceof Error ? error.message.replace(/[^a-z_]/g, "").slice(0, 60) : "";
    destination = `${PATH}?fout=${code || "import"}`;
  }
  revalidatePath("/app/social");
  redirect(destination);
}
