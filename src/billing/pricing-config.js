/** Open-source tree: credit packs and checkout links are removed. */

export const CREDIT_PACKAGES = Object.freeze([]);

export const BILLING_CHECKOUT = Object.freeze({
  whopEnabled: false,
});

export function catfkCheckoutUrl() {
  throw new Error("Checkout is not part of this open-source build.");
}
