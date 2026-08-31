import crypto from "node:crypto";
import { get, set, setex, sadd, smembers, hashPw, fail } from "../lib/db.js";

const newToken = () => crypto.randomBytes(24).toString("hex");
const TTL = 60 * 60 * 24 * 120; // 120일
const DEFAULT_CLASS = "4반";

export default async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "POST만 가능해");

  try {
    const { action, id, pw, nick, cls } = req.body || {};
    const uid = String(id || "").trim().toLowerCase();
    const pass = String(pw || "");
    const cleanCls = String(cls || "").trim();

    if (!uid || !pass) return fail(res, 400, "아이디와 비밀번호를 모두 넣어줘");
    if (!/^[a-z0-9_가-힣]{2,20}$/.test(uid)) return fail(res, 400, "아이디는 2~20자의 한글·영문·숫자·밑줄만 돼");
    if (pass.length < 4) return fail(res, 400, "비밀번호는 4자 이상이어야 해");

    const existing = await get("user:" + uid);

    if (action === "signup") {
      if (existing) return fail(res, 409, "이미 있는 아이디야. 로그인으로 들어와");
      const members = (await smembers("users")) || [];
      const salt = crypto.randomBytes(16).toString("hex");
      const user = {
        id: uid,
        nick: String(nick || "").trim() || uid,
        cls: cleanCls || DEFAULT_CLASS,
        salt,
        pw: hashPw(pass, salt),
        admin: members.length === 0,       // 첫 가입자가 관리자
        created: Date.now()
      };
      await set("user:" + uid, user);
      await sadd("users", uid);
      await set("state:" + uid, { data: { tasks: [], settings: { h: 19, m: 30, last: "" } }, updatedAt: new Date().toISOString() });
      const tok = newToken();
      await setex("tok:" + tok, uid, TTL);
      return res.status(200).json({ token: tok, me: { id: uid, nick: user.nick, admin: user.admin, cls: user.cls } });
    }

    if (action === "login") {
      if (!existing) return fail(res, 401, "아이디나 비밀번호가 맞지 않아");
      if (hashPw(pass, existing.salt) !== existing.pw) return fail(res, 401, "아이디나 비밀번호가 맞지 않아");
      const tok = newToken();
      await setex("tok:" + tok, uid, TTL);
      return res.status(200).json({ token: tok, me: { id: uid, nick: existing.nick, admin: !!existing.admin, cls: existing.cls || DEFAULT_CLASS } });
    }

    return fail(res, 400, "알 수 없는 요청이야");
  } catch (e) {
    return fail(res, 500, String(e.message || e));
  }
}
