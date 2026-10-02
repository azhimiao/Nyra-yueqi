/** Open-source tree: billing HTTP calls are removed. */

export async function fetchBillingSummary() {
  return { ok: false, credits: 0 };
}

export async function fetchBillingPricing() {
  return { ok: false };
}

export async function fetchBillingLedger() {
  return { ok: false, entries: [] };
}

export async function fetchReferralInvitation() {
  return { ok: false };
}

export async function redeemBillingCode() {
  return { ok: false, error: "removed" };
}

export async function createWhopCheckout() {
  return { ok: false, error: "removed" };
}
