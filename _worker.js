/**
 * R2 免费额度监控 - 单文件版（带网页显示）
 * 配置全部从环境变量读取
 * 支持：网页面板 + Telegram + 企业微信（QYWX_AM）
 *
 * QYWX_AM 格式：corpid,corpsecret,touser,agentid,media_id
 * media_id 填 0 或空 = 纯文本
 */

const FREE = {
  storageGB: 10,
  classA: 1_000_000,
  classB: 10_000_000,
};

const CLASS_A = new Set([
  "ListBuckets", "PutBucket", "ListObjects", "PutObject", "CopyObject",
  "CompleteMultipartUpload", "CreateMultipartUpload", "ListMultipartUploads",
  "UploadPart", "UploadPartCopy", "ListParts", "PutBucketEncryption",
  "PutBucketCors", "PutBucketLifecycleConfiguration", "LifecycleStorageTierTransition",
]);

const CLASS_B = new Set([
  "HeadBucket", "HeadObject", "GetObject", "UsageSummary",
  "GetBucketEncryption", "GetBucketLocation", "GetBucketCors",
  "GetBucketLifecycleConfiguration",
]);

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCheck(env, true));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const wantJson = url.searchParams.get("json") === "1";

    try {
      const result = await runCheck(env, false);

      if (wantJson || result.error) {
        return new Response(JSON.stringify(result, null, 2), {
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }

      return new Response(renderHTML(result), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } catch (e) {
      const err = { error: String(e.message || e) };
      if (wantJson) {
        return new Response(JSON.stringify(err, null, 2), {
          status: 500,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }
      return new Response(renderErrorHTML(err.error), {
        status: 500,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  },
};

async function runCheck(env, isCron) {
  if (!env.ACCOUNT_ID || !env.CF_API_TOKEN) {
    return { error: "请设置 ACCOUNT_ID 和 CF_API_TOKEN 环境变量" };
  }

  const usage = await getR2Usage(env);
  const { storageGB, objects, classA, classB } = usage;

  const storagePct = (storageGB / FREE.storageGB) * 100;
  const classAPct = (classA / FREE.classA) * 100;
  const classBPct = (classB / FREE.classB) * 100;

  const threshold = Number(env.ALERT_THRESHOLD || 80);
  const alwaysNotify = String(env.ALWAYS_NOTIFY || "false").toLowerCase() === "true";

  const alerts = [];
  if (storagePct >= threshold) alerts.push(`存储 ${storagePct.toFixed(1)}%`);
  if (classAPct >= threshold) alerts.push(`Class A ${classAPct.toFixed(1)}%`);
  if (classBPct >= threshold) alerts.push(`Class B ${classBPct.toFixed(1)}%`);

  const report = {
    time: new Date().toISOString(),
    storage: {
      used: +storageGB.toFixed(3),
      free: FREE.storageGB,
      percent: +storagePct.toFixed(1),
      objects,
    },
    classA: { used: classA, free: FREE.classA, percent: +classAPct.toFixed(1) },
    classB: { used: classB, free: FREE.classB, percent: +classBPct.toFixed(1) },
    alerts,
    threshold,
  };

  const shouldNotify = isCron && (alerts.length > 0 || alwaysNotify);
  if (shouldNotify) {
    const text = formatMessage(report);
    await Promise.allSettled([
      sendTelegram(env, text),
      sendWeCom(env, text),
    ]);
  }

  return report;
}

async function getR2Usage(env) {
  const accountId = env.ACCOUNT_ID;
  const token = env.CF_API_TOKEN;

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const gqlQuery = `
    query ($accountTag: String!, $start: Time!, $end: Time!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          r2OperationsAdaptiveGroups(
            limit: 10000
            filter: {
              datetime_geq: $start
              datetime_leq: $end
            }
          ) {
            sum { requests }
            dimensions { actionType }
          }
        }
      }
    }
  `;

  const gqlRes = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: gqlQuery,
      variables: {
        accountTag: accountId,
        start: start.toISOString(),
        end: now.toISOString(),
      },
    }),
  });

  const gqlData = await gqlRes.json();
  if (gqlData.errors) {
    throw new Error("GraphQL Error: " + JSON.stringify(gqlData.errors));
  }

  let classA = 0;
  let classB = 0;
  const groups = gqlData.data?.viewer?.accounts?.[0]?.r2OperationsAdaptiveGroups || [];
  for (const g of groups) {
    const action = g.dimensions.actionType;
    const req = g.sum.requests || 0;
    if (CLASS_A.has(action)) classA += req;
    else if (CLASS_B.has(action)) classB += req;
  }

  const metricsRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/metrics`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const metricsData = await metricsRes.json();
  const standard = metricsData.result?.standard?.published || {};
  const payloadSize = standard.payloadSize || 0;
  const objects = standard.objects || 0;
  const storageGB = payloadSize / 1024 ** 3;

  return { storageGB, objects, classA, classB };
}

function formatMessage(report) {
  const { storage, classA, classB, alerts } = report;
  const timeStr = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

  let msg = `📊 R2 免费额度监控\n\n`;
  msg += `🕐 ${timeStr}\n\n`;
  msg += `💾 存储：${storage.used} / ${storage.free} GB （${storage.percent}%）\n`;
  msg += `   对象数：${storage.objects}\n`;
  msg += `✍️ Class A：${classA.used.toLocaleString()} / ${classA.free.toLocaleString()} （${classA.percent}%）\n`;
  msg += `📖 Class B：${classB.used.toLocaleString()} / ${classB.free.toLocaleString()} （${classB.percent}%）\n`;

  if (alerts.length > 0) {
    msg += `\n⚠️ 超过阈值：${alerts.join("、")}`;
  } else {
    msg += `\n✅ 用量安全`;
  }
  return msg;
}

// -------------------- 网页渲染 --------------------
function levelClass(pct) {
  if (pct >= 90) return "danger";
  if (pct >= 70) return "warn";
  return "ok";
}

function barWidth(pct) {
  return Math.min(100, Math.max(0, pct)).toFixed(1);
}

function renderHTML(report) {
  const { storage, classA, classB, alerts, threshold, time } = report;
  const timeStr = new Date(time).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  const statusOk = !alerts || alerts.length === 0;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>R2 免费额度监控</title>
  <style>
    :root {
      --bg: #0f1419;
      --card: #1a2332;
      --text: #e7ecf3;
      --muted: #8b9bb4;
      --ok: #22c55e;
      --warn: #f59e0b;
      --danger: #ef4444;
      --accent: #3b82f6;
      --border: #2a3548;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 24px 16px 48px;
      line-height: 1.5;
    }
    .wrap { max-width: 720px; margin: 0 auto; }
    header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 28px;
    }
    h1 { font-size: 1.5rem; font-weight: 700; }
    .sub { color: var(--muted); font-size: 0.875rem; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .badge.ok { background: rgba(34,197,94,0.15); color: var(--ok); }
    .badge.warn { background: rgba(245,158,11,0.15); color: var(--warn); }
    .badge.danger { background: rgba(239,68,68,0.15); color: var(--danger); }
    .grid { display: grid; gap: 16px; }
    @media (min-width: 560px) {
      .grid { grid-template-columns: 1fr; }
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px;
    }
    .card-title {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 12px;
    }
    .card-title h2 { font-size: 1rem; font-weight: 600; }
    .pct { font-size: 1.25rem; font-weight: 700; }
    .pct.ok { color: var(--ok); }
    .pct.warn { color: var(--warn); }
    .pct.danger { color: var(--danger); }
    .meta { color: var(--muted); font-size: 0.85rem; margin-bottom: 14px; }
    .bar {
      height: 10px;
      background: #243044;
      border-radius: 999px;
      overflow: hidden;
    }
    .bar > i {
      display: block;
      height: 100%;
      border-radius: 999px;
      transition: width 0.4s ease;
    }
    .bar > i.ok { background: linear-gradient(90deg, #16a34a, #22c55e); }
    .bar > i.warn { background: linear-gradient(90deg, #d97706, #f59e0b); }
    .bar > i.danger { background: linear-gradient(90deg, #dc2626, #ef4444); }
    .alert-box {
      margin-top: 16px;
      padding: 14px 16px;
      border-radius: 12px;
      background: rgba(239,68,68,0.1);
      border: 1px solid rgba(239,68,68,0.3);
      color: #fca5a5;
      font-size: 0.9rem;
    }
    footer {
      margin-top: 28px;
      text-align: center;
      color: var(--muted);
      font-size: 0.8rem;
    }
    footer a { color: var(--accent); text-decoration: none; }
    footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <div>
        <h1>R2 免费额度监控</h1>
        <p class="sub">更新时间：${timeStr}（北京时间）</p>
      </div>
      <span class="badge ${statusOk ? "ok" : "danger"}">
        ${statusOk ? "✅ 用量安全" : "⚠️ 超过阈值"}
      </span>
    </header>

    <div class="grid">
      <div class="card">
        <div class="card-title">
          <h2>💾 存储空间</h2>
          <span class="pct ${levelClass(storage.percent)}">${storage.percent}%</span>
        </div>
        <p class="meta">${storage.used} GB / ${storage.free} GB · 对象数 ${storage.objects}</p>
        <div class="bar"><i class="${levelClass(storage.percent)}" style="width:${barWidth(storage.percent)}%"></i></div>
      </div>

      <div class="card">
        <div class="card-title">
          <h2>✍️ Class A 操作（写/列表）</h2>
          <span class="pct ${levelClass(classA.percent)}">${classA.percent}%</span>
        </div>
        <p class="meta">${classA.used.toLocaleString()} / ${classA.free.toLocaleString()} 次</p>
        <div class="bar"><i class="${levelClass(classA.percent)}" style="width:${barWidth(classA.percent)}%"></i></div>
      </div>

      <div class="card">
        <div class="card-title">
          <h2>📖 Class B 操作（读）</h2>
          <span class="pct ${levelClass(classB.percent)}">${classB.percent}%</span>
        </div>
        <p class="meta">${classB.used.toLocaleString()} / ${classB.free.toLocaleString()} 次</p>
        <div class="bar"><i class="${levelClass(classB.percent)}" style="width:${barWidth(classB.percent)}%"></i></div>
      </div>
    </div>

    ${
      alerts && alerts.length
        ? `<div class="alert-box">超过阈值（≥${threshold}%）：${alerts.join("、")}</div>`
        : ""
    }

    <footer>
      阈值 ${threshold}% ·
      <a href="?json=1">查看 JSON</a>
    </footer>
  </div>
</body>
</html>`;
}

function renderErrorHTML(msg) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>R2 监控 - 错误</title>
  <style>
    body { font-family: system-ui, sans-serif; background:#0f1419; color:#e7ecf3; padding:40px 20px; }
    .box { max-width:480px; margin:0 auto; background:#1a2332; border-radius:16px; padding:24px; border:1px solid #2a3548; }
    h1 { font-size:1.2rem; margin-bottom:12px; color:#ef4444; }
    p { color:#8b9bb4; word-break:break-all; }
  </style>
</head>
<body>
  <div class="box">
    <h1>加载失败</h1>
    <p>${escapeHtml(msg)}</p>
  </div>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// -------------------- Telegram --------------------
async function sendTelegram(env, text) {
  if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID) return;

  await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: env.TG_CHAT_ID,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });
}

// -------------------- 企业微信（QYWX_AM） --------------------
function parseQywxAm(am) {
  if (!am || typeof am !== "string") return null;
  const parts = am.split(",").map((s) => s.trim());
  if (parts.length < 4) return null;
  return {
    corpid: parts[0],
    corpsecret: parts[1],
    touser: parts[2] || "@all",
    agentid: parts[3],
    media_id: parts[4] || "0",
  };
}

async function sendWeCom(env, text) {
  const cfg = parseQywxAm(env.QYWX_AM);
  if (!cfg) return;

  const tokenUrl =
    `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(cfg.corpid)}&corpsecret=${encodeURIComponent(cfg.corpsecret)}`;
  const tokenRes = await fetch(tokenUrl);
  const tokenData = await tokenRes.json();
  if (tokenData.errcode !== 0) {
    console.error("企业微信获取 token 失败", tokenData);
    return;
  }

  const body = {
    touser: cfg.touser,
    msgtype: "text",
    agentid: Number(cfg.agentid),
    text: { content: text },
    safe: 0,
  };

  const sendUrl = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${tokenData.access_token}`;
  const sendRes = await fetch(sendUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const sendData = await sendRes.json();
  if (sendData.errcode !== 0) {
    console.error("企业微信发送失败", sendData);
  }
}
