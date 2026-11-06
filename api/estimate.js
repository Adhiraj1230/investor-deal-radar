
const ALLOWED_PROPERTY_TYPES = new Set([
  "Single Family",
  "Condo",
  "Townhouse",
  "Multi-Family",
  "Manufactured",
  "Apartment"
]);

const ASSUMPTIONS = {
  renovationLowPerSqFt: 25,
  renovationHighPerSqFt: 50,

  purchaseClosingRate: 0.03,
  sellingCostRate: 0.06,

  holdingCostsPerMonth: 500,
  holdingPeriodMonths: 6,
  contingencyRate: 0.10,

  financing: {
    downPaymentRate: 0.20,
    annualInterestRate: 0.105,
    loanPointsRate: 0.02
  }
};

function sendJson(res, status, data) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(data);
}

function validNumber(value, max) {
  if (value === null || value === undefined || value === "") {
    return false;
  }

  const number = Number(value);

  return Number.isFinite(number) && number > 0 && number <= max;
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
  const response = await fetch(
    `https://api.rentcast.io/v1/${endpoint}?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Api-Key": apiKey
      },
      signal: AbortSignal.timeout(15000)
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
    if (response.status === 401 || response.status === 403) {
      throw new Error("RentCast rejected the API key.");
    }

    if (response.status === 429) {
      throw new Error("RentCast request limit reached.");
    }

    throw new Error(
      data.message ||
      data.error ||
      `RentCast request failed (${response.status}).`
    );
  }

  return data;
}

function calculateMetrics(value, purchasePrice, squareFootage) {
  const arv = Number(value?.price);
  const purchase = Number(purchasePrice);
  const sqft = Number(squareFootage);

  if (
    !Number.isFinite(arv) ||
    !Number.isFinite(purchase) ||
    !Number.isFinite(sqft) ||
    arv <= 0 ||
    purchase <= 0 ||
    sqft <= 0
  ) {
    return null;
  }

  const renovationLow =
    sqft * ASSUMPTIONS.renovationLowPerSqFt;

  const renovationHigh =
    sqft * ASSUMPTIONS.renovationHighPerSqFt;

  const closingCosts =
    purchase * ASSUMPTIONS.purchaseClosingRate;

  const sellingCosts =
    arv * ASSUMPTIONS.sellingCostRate;

  const holdingCosts =
    ASSUMPTIONS.holdingCostsPerMonth *
    ASSUMPTIONS.holdingPeriodMonths;

  const contingencyLow =
    renovationLow * ASSUMPTIONS.contingencyRate;

  const contingencyHigh =
    renovationHigh * ASSUMPTIONS.contingencyRate;

  const totalCostLow =
    purchase +
    closingCosts +
    renovationLow +
    contingencyLow +
    holdingCosts;

  const totalCostHigh =
    purchase +
    closingCosts +
    renovationHigh +
    contingencyHigh +
    holdingCosts;

  const profitLow =
    arv -
    purchase -
    closingCosts -
    renovationHigh -
    contingencyHigh -
    holdingCosts -
    sellingCosts;

  const profitHigh =
    arv -
    purchase -
    closingCosts -
    renovationLow -
    contingencyLow -
    holdingCosts -
    sellingCosts;

  const roiLow =
    (profitLow / totalCostHigh) * 100;

  const roiHigh =
    (profitHigh / totalCostLow) * 100;

  return {
    estimatedARV: arv,

    renovationEstimate: {
      low: Math.round(renovationLow),
      high: Math.round(renovationHigh)
    },

    potentialNetProfit: {
      low: Math.round(profitLow),
      high: Math.round(profitHigh)
    },

    estimatedROI: {
      low: Number(roiLow.toFixed(1)),
      high: Number(roiHigh.toFixed(1))
    },

    assumptions: {
      renovationPerSqFt: "$25–$50",
      contingencyRate: "10%",
      purchaseClosingRate: "3%",
      sellingCostRate: "6%",
      holdingCosts,
      holdingPeriodMonths: ASSUMPTIONS.holdingPeriodMonths
    }
  };
}

  const purchase = Number(purchasePrice);
  const area = Number(squareFootage);

  const renovationLow =
    area * ASSUMPTIONS.renovationLowPerSqFt;

  const renovationHigh =
    area * ASSUMPTIONS.renovationHighPerSqFt;

  const closingCosts =
    purchase * ASSUMPTIONS.purchaseClosingRate;

  const sellingCosts =
    arv * ASSUMPTIONS.sellingCostRate;

  const profitAtHighRenovation =
    arv -
    purchase -
    closingCosts -
    renovationHigh -
    ASSUMPTIONS.holdingCosts -
    sellingCosts;

  const profitAtLowRenovation =
    arv -
    purchase -
    closingCosts -
    renovationLow -
    ASSUMPTIONS.holdingCosts -
    sellingCosts;

  const totalCostAtHighRenovation =
    purchase +
    closingCosts +
    renovationHigh +
    ASSUMPTIONS.holdingCosts;

  const totalCostAtLowRenovation =
    purchase +
    closingCosts +
    renovationLow +
    ASSUMPTIONS.holdingCosts;

  const roiLow =
    totalCostAtHighRenovation > 0
      ? profitAtHighRenovation / totalCostAtHighRenovation * 100
      : null;

  const roiHigh =
    totalCostAtLowRenovation > 0
      ? profitAtLowRenovation / totalCostAtLowRenovation * 100
      : null;

  return {
    estimatedARV: Math.round(arv),
    renovationEstimate: {
      low: Math.round(renovationLow),
      high: Math.round(renovationHigh)
    },
    potentialNetProfit: {
      low: Math.round(profitAtHighRenovation),
      high: Math.round(profitAtLowRenovation)
    },
    estimatedROI: {
      low: Number(roiLow.toFixed(1)),
      high: Number(roiHigh.toFixed(1))
    },
    assumptions: {
      renovationPerSqFt: "$25–$50",
      purchaseClosingRate: "3%",
      sellingCostRate: "6%",
      holdingCosts: ASSUMPTIONS.holdingCosts,
      holdingPeriodMonths: 6
    }
  };
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

    const metrics = calculateMetrics(
      value,
      body.purchasePrice,
      body.squareFootage
    );

    return sendJson(res, 200, {
      provider: "RentCast",
      estimateType: "Automated market valuation",
      value,
      rent,
      metrics,
      warnings: [
        "Estimated ARV uses an automated market valuation and is not a verified after-repair value.",
        "Renovation estimates use a standard cost-per-square-foot assumption.",
        "Actual property condition, financing, taxes, and transaction costs may change the results."
      ]
    });

  } catch (error) {
    console.error("Estimate endpoint error:", error);

    return sendJson(
      res,
      error.name === "TimeoutError" ? 504 : 500,
      {
        error: error.name === "TimeoutError"
          ? "RentCast took too long to respond. Please try again."
          : "An unexpected error occurred while estimating this property."
      }
    );
  }
};
