
const RESIDENTIAL_TYPES = [
  "Single Family",
  "Condo",
  "Townhouse",
  "Multi-Family",
  "Apartment",
  "Manufactured"
];

const STATES = {
  ALABAMA: "AL",
  ALASKA: "AK",
  ARIZONA: "AZ",
  ARKANSAS: "AR",
  CALIFORNIA: "CA",
  COLORADO: "CO",
  CONNECTICUT: "CT",
  DELAWARE: "DE",
  FLORIDA: "FL",
  GEORGIA: "GA",
  HAWAII: "HI",
  IDAHO: "ID",
  ILLINOIS: "IL",
  INDIANA: "IN",
  IOWA: "IA",
  KANSAS: "KS",
  KENTUCKY: "KY",
  LOUISIANA: "LA",
  MAINE: "ME",
  MARYLAND: "MD",
  MASSACHUSETTS: "MA",
  MICHIGAN: "MI",
  MINNESOTA: "MN",
  MISSISSIPPI: "MS",
  MISSOURI: "MO",
  MONTANA: "MT",
  NEBRASKA: "NE",
  NEVADA: "NV",
  "NEW HAMPSHIRE": "NH",
  "NEW JERSEY": "NJ",
  "NEW MEXICO": "NM",
  "NEW YORK": "NY",
  "NORTH CAROLINA": "NC",
  "NORTH DAKOTA": "ND",
  OHIO: "OH",
  OKLAHOMA: "OK",
  OREGON: "OR",
  PENNSYLVANIA: "PA",
  "RHODE ISLAND": "RI",
  "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD",
  TENNESSEE: "TN",
  TEXAS: "TX",
  UTAH: "UT",
  VERMONT: "VT",
  VIRGINIA: "VA",
  WASHINGTON: "WA",
  "WEST VIRGINIA": "WV",
  WISCONSIN: "WI",
  WYOMING: "WY",
  "DISTRICT OF COLUMBIA": "DC"
};

const VALID_STATE_CODES = new Set(Object.values(STATES));

function sendJson(res, status, data) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(data);
}

function normalizeCity(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/(^|[\s'-])\p{L}/gu, letter => letter.toUpperCase());
}

function normalizeState(value) {
  const normalized = value.trim().toUpperCase();

  if (STATES[normalized]) return STATES[normalized];
  if (VALID_STATE_CODES.has(normalized)) return normalized;

  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
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

  const {
    city,
    state,
    zipCode,
    limit = "20"
  } = req.query || {};

  let cleanCity =
    typeof city === "string" ? city.trim() : "";

  let cleanState =
    typeof state === "string" ? state.trim() : "";

  const cleanZip =
    typeof zipCode === "string" ? zipCode.trim() : "";

  // If the user typed a state name or abbreviation
  // into the city search box, convert it to a state search.
  if (cleanCity && !cleanState) {
    const possibleState = normalizeState(cleanCity);

    if (possibleState) {
      cleanState = possibleState;
      cleanCity = "";
    }
  }

  // Also accept full state names in the state parameter.
  if (cleanState) {
    const normalizedState = normalizeState(cleanState);

    if (!normalizedState) {
      return sendJson(res, 400, {
        error: "Enter a valid US state name or abbreviation."
      });
    }

    cleanState = normalizedState;
  }

  cleanCity = cleanCity ? normalizeCity(cleanCity) : "";

  if (!cleanCity && !cleanState && !cleanZip) {
    return sendJson(res, 400, {
      error: "Enter a city, state, or ZIP code."
    });
  }

  if (cleanCity.length > 100) {
    return sendJson(res, 400, {
      error: "City name is too long."
    });
  }

  if (cleanZip && !/^\d{5}$/.test(cleanZip)) {
    return sendJson(res, 400, {
      error: "Enter a valid five-digit ZIP code."
    });
  }

  if (!/^\d+$/.test(String(limit))) {
    return sendJson(res, 400, {
      error: "Invalid listing limit."
    });
  }

  const safeLimit = Math.min(
    Math.max(Number(limit), 1),
    50
  );

  const params = new URLSearchParams();

  params.set("status", "Active");
  params.set("limit", String(safeLimit));
  params.set("daysOld", "90");
  params.set("propertyType", RESIDENTIAL_TYPES.join("|"));

  if (cleanCity) params.set("city", cleanCity);
  if (cleanState) params.set("state", cleanState);
  if (cleanZip) params.set("zipCode", cleanZip);

  try {
    const response = await fetch(
      `https://api.rentcast.io/v1/listings/sale?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "X-Api-Key": apiKey,
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(15000)
      }
    );

    const text = await response.text();

    let data;

    try {
      data = text ? JSON.parse(text) : [];
    } catch {
      return sendJson(res, 502, {
        error: "The property data provider returned an invalid response."
      });
    }

    if (!response.ok) {
      console.error("RentCast listings error:", response.status, data);

      return sendJson(res, response.status, {
        error: response.status === 401 || response.status === 403
          ? "RentCast rejected the API key."
          : response.status === 429
          ? "RentCast request limit reached. Try again later."
          : "Unable to retrieve property listings."
      });
    }

    if (!Array.isArray(data)) {
      return sendJson(res, 502, {
        error: "Unexpected property data format."
      });
    }

    return sendJson(res, 200, data);

  } catch (error) {
    console.error("Listings endpoint error:", error);

    return sendJson(
      res,
      error.name === "TimeoutError" ? 504 : 500,
      {
        error: error.name === "TimeoutError"
          ? "RentCast took too long to respond. Please try again."
          : "Unable to retrieve listings."
      }
    );
  }
};
