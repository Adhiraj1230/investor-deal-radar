
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!stripeKey || !priceId || !supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({
      error: "Required payment or authentication settings are missing."
    });
  }

  const authorization = req.headers.authorization || "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!accessToken) {
    return res.status(401).json({
      error: "Please sign in before purchasing Premium."
    });
  }

  try {
    // Verify the user's Supabase session.
    const userResponse = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`,
      {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    if (!userResponse.ok) {
      return res.status(401).json({
        error: "Your session is invalid or expired. Please sign in again."
      });
    }

    const user = await userResponse.json();

    if (!user.id || !user.email) {
      return res.status(401).json({
        error: "Unable to verify your account."
      });
    }

    // Create Stripe subscription checkout.
    const params = new URLSearchParams();

    params.append("mode", "subscription");
    params.append("line_items[0][price]", priceId);
    params.append("line_items[0][quantity]", "1");

    params.append("customer_email", user.email);
    params.append("client_reference_id", user.id);

    params.append("metadata[supabase_user_id]", user.id);
    params.append("subscription_data[metadata][supabase_user_id]", user.id);

    params.append(
      "success_url",
      "https://investor-deal-radar-z1h3.vercel.app/?checkout=success&session_id={CHECKOUT_SESSION_ID}"
    );

    params.append(
      "cancel_url",
      "https://investor-deal-radar-z1h3.vercel.app/?checkout=cancelled"
    );

    params.append("allow_promotion_codes", "true");

    const stripeResponse = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params
      }
    );

    const session = await stripeResponse.json();

    if (!stripeResponse.ok) {
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
