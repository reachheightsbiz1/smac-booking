exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const reg = (body.registrationNumber || "").replace(/\s/g, "").toUpperCase();

    if (!reg) {
      return { statusCode: 400, body: JSON.stringify({ error: "No reg provided" }) };
    }

    const apiKey = "skaircon-XJKwha827rHchbw";
    const url = `https://api.vehiclesmart.com/rest/vehicleData?reg=${reg}&appid=${apiKey}&isRefreshing=false&dvsaFallbackMode=false`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Cache-Control": "no-cache"
      }
    });

    if (!response.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: "Vehicle Smart API error" }) };
    }

    const data = await response.json();

    if (!data.Success || !data.VehicleDetails) {
      return { statusCode: 404, body: JSON.stringify({ error: "Vehicle not found" }) };
    }

    const v = data.VehicleDetails;
    
    // COMBINE ALL MODEL DATA: This ensures we capture "SPORT", "ALLROAD", "ESTATE", etc.
    const modelBase = v.Model || v.ModelDvsa || "";
    const variant = v.Derivative || v.Variant || v.ModelDescription || "";
    const combinedModel = `${modelBase} ${variant}`.trim();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        make: v.Make || "",
        model: combinedModel,
        year: v.Year ? parseInt(v.Year, 10) : null,
        engineCC: v.CylinderCapacity || v.EngineCapacity || null,
        fuelType: v.Fuel || "",
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};