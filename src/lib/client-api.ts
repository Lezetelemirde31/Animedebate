import type { Ack } from "@/game/types";

/**
 * Calls a JSON API route. Always resolves: a network failure comes back as
 * `{ ok: false, code: "SERVER_ERROR", message: "" }` (see `isNetworkFailure`).
 */
export async function api<T = undefined>(
  path: string,
  init: { method?: "GET" | "POST" | "DELETE"; body?: unknown } = {},
): Promise<Ack<T>> {
  try {
    const res = await fetch(path, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as Ack<T> | null;
    if (json && typeof json === "object" && "ok" in json) return json;
    return { ok: false, code: "SERVER_ERROR", message: "" } as Ack<T>;
  } catch {
    return { ok: false, code: "SERVER_ERROR", message: "" } as Ack<T>;
  }
}

export function isNetworkFailure(res: Ack<unknown>): boolean {
  return !res.ok && res.code === "SERVER_ERROR" && res.message === "";
}
