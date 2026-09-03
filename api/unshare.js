import { get, set, smembers, auth, isManager, fail } from "../lib/db.js";

/* 실수로 반 전체에 공유했을 때 되돌리는 기능.
   share.js가 만들어 둔 사본들(같은 shareId)을 각자 목록에서 지워준다.
   본인(공유한 사람)의 원본은 건드리지 않는다 — 클라이언트가 공유 표시만 되돌린다. */
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return fail(res, 405, "POST만 가능해");
    const me = await auth(req);
    if (!me) return fail(res, 401, "인증이 필요해");
    if (!isManager(me)) return fail(res, 403, "관리자·반장·부반장만 공유를 취소할 수 있어");

    const sid = String((req.body || {}).shareId || "").trim();
    if (!sid) return fail(res, 400, "취소할 공유를 찾을 수 없어");

    const cls = me.cls || "4반";
    const ids = (await smembers("users")) || [];
    let removed = 0;

    for (const id of ids) {
      if (id === me.id) continue; // 본인 목록은 그대로 둔다
      const u = await get("user:" + id);
      if (!u || (u.cls || "4반") !== cls) continue;

      const st = await get("state:" + id);
      if (!st || !st.data || !Array.isArray(st.data.tasks)) continue;
      const before = st.data.tasks.length;
      st.data.tasks = st.data.tasks.filter((x) => x.shareId !== sid);
      if (st.data.tasks.length !== before) {
        removed += before - st.data.tasks.length;
        await set("state:" + id, { data: st.data, updatedAt: new Date().toISOString() });
      }
    }

    return res.status(200).json({ ok: true, removed });
  } catch (e) {
    return fail(res, 500, String(e.message || e));
  }
}
