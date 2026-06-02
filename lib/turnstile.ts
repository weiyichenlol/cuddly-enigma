import { mustGetEnv } from "@/lib/env";

export async function verifyTurnstile(token: string, remoteip?: string) {
  const secret = mustGetEnv("TURNSTILE_SECRET_KEY");
  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  if (remoteip) form.set("remoteip", remoteip);

  const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
    // 避免 Next 缓存
    cache: "no-store",
  });
  const data = (await resp.json()) as { success: boolean; "error-codes"?: string[] };
  return data;
}

