
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

  const cleanCity =
    typeof city === "string" ? normalizeCity(city) : "";

  const cleanState =
    typeof state === "string" ? state.trim().toUpperCase() : "";

  const cleanZip =
    typeof zipCode === "string" ? zipCode.trim() : "";

  if (!cleanCity && !cleanZip) {
    return sendJson(res, 400, {
      error: "Enter a city or ZIP code."
    });
  }

  if (cleanCity.length > 100) {
    return sendJson(res, 400, {
      error: "City name is too long."
    });
  }

  if (cleanState && !/^[A-Z]{2}$/.test(cleanState)) {
    return sendJson(res, 400, {
      error: "Enter a valid two-letter state abbreviation."
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
      console.error("Invalid RentCast listings response.");

      return sendJson(res, 502, {
        error: "The property data provider returned an invalid response."
      });
    }

    if (!response.ok) {
      console.error("RentCast listings error:", response.status, data);

      return sendJson(res, response.status, {
        error: response.status === 401 || response.status === 403
          ? "RentCast rejected the API key. Check your Vercel environment variable."
          : response.status === 429
          ? "RentCast request limit reached. Please try again later."
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
