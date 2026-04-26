import { useState, useEffect } from "react";

// Year-based fallback lookup built from Bruce's spreadsheet
// Format: year -> [refrigerantFlag (0=R134a, 1=R1234yf), mostCommonGrams]
const YEAR_FALLBACK: Record<number, [number, number]> = {1990: [0, 790], 1991: [0, 700], 1992: [0, 800], 1993: [0, 800], 1994: [0, 800], 1995: [0, 750], 1996: [0, 750], 1997: [0, 750], 1998: [0, 750], 1999: [0, 750], 2000: [0, 750], 2001: [0, 750], 2002: [0, 650], 2003: [0, 650], 2004: [0, 550], 2005: [0, 550], 2006: [0, 550], 2007: [0, 550], 2008: [0, 550], 2009: [0, 500], 2010: [0, 500], 2011: [0, 500], 2012: [0, 500], 2013: [0, 500], 2014: [0, 500], 2015: [0, 500], 2016: [0, 500], 2017: [1, 500], 2018: [1, 500], 2019: [1, 500], 2020: [1, 500], 2021: [1, 500], 2022: [1, 500], 2023: [1, 500], 2024: [1, 500], 2025: [1, 500]};

interface CarInfo {
  make: string;
  model: string;
  year: number;
  refrigerant: string;
  grams: number;
  price: { base: number; extra: number; total: number };
  dvlaFound: boolean;
}

interface FormData {
  name: string;
  phone: string;
  email: string;
  postcode: string;
  date: string;
  time: string;
}

function calcPrice(refrigerant: string, grams: number) {
  // New pricing: per 100g after 600g, with rounding:
  // - remainder > 50g → round UP to next 100g bracket
  // - remainder <= 50g → round DOWN (don't charge for that bracket)
  if (refrigerant === "R1234yf") {
    const base = 120;
    let extra = 0;
    if (grams > 600) {
      const over = grams - 600;
      const remainder = over % 100;
      const brackets = remainder > 50 ? Math.ceil(over / 100) : Math.floor(over / 100);
      extra = brackets * 20;
    }
    return { base, extra, total: base + extra };
  } else {
    const base = 80;
    let extra = 0;
    if (grams > 600) {
      const over = grams - 600;
      const remainder = over % 100;
      const brackets = remainder > 50 ? Math.ceil(over / 100) : Math.floor(over / 100);
      extra = brackets * 10;
    }
    return { base, extra, total: base + extra };
  }
}

function decodeRegYear(reg: string): number | null {
  const clean = reg.replace(/\s/g, "").toUpperCase();
  const m = clean.match(/^[A-Z]{2}(\d{2})[A-Z]{3}$/);
  if (m) {
    const code = parseInt(m[1]);
    if (code >= 2 && code <= 51) return 2000 + code;
    if (code >= 52 && code <= 99) return 2000 + code - 50;
  }
  const prefix = clean.match(/^[A-Z]\d/);
  if (prefix) return 1998;
  return null;
}

// vehicles.json format: [make, model, yearFrom, yearTo, refrigerant(0=R134a 1=R1234yf), grams]
// DVLA returns make e.g. FORD and model e.g. FOCUS
// Spreadsheet has model e.g. FOCUS III 1.6 TI-VCT so we check if spreadsheet model contains dvla model words
function lookupVehicle(vehicleData: any[], make: string, model: string, year: number) {
  if (!vehicleData || !make || !year) return null;

  const makeUpper = make.toUpperCase().trim();
  const modelUpper = (model || "").toUpperCase().trim();

  // Filter by exact make + year range
  const makeYearMatches = vehicleData.filter((row: any[]) =>
    row[0] === makeUpper && year >= row[2] && year <= row[3]
  );
  if (makeYearMatches.length === 0) return null;

  // Score every row by how many DVLA model words appear in the spreadsheet model name
  const dvlaWords = modelUpper
    ? modelUpper.split(/[\s\-\/]+/).filter((w: string) => w.length > 1)
    : [];

  const scored = makeYearMatches.map((row: any[]) => {
    const sheetModel: string = (row[1] || "").toUpperCase();
    const matchCount = dvlaWords.filter((w: string) => sheetModel.includes(w)).length;
    return { row, score: matchCount };
  });

  // Sort by score descending — pick the single top match if it has any word overlap
  scored.sort((a: any, b: any) => b.score - a.score);
  const topScore = scored[0].score;

  if (topScore > 0) {
    // Use the single best-matching row (exact grams, no averaging)
    const best = scored[0].row;
    return { refrigerant: best[4] === 1 ? "R1234yf" : "R134a", grams: best[5] as number };
  }

  // No model word match — fall back to most common refrigerant for that make/year
  // Use median grams (not average) to avoid outlier skew
  const r1Count = makeYearMatches.filter((r: any[]) => r[4] === 1).length;
  const r0Count = makeYearMatches.filter((r: any[]) => r[4] === 0).length;
  const dominantRef = r1Count >= r0Count ? 1 : 0;
  const sameRef = makeYearMatches
    .filter((r: any[]) => r[4] === dominantRef)
    .sort((a: any[], b: any[]) => a[5] - b[5]);
  const medianRow = sameRef[Math.floor(sameRef.length / 2)];
  return { refrigerant: dominantRef === 1 ? "R1234yf" : "R134a", grams: medianRow[5] as number };
}

