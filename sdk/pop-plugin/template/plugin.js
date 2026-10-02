/**
 * 月栖 Pop 插件示例 · 投骰子
 * 宿主注入：ctx.host === window.NyraPop（或等价桥）
 */
export default {
  async onInstall() {},

  async onToolbarClick(ctx) {
    const host = ctx.host;
    await host.openPanel({ height: "half" });
    const root = ctx.panelRoot;
    if (!root) return;

    root.innerHTML = `
      <div style="padding:16px;font-family:system-ui,sans-serif;color:#1d2a2d">
        <strong style="font-size:15px">投骰子</strong>
        <p style="margin:8px 0 14px;color:#6a7a77;font-size:12px">选择面数，结果会发到当前会话。</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${[4, 6, 8, 10, 12, 20].map((n) => `
            <button type="button" data-sides="${n}"
              style="min-width:52px;min-height:40px;border:0;border-radius:12px;background:#2f4448;color:#fff;font-weight:700">
              D${n}
            </button>`).join("")}
        </div>
        <p data-dice-status style="margin-top:14px;font-size:12px;color:#6a7a77"></p>
      </div>`;

    root.querySelectorAll("[data-sides]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const sides = Number(btn.getAttribute("data-sides") || 6);
        const value = 1 + Math.floor(Math.random() * sides);
        const status = root.querySelector("[data-dice-status]");
        if (status) status.textContent = `D${sides} → ${value}`;
        const session = await host.getSession();
        await host.inject({
          kind: "system",
          text: `掷出了 D${sides}：${value}`,
          meta: { pluginId: "sample-dice", sides, value, sessionId: session.sessionId },
        });
        const count = Number((await host.storage.get("rollCount")) || 0) + 1;
        await host.storage.set("rollCount", count);
        await host.setToolbarBadge(String(count));
      });
    });
  },

  async onUnload() {},
};
