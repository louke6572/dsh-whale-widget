// 火山引擎方舟编程套餐用量 + 多账号自动轮询 — 宿主端插件
// 真实 Node 插件：https + crypto 直连火山 OpenAPI。
// 轮询规则：会话级用量 ≥90% 时自动把生效的方舟推理 key 切到下一个账号（优先账号1）。
import https from "node:https";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CREDS_PATH = (process.env.DSH_HOME || path.join(os.homedir(), ".dsh")) + "/.credentials.yaml";
const HOST = "open.volcengineapi.com";
const ARK_HOST = "ark.cn-beijing.volces.com";
const ROTATE_THRESHOLD = 90;
const ROTATE_INTERVAL_MS = 2 * 60 * 1000;

function sha256hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}
function hmac(key, data) {
  return crypto.createHmac("sha256", key).update(data).digest();
}
function xdateNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    p(d.getUTCMonth() + 1) +
    p(d.getUTCDate()) +
    "T" +
    p(d.getUTCHours()) +
    p(d.getUTCMinutes()) +
    p(d.getUTCSeconds()) +
    "Z"
  );
}
function signRequest(ak, sk, service, action, version, bodyObj, region) {
  const reg = region || "cn-beijing";
  const xDate = xdateNow();
  const dateStamp = xDate.slice(0, 8);
  const body = bodyObj ? JSON.stringify(bodyObj) : "";
  const payloadHash = sha256hex(body);
  const q = { Action: action, Version: version };
  const canonicalQuery = Object.keys(q)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(q[k]))}`)
    .join("&");
  const canonicalHeaders = `host:${HOST}\nx-content-sha256:${payloadHash}\nx-date:${xDate}\n`;
  const signedHeaders = "host;x-content-sha256;x-date";
  const canonicalRequest = `POST\n/\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${dateStamp}/${reg}/${service}/request`;
  const stringToSign = `HMAC-SHA256\n${xDate}\n${scope}\n${sha256hex(canonicalRequest)}`;
  const kDate = hmac(sk, dateStamp);
  const kRegion = hmac(kDate, reg);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "request");
  const signature = crypto
    .createHmac("sha256", kSigning)
    .update(stringToSign)
    .digest("hex");
  return {
    url: `https://${HOST}/?${canonicalQuery}`,
    headers: {
      Authorization: `HMAC-SHA256 Credential=${ak}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "X-Date": xDate,
      "X-Content-Sha256": payloadHash,
      "Content-Type": "application/json",
    },
    body,
  };
}

function readCredsText() {
  try {
    return fs.readFileSync(CREDS_PATH, "utf8");
  } catch {
    return "";
  }
}

function loadAccounts() {
  const map = {};
  for (const line of readCredsText().split(/\r?\n/)) {
    const m = line.match(/^\s*VOLCES_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|ACCOUNT_NAME)(?:_(\d+))?:\s*([^\s\r\n]+)/);
    if (!m) continue;
    const kind = m[1];
    const idx = m[2] ? Number(m[2]) : 1;
    if (!map[idx]) map[idx] = {};
    map[idx][kind] = m[3];
  }
  const accounts = [];
  for (const idx of Object.keys(map).sort((a, b) => Number(a) - Number(b))) {
    const acc = map[idx];
    if (acc.ACCESS_KEY_ID && acc.SECRET_ACCESS_KEY) {
      accounts.push({
        idx: Number(idx),
        name: acc.ACCOUNT_NAME || `火山账号 ${idx}`,
        ak: acc.ACCESS_KEY_ID,
        sk: acc.SECRET_ACCESS_KEY,
      });
    }
  }
  return accounts;
}

function loadArkKeys() {
  const map = {};
  for (const line of readCredsText().split(/\r?\n/)) {
    const m = line.match(/^\s*VOLCES_API_KEY_(\d+):\s*([^\s\r\n]+)/);
    if (!m) continue;
    map[Number(m[1])] = m[2];
  }
  return map;
}

function callVolc(ak, sk, service, action, version, body) {
  return new Promise((resolve, reject) => {
    const req = signRequest(ak, sk, service, action, version, body);
    const u = new URL(req.url);
    const r = https.request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method: "POST",
        headers: req.headers,
        timeout: 20000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      },
    );
    r.on("error", reject);
    r.on("timeout", () => r.destroy(new Error("火山引擎接口请求超时")));
    r.write(req.body);
    r.end();
  });
}

function parseResult(resp) {
  let parsed;
  try {
    parsed = JSON.parse(resp.body);
  } catch (e) {
    throw new Error("火山引擎接口返回无法解析: " + String(resp.body).slice(0, 200));
  }
  const err = parsed.ResponseMetadata && parsed.ResponseMetadata.Error;
  if (err) throw new Error(`火山引擎接口错误 [${err.Code}]: ${err.Message}`);
  return parsed.Result || null;
}

function sessionPct(result) {
  const rows = (result && result.QuotaUsage) || [];
  for (const q of rows) if (q.Level === "session") return Number(q.Percent) || 0;
  return 0;
}

function chooseActiveIdx(quota) {
  const available = quota.filter((q) => q.ok && q.session !== null);
  if (available.length === 0) return null;
  const below = available.filter((q) => q.session < ROTATE_THRESHOLD);
  if (below.length > 0) {
    const acc1 = below.find((q) => q.idx === 1);
    if (acc1) return acc1.idx;
    return below.reduce((a, b) => (a.session <= b.session ? a : b)).idx;
  }
  return available.reduce((a, b) => (a.session <= b.session ? a : b)).idx;
}

async function queryQuota(accounts) {
  return Promise.all(
    accounts.map(async (acc) => {
      try {
        const resp = await callVolc(acc.ak, acc.sk, "ark", "GetCodingPlanUsage", "2024-01-01", {});
        return { idx: acc.idx, session: sessionPct(parseResult(resp)), ok: true };
      } catch (e) {
        return { idx: acc.idx, session: null, ok: false };
      }
    }),
  );
}

function verifyArkKey(key) {
  return new Promise((resolve) => {
    const r = https.request(
      {
        hostname: ARK_HOST,
        path: "/api/v3/models",
        method: "GET",
        headers: { Authorization: `Bearer ${key}` },
        timeout: 15000,
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode >= 200 && res.statusCode < 300));
      },
    );
    r.on("error", () => resolve(false));
    r.on("timeout", () => {
      r.destroy();
      resolve(false);
    });
    r.end();
  });
}

function debugLog(msg) {
  try {
    const dir = (process.env.DSH_HOME || path.join(os.homedir(), ".dsh")) + "/.tmp_volc";
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(dir + "/rotate_log.txt", `[${new Date().toISOString()}] ${msg}\n`, "utf8");
  } catch (e) {}
}

async function rotateOnce(ctx) {
  try {
    const credentials = ctx.get("credentials");
    if (credentials === undefined) { debugLog("credentials undefined"); return; }
    const accounts = loadAccounts();
    const arkKeys = loadArkKeys();
    if (accounts.length === 0 || arkKeys[1] === undefined) return;
    const quota = await queryQuota(accounts);
    const activeIdx = chooseActiveIdx(quota);
    if (activeIdx === null) return;
    const activeKey = arkKeys[activeIdx];
    if (!activeKey) return;
    const current = (await credentials.resolve("VOLCES_ACTIVE_API_KEY"))?.value;
    debugLog(`quota=${quota.map((q) => `#${q.idx}:${q.ok ? q.session.toFixed(1) + "%" : "ERR"}`).join(" ")} chosen=${activeIdx} current=${current ? current.slice(-8) : "NONE"}`);
    if (current === activeKey) return;
    // 当前 key 是不参与用量轮询的账号（如只有推理 key 的账号3，通常是 429 切换过去的）——保持不动
    if (current && Object.values(arkKeys).includes(current) &&
        !accounts.some((a) => arkKeys[a.idx] === current)) {
      debugLog("current key not in usage accounts, keep (429-switched)");
      return;
    }
    const ok = await verifyArkKey(activeKey);
    if (!ok) { debugLog(`verify key=${ok}`); return; }
    try {
      await credentials.set("VOLCES_ACTIVE_API_KEY", activeKey);
      debugLog(`SWITCHED -> #${activeIdx}`);
    } catch (e) {
      debugLog(`set refused: ${String((e && e.message) || e)}`);
    }
  } catch (e) {
    debugLog(`ERROR: ${String((e && e.message) || e)}`);
  }
}

