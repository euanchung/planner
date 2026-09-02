import { get, smembers, auth, fail } from "../lib/db.js";

const DEFAULT_CLASS = "4반";

/* 로그인한 사람이면 누구나(관리자·반장/부반장·일반 회원 모두) 자기 반 친구들의
   아이디를 확인할 수 있게 해준다 — 채팅 상대를 찾기 쉽도록. 다른 반 정보는 주지 않는다. */
export default async function handler(req, res) {
  try {
    const me = await auth(req);
    if (!me) return fail(res, 401, "인증이 필요해");
    if (req.method !== "GET") return fail(res, 405, "지원하지 않는 방식이야");

    const myClass = me.cls || DEFAULT_CLASS;
    const ids = (await smembers("users")) || [];
    const classmates = [];
    for (const id of ids) {
      if (id === me.id) continue;
      const u = await get("user:" + id);
      if (!u) continue;
      if ((u.cls || DEFAULT_CLASS) !== myClass) continue;
      classmates.push({ id, nick: u.nick || id, officer: u.officer || null, admin: !!u.admin });
    }
    classmates.sort((a, b) => {
      const rank = (x) => (x.admin ? 0 : x.officer === "leader" ? 1 : x.officer === "vice" ? 2 : 3);
      return rank(a) - rank(b) || a.nick.localeCompare(b.nick, "ko");
    });
    return res.status(200).json({ cls: myClass, classmates });
  } catch (e) {
    return fail(res, 500, String(e.message || e));
  }
}
