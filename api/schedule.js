import { get, set, smembers, auth, isManager, fail } from "../lib/db.js";

/* 반별 시간표. 매주 같은 시간표가 아니라 A주/B주 두 벌을 두고 번갈아 쓴다.
   refMonday가 속한 주 = A주. 그 다음 주는 B주, 또 그 다음 주는 다시 A주 ... 이렇게 반복된다.
   overrides는 "이번 회차만" 갑자기 바뀐 수업을 특정 날짜에만 덮어쓴다 (반복 패턴 자체는 안 건드림). */

const DEFAULT_CLASS = "4반";
const blankRow = () => Array.from({ length: 7 }, () => ["", ""]);
const blankGrid = () => ({ 1: blankRow(), 2: blankRow(), 3: blankRow(), 4: blankRow(), 5: blankRow() });

function defaultConfig() {
  const weekA_1 = {
    1: [["물리", "이주희"], ["물리", "이주희"], ["정보", "신요셉"], ["국어", "김도현"], ["적통", "전혜진"], ["적통", "전혜진"], ["자율", ""]],
    2: [["화학", "이충섭"], ["화학", "이충섭"], ["국어", "정선혜"], ["지구", "최원문"], ["정보", "안소희"], ["기벡", "김수정"], ["진로", "최형미"]],
    3: [["회화", "원어민"], ["생물", "이민주"], ["기벡", "남정훈"], ["기벡", "남정훈"], ["지구", "김우겸"], ["화학", "김정은"], ["한국사", "이병수"]],
    4: [["적통", "전혜진"], ["생물", "손희창"], ["생물", "임재화"], ["영어", "한신실"], ["R&E", ""], ["R&E", ""], ["R&E", ""]],
    5: [["한국사", "이병수"], ["정보", "백경덕"], ["체육", "최정호"], ["물리", "신대호"], ["지구", "김진욱"], ["회화", "원어민"], ["국어", "김도현"]]
  };
  const weekB_1 = {
    1: [["물리", "신대호"], ["물리", "신대호"], ["정보", "신요셉"], ["국어", "김도현"], ["적통", "조영민"], ["적통", "조영민"], ["자율", ""]],
    2: [["화학", "김정은"], ["화학", "김정은"], ["국어", "정선혜"], ["지구", "최원문"], ["정보", "안소희"], ["기벡", "김수정"], ["진로", "최형미"]],
    3: [["회화", "원어민"], ["생물", "이민주"], ["기벡", "남정훈"], ["기벡", "남정훈"], ["지구", "김우겸"], ["화학", "이충섭"], ["한국사", "이병수"]],
    4: [["적통", "조영민"], ["생물", "손희창"], ["생물", "임재화"], ["영어", "한신실"], ["R&E", ""], ["R&E", ""], ["R&E", ""]],
    5: [["한국사", "이병수"], ["정보", "백경덕"], ["체육", "최정호"], ["물리", "이주희"], ["지구", "김진욱"], ["회화", "원어민"], ["국어", "김도현"]]
  };
  return {
    refMonday: "2026-08-31", // 이 날짜가 속한 주(2026-08-31 월요일 시작 주) = A주. 지금이 A주.
    classes: [DEFAULT_CLASS],
    weekA: { [DEFAULT_CLASS]: weekA_1 },
    weekB: { [DEFAULT_CLASS]: weekB_1 },
    overrides: [] // [{date:"YYYY-MM-DD", cls, period(0-6), subject, teacher}]
  };
}

function normalize(cfg) {
  // 방어적으로 형태를 맞춰준다 (관리자가 저장한 값에 구멍이 있어도 앱이 안 죽게)
  cfg = cfg && typeof cfg === "object" ? cfg : defaultConfig();
  if (!Array.isArray(cfg.classes) || !cfg.classes.length) cfg.classes = [DEFAULT_CLASS];
  if (!cfg.refMonday) cfg.refMonday = "2026-08-31";
  cfg.weekA = cfg.weekA || {};
  cfg.weekB = cfg.weekB || {};
  for (const c of cfg.classes) {
    if (!cfg.weekA[c]) cfg.weekA[c] = blankGrid();
    if (!cfg.weekB[c]) cfg.weekB[c] = blankGrid();
  }
  if (!Array.isArray(cfg.overrides)) cfg.overrides = [];
  return cfg;
}

/* 예전에 "1반"이라는 임시 이름으로 만들어 둔 시간표를 실제 이름(4반)으로 한 번만 옮긴다.
   이미 옮겼으면(migrated:cls_rename_v1 플래그) 다시 손대지 않는다 — 그 뒤에 관리자가 진짜
   "1반"을 새로 추가해도 안전하도록. */
async function migrateLegacyClassName(cfg) {
  if (!(cfg.classes.length === 1 && cfg.classes[0] === "1반")) return cfg;
  const already = await get("migrated:cls_rename_v1");
  if (already) return cfg;

  cfg.classes = [DEFAULT_CLASS];
  if (cfg.weekA["1반"]) { cfg.weekA[DEFAULT_CLASS] = cfg.weekA["1반"]; delete cfg.weekA["1반"]; }
  if (cfg.weekB["1반"]) { cfg.weekB[DEFAULT_CLASS] = cfg.weekB["1반"]; delete cfg.weekB["1반"]; }
  (cfg.overrides || []).forEach((o) => { if (o.cls === "1반") o.cls = DEFAULT_CLASS; });
  await set("schedule:config", cfg);

  const ids = (await smembers("users")) || [];
  for (const id of ids) {
    const u = await get("user:" + id);
    if (u && (u.cls === "1반" || !u.cls)) {
      u.cls = DEFAULT_CLASS;
      await set("user:" + id, u);
    }
  }
  await set("migrated:cls_rename_v1", true);
  return cfg;
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      let cfg = await get("schedule:config");
      if (!cfg) {
        cfg = defaultConfig();
        await set("schedule:config", cfg);
      }
      cfg = normalize(cfg);
      cfg = await migrateLegacyClassName(cfg);
      return res.status(200).json(cfg);
    }

    if (req.method === "PUT") {
      const me = await auth(req);
      if (!me) return fail(res, 401, "인증이 필요해");
      if (!isManager(me)) return fail(res, 403, "관리자·반장·부반장만 시간표를 바꿀 수 있어");
      const cfg = req.body?.config;
      if (!cfg || typeof cfg !== "object" || !Array.isArray(cfg.classes)) return fail(res, 400, "형식이 맞지 않아");
      const clean = normalize(cfg);
      await set("schedule:config", clean);
      return res.status(200).json({ ok: true });
    }

    return fail(res, 405, "지원하지 않는 방식이야");
  } catch (e) {
    return fail(res, 500, String(e.message || e));
  }
}
