
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const address = req.query.address;

  if (!address || typeof address !== "string" || address.length > 300) {
    return res.status(400).json({ error: "Valid address required" });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Google Maps API key is missing" });
  }

  try {
    const googleUrl =
      "https://maps.googleapis.com/maps/api/streetview" +
      "?size=640x350" +
      "&location=" + encodeURIComponent(address) +
      "&fov=90" +
      "&return_error_code=true" +
      "&key=" + encodeURIComponent(apiKey);

    const response = await fetch(googleUrl, {
      headers: {
        Referer: "https://investor-deal-radar-z1h3.vercel.app/"
      }
    });

    if (!response.ok) {
      return res.status(502).json({ error: "Street View image unavailable" });
    }

    const image = Buffer.from(await response.arrayBuffer());

    res.setHeader("Content-Type", response.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.status(200).send(image);

  } catch (error) {
    return res.status(500).json({ error: "Could not load Street View image" });
  }
}
