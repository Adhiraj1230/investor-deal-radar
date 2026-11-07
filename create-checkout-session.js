
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;

  if (!secretKey || !priceId) {
    return res.status(500).json({
      error: "Stripe environment variables are missing."
    });
  }

  try {
    const params = new URLSearchParams();

    params.append("mode", "subscription");
    params.append("line_items[0][price]", priceId);
    params.append("line_items[0][quantity]", "1");

    params.append(
      "success_url",
      "https://investordealradar.com/?checkout=success&session_id={CHECKOUT_SESSION_ID}"
    );

    params.append(
      "cancel_url",
      "https://investordealradar.com/?checkout=cancelled"
    );

    params.append("allow_promotion_codes", "true");

    const response = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params
      }
    );

    const session = await response.json();

    if (!response.ok) {
      console.error("Stripe error:", session.error?.message);

      return res.status(400).json({
        error: "Unable to create checkout session."
      });
    }

    return res.status(200).json({
      url: session.url
    });

  } catch (error) {
    console.error("Checkout error:", error);

    return res.status(500).json({
      error: "Something went wrong creating checkout."
    });
  }
}
