import { get, set, sadd, smembers, auth, fail } from "../lib/db.js";

/* 1:1 채팅. 두 사람의 아이디를 정렬해 합친 값을 키로 쓴다 (누가 먼저 보냈든 같은 방을 가리키게). */
const pairKey = (a, b) => [a, b].sort().join("::");
const MAX_MSGS = 300;

export default async function handler(req, res) {
  try {
    const me = await auth(req);
    if (!me) return fail(res, 401, "인증이 필요해");

    if (req.method === "GET") {
      const withId = String((req.query && req.query.with) || "").trim().toLowerCase();

      if (withId) {
        if (withId === me.id) return fail(res, 400, "자기 자신과는 채팅할 수 없어");
        const other = await get("user:" + withId);
        if (!other) return fail(res, 404, "그런 아이디가 없어");
        const key = pairKey(me.id, withId);
        const thread = (await get("chat:" + key)) || { messages: [] };
        return res.status(200).json({ with: { id: other.id, nick: other.nick || other.id }, messages: thread.messages || [] });
      }

      // 대화 목록 (최근 대화 순)
      const peerIds = (await smembers("chatpeers:" + me.id)) || [];
      const peers = [];
      for (const pid of peerIds) {
        const pu = await get("user:" + pid);
        if (!pu) continue;
        const key = pairKey(me.id, pid);
        const thread = await get("chat:" + key);
        const msgs = (thread && thread.messages) || [];
        const last = msgs[msgs.length - 1];
        peers.push({ id: pid, nick: pu.nick || pid, lastText: last ? last.text : "", lastTs: last ? last.ts : 0 });
      }
      peers.sort((a, b) => b.lastTs - a.lastTs);
      return res.status(200).json({ peers });
    }

    if (req.method === "POST") {
      const { to, text } = req.body || {};
      const toId = String(to || "").trim().toLowerCase();
      const msg = String(text || "").trim().slice(0, 500);
      if (!toId) return fail(res, 400, "받는 사람이 필요해");
      if (toId === me.id) return fail(res, 400, "자기 자신과는 채팅할 수 없어");
      if (!msg) return fail(res, 400, "메시지를 입력해줘");
      const other = await get("user:" + toId);
      if (!other) return fail(res, 404, "그런 아이디가 없어");

      const key = pairKey(me.id, toId);
      const thread = (await get("chat:" + key)) || { messages: [] };
      thread.messages = thread.messages || [];
      thread.messages.push({ from: me.id, text: msg, ts: Date.now() });
      if (thread.messages.length > MAX_MSGS) thread.messages = thread.messages.slice(-MAX_MSGS);
      await set("chat:" + key, thread);
      await sadd("chatpeers:" + me.id, toId);
      await sadd("chatpeers:" + toId, me.id);
      return res.status(200).json({ ok: true });
    }

    return fail(res, 405, "지원하지 않는 방식이야");
  } catch (e) {
    return fail(res, 500, String(e.message || e));
  }
}
