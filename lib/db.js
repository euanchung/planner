/* Upstash Redis를 REST로 직접 부른다. 설치할 패키지가 없어 배포가 빠르고 실패할 구석이 적다.
   환경변수는 Vercel이 Marketplace 연결 시 자동으로 넣어준다. */
import crypto from "node:crypto";

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

export const configured = () => Boolean(URL_ && TOKEN);

async function cmd(args) {
  if (!configured()) throw new Error("저장소가 연결되지 않았어 (Vercel Storage 연결 후 다시 배포해줘)");
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(args)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("저장소 오류 " + r.status + " " + (j.error || ""));
  return j.result;
}

export const get = async (k) => {
  const v = await cmd(["GET", k]);
  if (v === null || v === undefined) return null;
  try { return typeof v === "string" ? JSON.parse(v) : v; } catch { return v; }
};
export const set = (k, v) => cmd(["SET", k, JSON.stringify(v)]);
export const setex = (k, v, ttlSec) => cmd(["SET", k, JSON.stringify(v), "EX", String(ttlSec)]);
export const del = (k) => cmd(["DEL", k]);
export const sadd = (k, m) => cmd(["SADD", k, m]);
export const smembers = (k) => cmd(["SMEMBERS", k]);

/* 비밀번호 해시 — 한 방향으로만 바뀌고 되돌릴 수 없다 (auth.js, admin.js가 같이 씀) */
export const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString("hex");

/* 토큰 → 사용자 확인 */
export async function auth(req) {
  const h = req.headers.authorization || "";
  const tok = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!tok) return null;
  const uid = await get("tok:" + tok);
  if (!uid) return null;
  const u = await get("user:" + uid);
  return u ? { id: u.id, nick: u.nick, admin: !!u.admin, cls: u.cls || "4반" } : null;
}

export function fail(res, code, msg) {
  return res.status(code).json({ error: msg });
}
