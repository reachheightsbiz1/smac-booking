export async function onRequestPost(context) {
    try {
      const request = context.request;
      const body = await request.json();
      const reg = (body.registrationNumber || "").replace(/\s/g, "").toUpperCase();
  
      if (!reg) {
        return new Response(JSON.stringify({ error: "No reg provided" }), {
          status: 400, headers: { "Content-Type": "application/json" }
        });
      }
  
      const apiKey = "skaircon-XJKwha827rHchbw";
      const url = `https://api.vehiclesmart.com/rest/vehicleData?reg=${reg}&appid=${apiKey}&isRefreshing=false&dvsaFallbackMode=false`;
  
      const apiResponse = await fetch(url, {
        method: "GET",
        headers: { "Accept": "application/json", "Cache-Control": "no-cache" }
      });
  
      if (!apiResponse.ok) {
        return new Response(JSON.stringify({ error: "Vehicle Smart API error" }), {
          status: 502, headers: { "Content-Type": "application/json" }
        });
      }
  
      const data = await apiResponse.json();
  
      if (!data.Success || !data.VehicleDetails) {
        return new Response(JSON.stringify({ error: "Vehicle not found" }), {
          status: 404, headers: { "Content-Type": "application/json" }
        });
      }
  
      const v = data.VehicleDetails;
      const modelBase = v.Model || v.ModelDvsa || "";
      const variant = v.Derivative || v.Variant || v.ModelDescription || "";
      const combinedModel = `${modelBase} ${variant}`.trim();
  
      return new Response(JSON.stringify({
        make: v.Make || "",
        model: combinedModel,
        year: v.Year ? parseInt(v.Year, 10) : null,
        engineCC: v.CylinderCapacity || v.EngineCapacity || null,
        fuelType: v.Fuel || "",
      }), {
        status: 200, headers: { "Content-Type": "application/json" }
      });
  
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }
  }