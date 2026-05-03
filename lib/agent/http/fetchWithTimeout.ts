/**
 * Convex action / Node 内 fetch 无默认超时，外网 API 挂起会导致前端长期「运行中」。
 * Node/undici 在 abort 时可能抛出 DOMException 等，name 为 AbortError 但非标准 Error，需统一识别。
 *
 * 传入 `debugTag` 时会在 Convex 日志中打印 START/OK/FAIL，便于判断「哪一次 HTTP 超时」。
 */
function isAbortLike(e: unknown): boolean {
  if (e == null || typeof e !== "object") return false;
  const o = e as { name?: string; code?: string | number };
  if (o.name === "AbortError") return true;
  if (o.code === 20 || o.code === "ABORT_ERR") return true;
  return false;
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  timeoutLabel: string,
  debugTag?: string
): Promise<Response> {
  const tag = debugTag ?? "http";
  const safeUrl = url.split("?")[0];
  const t0 = Date.now();
  if (debugTag) {
    console.log(`[agent-http] START tag=${tag} timeoutMs=${timeoutMs} url=${safeUrl}`);
  }
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (debugTag) {
      console.log(`[agent-http] OK tag=${tag} status=${res.status} elapsedMs=${Date.now() - t0}`);
    }
    return res;
  } catch (e) {
    if (debugTag) {
      console.error(`[agent-http] FAIL tag=${tag} elapsedMs=${Date.now() - t0}`, e);
    }
    if (isAbortLike(e)) {
      throw new Error(`${timeoutLabel}（${timeoutMs / 1000}s）[tag=${tag}]`);
    }
    throw e;
  } finally {
    clearTimeout(id);
  }
}
