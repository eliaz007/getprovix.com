import Stripe from "stripe";

let stripeClient: Stripe | null = null;

/**
 * Lazily create the Stripe client so `next build` can collect page data for
 * /api/checkout without requiring STRIPE_SECRET_KEY at module-evaluation time.
 * Runtime checkout still fails fast if the secret is missing.
 */
export function getStripe(): Stripe {
  if (stripeClient) {
    return stripeClient;
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }

  stripeClient = new Stripe(stripeSecretKey, {
    apiVersion: "2026-07-29.dahlia",
  });

  return stripeClient;
}
