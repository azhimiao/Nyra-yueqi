async function request(perm) {
  const host = window.nyra && window.nyra.host;
  if (!host) throw new Error("host missing");
  await host.requestPermission(perm);
}

function showToast(text) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.hidden = false;
  el.textContent = text;
}

function renderDenied(label) {
  const host = document.getElementById("events");
  if (!host) return;
  host.innerHTML = '<div class="err"><p>需要「' + label + '」权限才能显示日程</p><button type="button" class="ghost" id="go-grant">去授权</button></div>';
  document.getElementById("go-grant")?.addEventListener("click", () => {
    loadEvents().catch(() => {});
  });
}

async function loadEvents() {
  const hostEl = document.getElementById("events");
  const sendBtn = document.getElementById("send");
  try {
    await request("calendar.read");
  } catch (err) {
    if (sendBtn) sendBtn.disabled = true;
    renderDenied("读取日历");
    return;
  }
  const host = window.nyra.host;
  const events = await host.calendar.listEvents({ days: 2 });
  if (!events.length) {
    hostEl.innerHTML = '<div class="empty">今天和明天还没有日程</div>';
  } else {
    hostEl.innerHTML = events.map((ev) => (
      '<article class="row"><strong>' + escapeHtml(ev.title || "日程") + '</strong><span>' +
      escapeHtml((ev.date || "") + " " + (ev.time || "")) + '</span></article>'
    )).join("");
  }
  if (sendBtn) sendBtn.disabled = false;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

document.getElementById("send")?.addEventListener("click", async () => {
  try {
    await request("chat.send_token");
  } catch {
    showToast("需要「发送信物消息」权限");
    return;
  }
  const host = window.nyra.host;
  const events = await host.calendar.listEvents({ days: 1 });
  const first = events[0];
  const title = first ? ("提醒：" + (first.title || "日程")) : "今日提醒";
  const subtitle = first
    ? ((first.date || "") + " " + (first.time || "")).trim()
    : "来自日程信物助手";
  await host.chat.sendTokenCard({
    kind: "reminder",
    title: title.slice(0, 40),
    subtitle: subtitle.slice(0, 80),
  });
  showToast("已发送信物到 Pop");
});

loadEvents().catch((err) => {
  console.error(err);
  renderDenied("读取日历");
});
