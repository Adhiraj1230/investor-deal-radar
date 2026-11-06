
const ALLOWED_PROPERTY_TYPES = new Set([
  "Single Family",
  "Condo",
  "Townhouse",
  "Multi-Family",
  "Manufactured",
  "Apartment"
]);

function sendJson(res, status, data) {
  return res.status(status).json(data);
}

function buildParams(body) {
  const params = new URLSearchParams();

  params.set("address", body.address.trim());
  params.set("compCount", "15");
  params.set("lookupSubjectAttributes", "true");

  if (ALLOWED_PROPERTY_TYPES.has(body.propertyType)) {
    params.set("propertyType", body.propertyType);
  }

  const numericFields = {
    bedrooms: body.bedrooms,
    bathrooms: body.bathrooms,
    squareFootage: body.squareFootage
  };

  for (const [key, value] of Object.entries(numericFields)) {
    if (
      value !== null &&
      value !== undefined &&
      value !== "" &&
      Number.isFinite(Number(value)) &&
      Number(value) > 0
    ) {
      params.set(key, String(Number(value)));
    }
  }

  return params;
}

async function fetchRentCast(endpoint, params, apiKey) {
  const response = await fetch(
    `https://api.rentcast.io/v1/${endpoint}?${params.toString()}`,
    {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Api-Key": apiKey
      }
    }
  );

  const text = await response.text();

  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("RentCast returned an invalid response.");
  }

  if (!response.ok) {
    const message =
      data.message ||
      data.error ||
      `RentCast request failed (${response.status}).`;

    throw new Error(message);
  }

  return data;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, {
      error: "Method not allowed."
    });
  }

  const apiKey = process.env.RENTCAST_API_KEY;

  if (!apiKey) {
    return sendJson(res, 500, {
      error: "The RentCast API key is not configured in Vercel."
    });
  }

  const body = req.body || {};

  if (
    typeof body.address !== "string" ||
    !body.address.trim() ||
    body.address.trim().length > 300
  ) {
    return sendJson(res, 400, {
      error: "Please provide a valid property address."
    });
  }

  const params = buildParams(body);

  try {
    const [valueResult, rentResult] = await Promise.allSettled([
      fetchRentCast("avm/value", params, apiKey),
      fetchRentCast("avm/rent/long-term", params, apiKey)
    ]);

    const value =
      valueResult.status === "fulfilled"
        ? valueResult.value
        : null;

    const rent =
      rentResult.status === "fulfilled"
        ? rentResult.value
        : null;

    if (!value && !rent) {
      const reason =
        valueResult.reason?.message ||
        rentResult.reason?.message ||
        "RentCast could not estimate this property.";

      return sendJson(res, 502, {
        error: reason
      });
    }

    return sendJson(res, 200, {
      provider: "RentCast",
      estimateType: "Automated valuation model",
      value,
      rent,
      warnings: [
        "Market value estimates are not guaranteed after-repair values.",
        "Rental estimates are not guaranteed achievable rents.",
        "Renovation costs require separate property-condition assessment."
      ]
    });

  } catch (error) {
    console.error("Estimate endpoint error:", error);

    return sendJson(res, 500, {
      error: "An unexpected error occurred while estimating this property."
    });
  }
};