async function lookupDVLA(reg: string) {
  try {
    const clean = reg.replace(/\s/g, "").toUpperCase();
    // Call our Netlify proxy function - avoids CORS block from browser
    const res = await fetch("/api/dvla", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationNumber: clean }),
    });
    if (!res.ok) throw new Error("DVLA error");
    const data = await res.json();
    return {
      make: data.make || "",
      model: data.model || "",
      year: data.year || null,
      colour: data.colour || "",
    };
  } catch {
    return null;
  }
}

export default function App() {
  const [step, setStep] = useState(0);
  const [reg, setReg] = useState("");
  const [regError, setRegError] = useState("");
  const [loading, setLoading] = useState(false);
  const [vehicleData, setVehicleData] = useState<any[] | null>(null);
  const [carInfo, setCarInfo] = useState<CarInfo | null>(null);
  const [form, setForm] = useState<FormData>({ name: "", phone: "", email: "", postcode: "", date: "", time: "" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/vehicles.json")
      .then((r) => r.json())
      .then((d) => setVehicleData(d))
      .catch(() => setVehicleData([]));
  }, []);

  const handleRegLookup = async () => {
    const clean = reg.replace(/\s/g, "").toUpperCase();
    if (clean.length < 2) { setRegError("Please enter a valid UK registration plate."); return; }
    setRegError("");
    setLoading(true);
    const dvla = await lookupDVLA(clean);
    let make = "";
    let year: number | null = null;
    let model = "";
    if (dvla && dvla.year) {
      make = dvla.make;
      model = dvla.model;
      year = dvla.year;
    } else {
      year = decodeRegYear(clean);
    }
    if (!year) {
      setRegError("Couldn't recognise this registration. Please check and try again.");
      setLoading(false);
      return;
    }
    // Try exact spreadsheet lookup using make+model+year from DVLA
    let refrigerant = year >= 2017 ? "R1234yf" : "R134a";
    let grams = 600;
    if (vehicleData && vehicleData.length > 0 && make) {
      const match = lookupVehicle(vehicleData, make, model, year);
      if (match) {
        refrigerant = match.refrigerant;
        grams = match.grams;
      } else {
        // DVLA gave make but no spreadsheet match - use year fallback from spreadsheet
        const fb = YEAR_FALLBACK[year];
        if (fb) { refrigerant = fb[0] === 1 ? "R1234yf" : "R134a"; grams = fb[1]; }
      }
    } else {
      // No DVLA data at all - use year fallback from spreadsheet
      const fb = YEAR_FALLBACK[year];
      if (fb) { refrigerant = fb[0] === 1 ? "R1234yf" : "R134a"; grams = fb[1]; }
    }
    const price = calcPrice(refrigerant, grams);
    setCarInfo({ make: make || "Your Vehicle", model, year, refrigerant, grams, price, dvlaFound: !!dvla });
    setLoading(false);
    setStep(1);
  };

  const handleSubmit = async () => {
    if (!carInfo) return;
    setSubmitting(true);
    try {
      const fd = new URLSearchParams();
      fd.append("form-name", "smac-bookings");
      fd.append("name", form.name);
      fd.append("phone", form.phone);
      fd.append("email", form.email);
      fd.append("postcode", form.postcode);
      fd.append("date", form.date);
      fd.append("time", form.time);
      fd.append("registration", reg.toUpperCase());
      fd.append("make", carInfo.make);
      fd.append("model", carInfo.model);
      fd.append("year", String(carInfo.year));
      fd.append("refrigerant", carInfo.refrigerant);
      fd.append("grams", carInfo.grams + "g");
      fd.append("total_price", "£" + carInfo.price.total);
      await fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: fd.toString() });
      setDone(true);
      setStep(3);
    } catch {
      alert("Something went wrong. Please call Bruce on +44 7442 550123");
    }
    setSubmitting(false);
  };

  const isFormValid = form.name && form.phone && form.postcode && form.date && form.time;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", fontFamily: "'Barlow', sans-serif", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 16px 48px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:wght@400;600;700;900&display=swap');
        * { box-sizing: border-box; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .btn { cursor:pointer; border:none; transition:all 0.2s; }
        .btn:hover { transform:translateY(-2px); }
        input:focus { border-color:#3b82f6!important; outline:none; }
        .plate::placeholder { color:rgba(0,0,0,0.3); }
      `}</style>

      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 24, animation: "fadeUp 0.4s ease" }}>
        <div style={{ width: 68, height: 68, borderRadius: "50%", background: "#1a1a1a", border: "2px solid #2a2a2a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
          <div style={{ color: "#fff", fontFamily: "'Bebas Neue',sans-serif", fontSize: 19, letterSpacing: 3, lineHeight: 1 }}>SMAC</div>
          <div style={{ display: "flex", gap: 1, marginTop: 3 }}>
            {[0,1,2,3,4].map(i => <div key={i} style={{ width: 6, height: 3, background: i < 3 ? "#3b82f6" : "#ef4444", borderRadius: 1 }} />)}
          </div>
        </div>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 3 }}>Stockport Mobile Aircon</div>
        <div style={{ color: "#6b7280", fontSize: 13, marginTop: 3 }}>Car AC Regas · We Come To You</div>
      </div>

      {/* Progress */}
      <div style={{ display: "flex", gap: 6, width: "100%", maxWidth: 420, marginBottom: 24 }}>
        {["Reg Plate","Your Price","Book","Done"].map((label, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ height: 4, width: "100%", borderRadius: 99, background: i < step ? "#22c55e" : i === step ? "#3b82f6" : "#1f1f1f", transition: "background 0.3s" }} />
            <div style={{ color: i <= step ? "#9ca3af" : "#2d2d2d", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Card */}
      <div style={{ width: "100%", maxWidth: 420, background: "#111", border: "1px solid #1f1f1f", borderRadius: 20, padding: "26px 22px", animation: "fadeUp 0.4s ease" }}>

        {/* STEP 0 */}
        {step === 0 && (
          <div>
            <div style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>Step 1</div>
            <h2 style={{ margin: "0 0 6px", fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, letterSpacing: 2 }}>Enter Your Reg Plate</h2>
            <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 22px", lineHeight: 1.6 }}>We'll instantly find your car and show you the exact gas type and price.</p>
            <div style={{ background: "#f5cb00", borderRadius: 10, padding: "6px 14px 6px 6px", display: "flex", alignItems: "center", gap: 10, border: "3px solid #1a1a1a", marginBottom: 10 }}>
              <div style={{ background: "#003087", borderRadius: 6, padding: "4px 5px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{ color: "#f5cb00", fontSize: 8, fontWeight: 900 }}>GB</div>
                <div style={{ color: "#f5cb00", fontSize: 9 }}>★</div>
              </div>
              <input className="plate" value={reg} onChange={e => { setReg(e.target.value.toUpperCase()); setRegError(""); }} onKeyDown={e => e.key === "Enter" && handleRegLookup()} placeholder="AB17 CDE" maxLength={8} style={{ background: "transparent", border: "none", color: "#1a1a1a", fontSize: 30, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 6, flex: 1, width: "100%" }} />
            </div>
            {regError && <div style={{ color: "#ef4444", fontSize: 13, padding: "8px 12px", background: "rgba(239,68,68,0.08)", borderRadius: 8, marginBottom: 12 }}>{regError}</div>}
            <div style={{ color: "#374151", fontSize: 12, marginBottom: 20, lineHeight: 1.6 }}>💡 Don't know your reg? Check your V5C logbook or dashboard sticker.</div>
            <button className="btn" onClick={handleRegLookup} disabled={loading} style={{ width: "100%", padding: "16px", background: loading ? "#1f1f1f" : "linear-gradient(135deg,#2563eb,#3b82f6)", borderRadius: 12, color: loading ? "#4b5563" : "#fff", fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 3, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              {loading ? <><div style={{ width: 18, height: 18, border: "2px solid #4b5563", borderTopColor: "#9ca3af", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />Looking up your car...</> : "Check My Car →"}
            </button>
          </div>
        )}

        {/* STEP 1 */}
        {step === 1 && carInfo && (
          <div>
            <div style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>Step 2 — Your Quote</div>
            <h2 style={{ margin: "0 0 14px", fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, letterSpacing: 2 }}>Your Car Needs</h2>
            <div style={{ display: "inline-block", background: "#f5cb00", color: "#1a1a1a", fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 4, padding: "3px 14px", borderRadius: 6, marginBottom: 14 }}>{reg.toUpperCase()}</div>
            {carInfo.make !== "Your Vehicle" && (
              <div style={{ color: "#9ca3af", fontSize: 14, marginBottom: 14 }}>
                {carInfo.make} {carInfo.model} · {carInfo.year}
                {carInfo.dvlaFound && <span style={{ color: "#22c55e", fontSize: 11, marginLeft: 6 }}>✓ DVLA Verified</span>}
              </div>
            )}
            <div style={{ background: carInfo.refrigerant === "R1234yf" ? "linear-gradient(135deg,#1a1a2e,#16213e)" : "linear-gradient(135deg,#1a1a1a,#2d1800)", border: `2px solid ${carInfo.refrigerant === "R1234yf" ? "#3b82f6" : "#f59e0b"}`, borderRadius: 14, padding: "20px", marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <div style={{ color: "#9ca3af", fontSize: 11, textTransform: "uppercase", letterSpacing: 2 }}>Gas Type</div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, letterSpacing: 3, color: carInfo.refrigerant === "R1234yf" ? "#60a5fa" : "#f59e0b" }}>{carInfo.refrigerant}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: "#9ca3af", fontSize: 11, textTransform: "uppercase", letterSpacing: 2 }}>Quantity</div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, letterSpacing: 2, color: "#fff" }}>{carInfo.grams}g</div>
                </div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ color: "#6b7280", fontSize: 11 }}>Base price (up to 600g){carInfo.grams > 600 ? ` + ${carInfo.grams - 600}g extra (per 100g)` : ""}</div>
                    {carInfo.price.extra > 0 && <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 2 }}>Base £{carInfo.price.base} + extra £{carInfo.price.extra}</div>}
                  </div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 34, color: carInfo.refrigerant === "R1234yf" ? "#60a5fa" : "#f59e0b" }}>£{carInfo.price.total}</div>
                </div>
              </div>
            </div>
            <div style={{ background: "#0a0a0a", border: "1px solid #1f1f1f", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
              {["Full regas + leak check included","Mobile — we come to your location","Stockport & surrounding areas","Same-week appointments available"].map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 8, color: "#d1d5db", fontSize: 13, padding: "3px 0" }}><span style={{ color: "#22c55e" }}>✓</span> {t}</div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" onClick={() => setStep(0)} style={{ flex: 1, padding: "14px", background: "transparent", border: "1px solid #333", borderRadius: 12, color: "#9ca3af", fontSize: 14, fontWeight: 600 }}>← Back</button>
              <button className="btn" onClick={() => setStep(2)} style={{ flex: 2, padding: "14px", background: "linear-gradient(135deg,#16a34a,#22c55e)", borderRadius: 12, color: "#fff", fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 3 }}>Book Now →</button>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div>
            <div style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>Step 3 — Your Details</div>
            <h2 style={{ margin: "0 0 6px", fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, letterSpacing: 2 }}>Book Your Slot</h2>
            <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 18px" }}>We come to you. No garage needed.</p>
            {([["Full Name *","name","text","John Smith"],["Phone Number *","phone","tel","+44 7700 000000"],["Email (optional)","email","email","john@email.com"],["Postcode *","postcode","text","SK1 1AA"]] as [string,keyof FormData,string,string][]).map(([label, name, type, placeholder]) => (
              <div key={name} style={{ marginBottom: 12 }}>
                <label style={{ display: "block", color: "#9ca3af", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>{label}</label>
                <input name={name} type={type} placeholder={placeholder} value={form[name]} onChange={e => setForm({ ...form, [name]: e.target.value })} style={{ width: "100%", padding: "12px 14px", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 10, color: "#fff", fontSize: 15, transition: "border-color 0.2s" }} />
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              {([["Preferred Date *","date","date"],["Preferred Time *","time","time"]] as [string,keyof FormData,string][]).map(([label, name, type]) => (
                <div key={name} style={{ flex: 1 }}>
                  <label style={{ display: "block", color: "#9ca3af", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>{label}</label>
                  <input name={name} type={type} value={form[name]} onChange={e => setForm({ ...form, [name]: e.target.value })} style={{ width: "100%", padding: "12px 10px", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 10, color: "#fff", fontSize: 14 }} />
                </div>
              ))}
            </div>
            {carInfo && (
              <div style={{ background: "#0a0a0a", border: "1px solid #1f1f1f", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
                <div style={{ color: "#6b7280", fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Booking Summary</div>
                {[["Reg", reg.toUpperCase()],["Service", carInfo.refrigerant + " Regas"],["Quantity", carInfo.grams + "g"],["Price", "£" + carInfo.price.total]].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                    <span style={{ color: "#6b7280" }}>{k}</span>
                    <span style={{ color: "#e5e7eb", fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" onClick={() => setStep(1)} style={{ flex: 1, padding: "14px", background: "transparent", border: "1px solid #333", borderRadius: 12, color: "#9ca3af", fontSize: 14, fontWeight: 600 }}>← Back</button>
              <button className="btn" onClick={handleSubmit} disabled={!isFormValid || submitting} style={{ flex: 2, padding: "14px", background: isFormValid ? "linear-gradient(135deg,#2563eb,#3b82f6)" : "#1f1f1f", borderRadius: 12, color: isFormValid ? "#fff" : "#4b5563", fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 3, cursor: isFormValid ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {submitting ? <><div style={{ width: 16, height: 16, border: "2px solid #4b5563", borderTopColor: "#9ca3af", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />Booking...</> : "Confirm Booking →"}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && done && (
          <div style={{ textAlign: "center", animation: "fadeUp 0.4s ease" }}>
            <div style={{ width: 68, height: 68, borderRadius: "50%", background: "linear-gradient(135deg,#16a34a,#22c55e)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, margin: "0 auto 16px" }}>✓</div>
            <h2 style={{ margin: "0 0 8px", fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, letterSpacing: 2 }}>Booking Received!</h2>
            <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 22, lineHeight: 1.7 }}>Bruce will confirm your slot shortly. He'll come to your location — no need to visit a garage.</p>
            {carInfo && (
              <div style={{ background: "#0a0a0a", border: "1px solid #1f1f1f", borderRadius: 12, padding: "14px 16px", marginBottom: 20, textAlign: "left" }}>
                {[["Name",form.name],["Phone",form.phone],["Postcode",form.postcode],["Date",form.date],["Time",form.time],["Reg",reg.toUpperCase()],["Service",carInfo.refrigerant+" Regas"],["Grams",carInfo.grams+"g"],["Total","£"+carInfo.price.total]].filter(([,v])=>v).map(([k,v])=>(
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1a1a1a", fontSize: 13 }}>
                    <span style={{ color: "#6b7280" }}>{k}</span>
                    <span style={{ color: "#e5e7eb", fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <a href="tel:+447442550123" style={{ flex: 1, padding: "14px", background: "linear-gradient(135deg,#2563eb,#3b82f6)", borderRadius: 12, color: "#fff", textDecoration: "none", fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>📞 Call Bruce</a>
              <button className="btn" onClick={() => { setStep(0); setReg(""); setForm({ name:"",phone:"",email:"",postcode:"",date:"",time:"" }); setCarInfo(null); setDone(false); }} style={{ flex: 1, padding: "14px", background: "transparent", border: "1px solid #333", borderRadius: 12, color: "#9ca3af", fontSize: 13, fontWeight: 600 }}>New Booking</button>
            </div>
          </div>
        )}
      </div>

      {/* Hidden Netlify form */}
      <form name="smac-bookings" data-netlify="true" hidden>
        <input type="text" name="name" />
        <input type="text" name="phone" />
        <input type="text" name="email" />
        <input type="text" name="postcode" />
        <input type="text" name="date" />
        <input type="text" name="time" />
        <input type="text" name="registration" />
        <input type="text" name="make" />
        <input type="text" name="model" />
        <input type="text" name="year" />
        <input type="text" name="refrigerant" />
        <input type="text" name="grams" />
        <input type="text" name="total_price" />
      </form>

      <div style={{ marginTop: 22, color: "#2d2d2d", fontSize: 11, textAlign: "center", lineHeight: 1.9 }}>
        <div>bruce@stockportmobileaircon.co.uk</div>
        <div>+44 7442 550123 · Stockport & surrounding areas</div>
      </div>
    </div>
  );
}