function startRotation(ctx) {
  debugLog("rotation started");
  const initial = setTimeout(() => {
    rotateOnce(ctx).catch(() => {});
  }, 3000);
  const timer = setInterval(() => {
    rotateOnce(ctx).catch(() => {});
  }, ROTATE_INTERVAL_MS);
  return () => {
    clearTimeout(initial);
    clearInterval(timer);
  };
}

// —— 429 限流即时切换 ——
// 挂 cordis 的 agent/request-error 事件：dsh 的 llm 层遇到 429 时会触发，
// 我们立刻把 VOLCES_ACTIVE_API_KEY 切到另一个账号，让 dsh-llm-retry 的下一次重试用新 key。
const RATE_LIMIT_COOLDOWN_MS = 30 * 1000; // 30 秒冷却，避免两个账号来回抖
let lastRateLimitSwitch = 0;

async function rotateOnRateLimit(ctx) {
  const credentials = ctx.get("credentials");
  if (credentials === undefined) return;
  const arkKeys = loadArkKeys();
  if (arkKeys[1] === undefined) return;
  const current = (await credentials.resolve("VOLCES_ACTIVE_API_KEY"))?.value;
  if (!current) return;
  const targets = Object.keys(arkKeys)
    .map(Number)
    .filter((k) => arkKeys[k] && arkKeys[k] !== current)
    .sort();
  if (targets.length === 0) return;
  const nextIdx = targets[0];
  try {
    await credentials.set("VOLCES_ACTIVE_API_KEY", arkKeys[nextIdx]);
    debugLog(`429-SWITCHED -> #${nextIdx} (RATE_LIMIT on current key)`);
  } catch (e) {
    debugLog(`429-switch set refused: ${String((e && e.message) || e)}`);
  }
}

