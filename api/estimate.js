
const ALLOWED_PROPERTY_TYPES = new Set([
  "Single Family",
  "Condo",
  "Townhouse",
  "Multi-Family",
  "Manufactured",
  "Apartment",
  "Land"
]);

function sendJson(res, status, data) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(data);
}

function validNumber(value, max) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return false;
  }

  const number = Number(value);

  return Number.isFinite(number) &&
    number > 0 &&
    number <= max;
}

function buildParams(body) {
  const params = new URLSearchParams();

  params.set("address", body.address.trim());
  params.set("compCount", "15");
  params.set("lookupSubjectAttributes", "true");

  if (ALLOWED_PROPERTY_TYPES.has(body.propertyType)) {
    params.set("propertyType", body.propertyType);
  }

  const fields = {
    bedrooms: 30,
    bathrooms: 30,
    squareFootage: 100000
  };

  for (const [field, max] of Object.entries(fields)) {
    if (validNumber(body[field], max)) {
      params.set(field, String(Number(body[field])));
    }
  }

  return params;
}

async function fetchRentCast(endpoint, params, apiKey) {
  const url =
    `https://api.rentcast.io/v1/${endpoint}?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Api-Key": apiKey
    },
    signal: AbortSignal.timeout(15000)
  });

  const text = await response.text();

  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("RentCast returned an invalid response.");
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("RentCast rejected the API key. Check your Vercel environment variable.");
    }

    if (response.status === 429) {
      throw new Error("RentCast request limit reached. Please try again later.");
    }

    throw new Error(
      data.message ||
      data.error ||
      `RentCast request failed (${response.status}).`
    );
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
      error: "RentCast API key is missing from Vercel."
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
      console.error("RentCast value error:", valueResult.reason);
      console.error("RentCast rent error:", rentResult.reason);

      return sendJson(res, 502, {
        error: "RentCast could not estimate this property. Check the address and try again."
      });
    }

    return sendJson(res, 200, {
      provider: "RentCast",
      estimateType: "Automated market valuation",
      value,
      rent,
      warnings: [
        "The property value is a market estimate, not a guaranteed after-repair value.",
        "Rental estimates are not guaranteed achievable rents.",
        "Renovation costs require a separate property-condition assessment."
      ]
    });

  } catch (error) {
    console.error("Estimate endpoint error:", error);

    return sendJson(res, 500, {
      error: error.name === "TimeoutError"
        ? "RentCast took too long to respond. Please try again."
        : "An unexpected error occurred while estimating this property."
    });
  }
};
