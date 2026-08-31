import { get, set, auth, fail } from "../lib/db.js";

export default async function handler(req, res) {
  try {
    const me = await auth(req);
    if (!me) return fail(res, 401, "인증이 필요해");

    if (req.method === "GET") {
      const st = (await get("state:" + me.id)) || { data: { tasks: [], settings: { h: 19, m: 30, last: "" } }, updatedAt: null };
      return res.status(200).json({ me, data: st.data, updatedAt: st.updatedAt });
    }

    if (req.method === "PUT" || req.method === "POST") {
      const data = req.body?.data;
      if (!data || !Array.isArray(data.tasks)) return fail(res, 400, "형식이 맞지 않아");
      const updatedAt = new Date().toISOString();
      await set("state:" + me.id, { data, updatedAt });
      return res.status(200).json({ ok: true, updatedAt });
    }

    return fail(res, 405, "지원하지 않는 방식이야");
  } catch (e) {
    return fail(res, 500, String(e.message || e));
  }
}
