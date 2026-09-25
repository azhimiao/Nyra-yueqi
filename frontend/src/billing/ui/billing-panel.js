export function buildReferralShareText() {
  return "";
}

export function installSidebarCredits() {
  return () => {};
}

export function openCreditsSurface() {}

export function buildBillingPanelHtml() {
  return `<section class="billing-panel"><p>本开源构建使用你自己的模型 API，没有托管积分。</p></section>`;
}

export function mountBillingPanel(root) {
  if (root) root.innerHTML = buildBillingPanelHtml();
  return { refresh() {}, destroy() {} };
}

export function installCreditsExhaustedDialog() {
  return () => {};
}

export function confirmCreditEstimate() {
  return Promise.resolve(true);
}
