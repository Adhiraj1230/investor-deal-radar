export default async function handler(req, res) {
  const { city, state, zipCode, limit = 20 } = req.query;

  if (!city && !zipCode) {
    return res.status(400).json({ error: "Enter a city or ZIP code." });
  }

  const params = new URLSearchParams({
    status: "Active",
    limit: String(Math.min(Number(limit) || 20, 50)),
  });

  if (city) params.set("city", city);
  if (state) params.set("state", state);
  if (zipCode) params.set("zipCode", zipCode);

  try {
    const response = await fetch(
      `https://api.rentcast.io/v1/listings/sale?${params}`,
      {
        headers: {
          "X-Api-Key": process.env.RENTCAST_API_KEY,
          Accept: "application/json",
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: "Unable to retrieve listings." });
  }
}