function installRateLimitRotation(ctx) {
  ctx.on("agent/request-error", async (payload, next) => {
    try {
      if (
        payload && payload.failure &&
        payload.failure.code === "RATE_LIMIT" &&
        payload.provider === "volces"
      ) {
        const now = Date.now();
        if (now - lastRateLimitSwitch >= RATE_LIMIT_COOLDOWN_MS) {
          lastRateLimitSwitch = now;
          await rotateOnRateLimit(ctx);
        }
      }
    } catch (e) {
      debugLog(`rate-limit handler err: ${String((e && e.message) || e)}`);
    }
    return next(); // 继续走 dsh-llm-retry 的重试逻辑
  });
}

export const name = "volc-usage";
export const inject = ["webServer"];

export function apply(ctx) {
  const webServer = ctx.get("webServer");
  if (webServer === undefined) return;
  ctx.effect(
    () =>
      webServer.register({
        kind: "exact",
        path: "/api/volc-usage",
        handler: async (req, res) => {
          const respond = (code, obj) => {
            const body = JSON.stringify(obj);
            res.writeHead(code, {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-cache",
            });
            res.end(body);
          };
          try {
            const accounts = loadAccounts();
            if (accounts.length === 0) {
              respond(500, { ok: false, error: "未找到 VOLCES_ACCESS_KEY_ID / VOLCES_SECRET_ACCESS_KEY 凭证" });
              return;
            }
            const arkKeys = loadArkKeys();
            const credentials = ctx.get("credentials");
            let currentKey = null;
            if (credentials !== undefined) {
              const resolved = await credentials.resolve("VOLCES_ACTIVE_API_KEY");
              currentKey = resolved ? resolved.value : null;
            }
            const activeIdx =
              accounts.find((a) => arkKeys[a.idx] === currentKey)?.idx ?? null;
            const results = await Promise.all(
              accounts.map(async (acc) => {
                try {
                  const [planResp, balResp] = await Promise.all([
                    callVolc(acc.ak, acc.sk, "ark", "GetCodingPlanUsage", "2024-01-01", {}),
                    callVolc(acc.ak, acc.sk, "billing", "QueryBalanceAcct", "2022-01-01", {}),
                  ]);
                  return {
                    idx: acc.idx,
                    name: acc.name,
                    ok: true,
                    plan: parseResult(planResp),
                    balance: parseResult(balResp),
                  };
                } catch (e) {
                  return { idx: acc.idx, name: acc.name, ok: false, error: String((e && e.message) || e) };
                }
              }),
            );
            respond(200, { ok: true, accounts: results, activeIdx, fetchedAt: Date.now() });
          } catch (e) {
            respond(500, { ok: false, error: String((e && e.message) || e) });
          }
        },
      }),
    "volc-usage: /api/volc-usage",
  );
  ctx.effect(() => startRotation(ctx), "volc-usage: rotation");
  installRateLimitRotation(ctx);
}
