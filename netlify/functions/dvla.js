// Netlify serverless function — proxies Vehicle Smart API
// Avoids CORS block when called from the browser
exports.handler = async function (event) {
    try {
      // Parse reg from POST body sent by App.tsx
      const body = JSON.parse(event.body || "{}");
      const reg = (body.registrationNumber || "").replace(/\s/g, "").toUpperCase();
  
      if (!reg) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "No registration provided" }),
        };
      }
  
      // Vehicle Smart API — GET request with appid and reg as URL params
      const apiKey = "skaircon-XJKwha827rHchbw";
      const url = `https://api.vehiclesmart.com/rest/vehicleData?reg=${reg}&appid=${apiKey}&isRefreshing=false&dvsaFallbackMode=false`;
  
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
      });
  
      if (!response.ok) {
        return {
          statusCode: 502,
          body: JSON.stringify({ error: "Vehicle Smart API error", status: response.status }),
        };
      }
  
      const data = await response.json();
  
      // Vehicle Smart returns Success:false if reg not found
      if (!data.Success || !data.VehicleDetails) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: "Vehicle not found", message: data.ServiceMessage || "" }),
        };
      }
  
      const v = data.VehicleDetails;
  
      // Return the fields App.tsx needs
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          make: v.Make || "",
          model: v.Model || v.ModelDvsa || "",
          year: v.Year ? parseInt(v.Year) : null,
          colour: v.Colour || "",
          fuelType: v.Fuel || "",
          engineCC: v.CylinderCapacity || null,
        }),
      };
    } catch (err) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Server error", detail: String(err) }),
      };
    }
  };