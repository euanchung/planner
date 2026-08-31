import { get, set, smembers, auth, fail } from "../lib/db.js";

/* 같은 반 친구들에게 할 일 하나를 복사해서 뿌린다.
   받는 사람마다 완전히 독립된 사본이라, 한 명이 완료 체크(또는 삭제)해도
   다른 사람 목록에는 그대로 남는다. */
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return fail(res, 405, "POST만 가능해");
    const me = await auth(req);
    if (!me) return fail(res, 401, "인증이 필요해");

    const { task, shareId } = req.body || {};
    if (!task || !task.title || !task.due) return fail(res, 400, "형식이 맞지 않아");

    const cls = me.cls || "4반";
    const sid = String(shareId || (Date.now() + Math.random().toString(36).slice(2, 7)));
    const ids = (await smembers("users")) || [];
    let count = 0;

    for (const id of ids) {
      if (id === me.id) continue; // 본인은 이미 자기 화면에 등록돼 있음
      const u = await get("user:" + id);
      if (!u || (u.cls || "4반") !== cls) continue;

      const st = (await get("state:" + id)) || { data: { tasks: [], settings: { h: 19, m: 30, last: "" } }, updatedAt: null };
      const data = st.data && Array.isArray(st.data.tasks) ? st.data : { tasks: [], settings: { h: 19, m: 30, last: "" } };
      const nt = {
        id: sid + "_" + id,
        title: String(task.title).slice(0, 200),
        k: task.k || "기타|",
        due: task.due,
        time: task.time || "",
        memo: task.memo || "",
        opt: !!task.opt,
        rep: task.rep || null,
        skips: [],
        doneDates: [],
        done: false,
        created: Date.now(),
        shared: true,
        shareId: sid,
        sharedBy: me.nick || me.id
      };
      data.tasks.unshift(nt);
      await set("state:" + id, { data, updatedAt: new Date().toISOString() });
      count++;
    }

    return res.status(200).json({ ok: true, count });
  } catch (e) {
    return fail(res, 500, String(e.message || e));
  }
}
