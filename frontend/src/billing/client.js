export function fetchBillingSummary() {
  return Promise.resolve({ available: 0, balance: 0, hosted: false });
}

export function fetchBillingPricing() {
  return Promise.resolve({ agent: { maxCredits: 0 }, hosted: false });
}

export function fetchBillingLedger() {
  return Promise.resolve({ entries: [] });
}

export function fetchReferralInvitation() {
  return Promise.resolve(null);
}

export function redeemBillingCode() {
  return Promise.reject(new Error("This open-source build has no credit store."));
}

export function createWhopCheckout() {
  return Promise.reject(new Error("This open-source build has no checkout."));
}
