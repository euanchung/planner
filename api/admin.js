import crypto from "node:crypto";
import { get, set, smembers, auth, hashPw, fail } from "../lib/db.js";

const pad = n => String(n).padStart(2, "0");
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const DEFAULT_CLASS = "4반";

export default async function handler(req, res) {
  try {
    const me = await auth(req);
    if (!me) return fail(res, 401, "인증이 필요해");
    if (!me.admin) return fail(res, 403, "관리자만 할 수 있어");

    if (req.method === "GET") {
      const ids = (await smembers("users")) || [];
      const t = today();
      const users = [];
      for (const id of ids) {
        const u = await get("user:" + id);
        const st = await get("state:" + id);
        const tasks = st?.data?.tasks || [];
        users.push({
          id,
          nick: u?.nick || id,
          cls: u?.cls || DEFAULT_CLASS,
          admin: !!u?.admin,
          officer: u?.officer || null,
          pending: tasks.filter(x => !x.done).length,
          overdue: tasks.filter(x => !x.rep && !x.done && x.due < t).length,
          updatedAt: st?.updatedAt || null
        });
      }
      users.sort((a, b) => b.overdue - a.overdue || b.pending - a.pending);
      return res.status(200).json({ users });
    }

    if (req.method === "POST") {
      const { action, id } = req.body || {};
      const uid = String(id || "").trim().toLowerCase();
      if (!uid) return fail(res, 400, "아이디가 필요해");
      const u = await get("user:" + uid);
      if (!u) return fail(res, 404, "그런 아이디가 없어");

      if (action === "resetpw") {
        const tempPw = crypto.randomBytes(3).toString("hex"); // 6자리 임시 비밀번호
        const salt = crypto.randomBytes(16).toString("hex");
        u.pw = hashPw(tempPw, salt);
        u.salt = salt;
        await set("user:" + uid, u);
        return res.status(200).json({ ok: true, tempPw });
      }

      if (action === "setclass") {
        const cls = String((req.body || {}).cls || "").trim();
        u.cls = cls || DEFAULT_CLASS;
        await set("user:" + uid, u);
        return res.status(200).json({ ok: true, cls: u.cls });
      }

      if (action === "setofficer") {
        const role = String((req.body || {}).role || "").trim();
        if (!["leader", "vice", ""].includes(role)) return fail(res, 400, "알 수 없는 직책이야");
        const targetCls = u.cls || DEFAULT_CLASS;
        if (role) {
          // 같은 반에 이미 그 직책을 가진 사람이 있으면 내려놓게 한다 (반장/부반장은 반마다 한 명씩)
          const ids = (await smembers("users")) || [];
          for (const otherId of ids) {
            if (otherId === uid) continue;
            const ou = await get("user:" + otherId);
            if (ou && (ou.cls || DEFAULT_CLASS) === targetCls && ou.officer === role) {
              ou.officer = null;
              await set("user:" + otherId, ou);
            }
          }
        }
        u.officer = role || null;
        await set("user:" + uid, u);
        return res.status(200).json({ ok: true, officer: u.officer });
      }

      return fail(res, 400, "알 수 없는 요청이야");
    }

    return fail(res, 405, "지원하지 않는 방식이야");
  } catch (e) {
    return fail(res, 500, String(e.message || e));
  }
}
