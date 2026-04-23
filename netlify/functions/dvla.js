exports.handler = async function (event) {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }
  
    const DVLA_API_KEY = "skaircon-XJKwha827rHchbw";
  
    try {
      const { registrationNumber } = JSON.parse(event.body);
  
      const response = await fetch(
        "https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles",
        {
          method: "POST",
          headers: {
            "x-api-key": DVLA_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ registrationNumber }),
        }
      );
  
      if (!response.ok) {
        return {
          statusCode: response.status,
          body: JSON.stringify({ error: "DVLA lookup failed" }),
        };
      }
  
      const data = await response.json();
  
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          make: data.make || "",
          model: data.model || "",
          year: data.yearOfManufacture || null,
          colour: data.colour || "",
        }),
      };
    } catch (err) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Internal error" }),
      };
    }
  };