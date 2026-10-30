import { decode } from "../application/wire";

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
export function apiEnabled() { return !!process.env.ACCOUNTBOOK_API_URL; }
export async function requestAPI<T>(path: string, data: unknown, token?: string): Promise<T> {
  const base = process.env.ACCOUNTBOOK_API_URL;
  const key = process.env.ACCOUNTBOOK_API_KEY;
  if (!base || !key || key.length < 32) throw new Error("API 연결 설정을 확인해 주세요.");
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error("API 주소를 확인해 주세요.");
  let response: Response;
  try {
    response = await fetch(new URL(path, url), {
      method: "POST", headers: { "content-type": "application/json", "x-accountbook-key": key, ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(data), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(120000),
    });
  } catch { throw new ApiError(503, "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."); }
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, typeof result?.message === "string" ? result.message : "요청을 처리하지 못했어요.");
  if (!result || !Array.isArray(result.data)) throw new ApiError(502, "서버 응답을 확인하지 못했어요.");
  return decode(result.data) as T;
}
