import { useState, useEffect } from "react";

const YEAR_FALLBACK: Record<number, [number, number]> = {
  1990: [0, 790], 1991: [0, 700], 1992: [0, 800], 1993: [0, 800], 1994: [0, 800], 1995: [0, 750], 1996: [0, 750], 1997: [0, 750], 1998: [0, 750], 1999: [0, 750], 2000: [0, 750], 2001: [0, 750], 2002: [0, 650], 2003: [0, 650], 2004: [0, 550], 2005: [0, 550], 2006: [0, 550], 2007: [0, 550], 2008: [0, 550], 2009: [0, 500], 2010: [0, 500], 2011: [0, 500], 2012: [0, 500], 2013: [0, 500], 2014: [0, 500], 2015: [0, 500], 2016: [0, 500], 
  2017: [1, 500], 2018: [1, 500], 2019: [1, 500], 2020: [1, 500], 2021: [1, 500], 2022: [1, 500], 2023: [1, 500], 2024: [1, 500], 2025: [1, 500]
};

interface CarInfo {
  make: string; model: string; year: number; refrigerant: string; grams: number;
  price: { base: number; extra: number; total: number }; dvlaFound: boolean;
}

interface FormData {
  name: string; phone: string; email: string; postcode: string; date: string; time: string;
}

function calcPrice(refrigerant: string, grams: number) {
  const base = refrigerant === "R1234yf" ? 120 : 80;
  const extraPerBracket = refrigerant === "R1234yf" ? 20 : 10;
  let extra = 0;
  if (grams > 600) {
    const over = grams - 600;
    const remainder = over % 100;
    const brackets = remainder > 50 ? Math.ceil(over / 100) : Math.floor(over / 100);
    extra = brackets * extraPerBracket;
  }
  return { base, extra, total: base + extra };
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

function isPrivatePlate(reg: string): boolean {
  const clean = reg.replace(/\s/g, "").toUpperCase();
  if (/^[A-Z]{2}\d{2}[A-Z]{3}$/.test(clean)) return false;
  if (/^[A-Z]\d{1,3}[A-Z]{1,3}$/.test(clean)) return false;
  if (/^[A-Z]{1,3}\d{1,3}[A-Z]$/.test(clean)) return false;
  return true;
}

function normalizeModelName(make: string, modelStr: string): string {
  let normalized = modelStr;
  if (make === "MERCEDES-BENZ") {
    if (/^[ACEGMS]\s?\d{3}/.test(normalized)) {
      const letter = normalized.charAt(0);
      normalized += ` ${letter}-CLASS`;
    }
  }
  if (make === "BMW") {
    const match = normalized.match(/^([1-8])\d{2}/);
    if (match) normalized += ` ${match[1]} SERIES`;
  }
  const aliases: Record<string, string> = {
    "SHOGUN": "PAJERO", "DISPATCH": "JUMPY", "RELAY": "JUMPER",
    "TRANSPORTER T28": "TRANSPORTER", "TRANSPORTER T30": "TRANSPORTER",
    "TRANSPORTER T32": "TRANSPORTER", "VITO": "V-CLASS"
  };
  for (const [dvlaName, nrfName] of Object.entries(aliases)) {
    if (normalized.includes(dvlaName)) normalized += ` ${nrfName}`;
  }
  return normalized;
}

function lookupVehicle(vehicleData: any[], make: string, rawModel: string, year: number, engineCC: number | null, fuelType: string) {
  if (!vehicleData || !make || !year) return null;

  const makeUpper = make.toUpperCase().trim();
  const fuelUpper = (fuelType || "").toUpperCase().trim();
  const modelUpper = normalizeModelName(makeUpper, (rawModel || "").toUpperCase().trim());
  const dvlaString = `${modelUpper} ${fuelUpper}`;

  const makeYearMatches = vehicleData.filter((row: any[]) => row[0] === makeUpper && year >= row[2] && year <= row[3]);
  if (makeYearMatches.length === 0) return null;
  if (makeYearMatches.length === 1) return { refrigerant: makeYearMatches[0][4] === 1 ? "R1234yf" : "R134a", grams: makeYearMatches[0][5] as number };

  const dvlaWords = modelUpper ? modelUpper.split(/[\s\-\/]+/).filter((w: string) => w.length >= 1) : [];
  const baseModel = dvlaWords[0] || "";

  let engineLiters = "";
  if (engineCC) engineLiters = (Math.round(engineCC / 100) / 10).toFixed(1); 
  if (fuelUpper === "DIESEL") dvlaWords.push("D", "DIESEL", "TDI", "CDTI", "CRDI", "DCI", "JTD");

  const criticalModifiers = ["SPORT", "CABRIO", "COUP", "ESTATE", "ALLROAD", "TOURER", "HYBRID", "ELECTRIC", "PHEV", "E-GOLF", "E-UP", "E-TRON", "Z.E."];

  const scored = makeYearMatches.map((row: any[]) => {
    const sheetModel: string = (row[1] || "").toUpperCase();
    let score = 0;

    for (const word of dvlaWords) {
      if (sheetModel.includes(word)) score += word.length * 10; 
    }
    if (engineLiters && sheetModel.includes(engineLiters)) score += 150; 
    if (baseModel && new RegExp(`\\b${baseModel}\\b`).test(sheetModel)) score += 100;

    for (const mod of criticalModifiers) {
        const dvlaHasMod = dvlaString.includes(mod);
        const sheetHasMod = sheetModel.includes(mod);
        if (sheetHasMod && !dvlaHasMod) score -= 1000;
        if (!sheetHasMod && dvlaHasMod) score -= 1000;
    }

    const isDvlaEV = dvlaString.includes("HYBRID") || dvlaString.includes("ELECTRIC") || dvlaString.includes("PHEV");
    const isSheetEV = sheetModel.includes("HYBRID") || sheetModel.includes("ELECTRIC") || sheetModel.includes("PHEV") || sheetModel.includes("E-GOLF") || sheetModel.includes("E-UP");
    if (isSheetEV && !isDvlaEV) score -= 1000;
    if (!isSheetEV && isDvlaEV) score -= 1000;

    return { row, score, yearSpan: row[3] - row[2] };
  });

  scored.sort((a: any, b: any) => b.score - a.score);
  const topScore = scored[0].score;
  const expectedRef = year >= 2017 ? 1 : 0;

  if (topScore > -500) {
    const topMatches = scored.filter((s: any) => s.score === topScore);
    if (topMatches.length === 1) return { refrigerant: topMatches[0].row[4] === 1 ? "R1234yf" : "R134a", grams: topMatches[0].row[5] as number };
    const refMatches = topMatches.filter((s: any) => s.row[4] === expectedRef);
    const pool = refMatches.length > 0 ? refMatches : topMatches;
    pool.sort((a: any, b: any) => a.yearSpan - b.yearSpan);
    return { refrigerant: pool[0].row[4] === 1 ? "R1234yf" : "R134a", grams: pool[0].row[5] as number };
  }

  const refRows = makeYearMatches.filter((r: any[]) => r[4] === expectedRef);
  const pool = refRows.length > 0 ? refRows : makeYearMatches;
  const sorted = [...pool].sort((a: any[], b: any[]) => a[5] - b[5]);
  return { refrigerant: sorted[Math.floor(sorted.length / 2)][4] === 1 ? "R1234yf" : "R134a", grams: sorted[Math.floor(sorted.length / 2)][5] as number };
}

async function lookupDVLA(reg: string) {
  try {
    const clean = reg.replace(/\s/g, "").toUpperCase();
    const res = await fetch("/api/dvla", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ registrationNumber: clean }),
    });
    if (!res.ok) throw new Error("DVLA error");
    const data = await res.json();
    return {
      make: (data.make || "").toUpperCase().trim(),
      model: (data.model || "").toUpperCase().trim(),
      year: data.year ? parseInt(String(data.year), 10) : null,
      engineCC: data.engineCC ? parseInt(String(data.engineCC), 10) : null,
      fuelType: (data.fuelType || "").toUpperCase().trim(),
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
  const [_isPrivate, setIsPrivate] = useState(false);
  const [showManualOverride, setShowManualOverride] = useState(false);
  const [manualMake, setManualMake] = useState("");
  const [manualModel, setManualModel] = useState("");

  useEffect(() => {
    fetch("/vehicles.json")
      .then(async (r) => {
        const text = await r.text();
        if (text.trim().startsWith("<")) return [];
        try { return JSON.parse(text); } catch (e) { return []; }
      })
      .then((d) => setVehicleData(d))
      .catch(() => setVehicleData([]));
  }, []);

  const handleRegLookup = async () => {
    const clean = reg.replace(/\s/g, "").toUpperCase();
    if (clean.length < 2) { setRegError("Please enter a valid UK registration plate."); return; }
    setRegError(""); setLoading(true);
    
    const dvla = await lookupDVLA(clean);
    let make = "", year: number | null = null, model = "", engineCC: number | null = null, fuelType = "";
    
    if (dvla && dvla.year) {
      make = dvla.make; model = dvla.model; year = dvla.year; engineCC = dvla.engineCC; fuelType = dvla.fuelType;
    } else {
      year = decodeRegYear(clean);
    }
    
    if (!year) {
      setRegError("Couldn't recognise this registration. Please check and try again.");
      setLoading(false); return;
    }

    let refrigerant = year >= 2017 ? "R1234yf" : "R134a", grams = 600;
    
    if (vehicleData && vehicleData.length > 0 && make) {
      const match = lookupVehicle(vehicleData, make, model, year, engineCC, fuelType);
      if (match) { refrigerant = match.refrigerant; grams = match.grams; }
      else {
        const fb = YEAR_FALLBACK[year];
        if (fb) { refrigerant = fb[0] === 1 ? "R1234yf" : "R134a"; grams = fb[1]; }
      }
    } else {
      const fb = YEAR_FALLBACK[year];
      if (fb) { refrigerant = fb[0] === 1 ? "R1234yf" : "R134a"; grams = fb[1]; }
    }
    
    const price = calcPrice(refrigerant, grams);
    setIsPrivate(isPrivatePlate(clean));
    setCarInfo({ make: make || "Your Vehicle", model, year, refrigerant, grams, price, dvlaFound: !!dvla });
    setLoading(false); setStep(1);
  };

  const handleSubmit = async () => {
    if (!carInfo) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      
      // YOUR WEB3FORMS KEY IS EMBEDDED HERE
      fd.append("access_key", "207585dd-6dba-4de7-9b63-4a80fdeffa0f"); 
      
      fd.append("subject", "New AC Regas Booking - " + reg.toUpperCase());
      fd.append("from_name", "SMAC Booking System");
      fd.append("Name", form.name); fd.append("Phone", form.phone); fd.append("Email", form.email);
      fd.append("Postcode", form.postcode); fd.append("Date", form.date); fd.append("Time", form.time);
      fd.append("Registration", reg.toUpperCase()); fd.append("Make", carInfo.make); fd.append("Model", carInfo.model);
      fd.append("Year", String(carInfo.year)); fd.append("Refrigerant", carInfo.refrigerant);
      fd.append("Grams", carInfo.grams + "g"); fd.append("Total Price", "£" + carInfo.price.total);
      
      const res = await fetch("https://api.web3forms.com/submit", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Email failed");
      
      setDone(true); setStep(3);
    } catch {
      alert("Something went wrong sending the email. Please try again.");
    }
    setSubmitting(false);
  };

  const handleManualLookup = () => {
    if (!manualMake.trim() || !carInfo) return;
    const make = manualMake.trim().toUpperCase(), model = manualModel.trim().toUpperCase(), year = carInfo.year;
    let refrigerant = year >= 2017 ? "R1234yf" : "R134a", grams = 600;
    if (vehicleData && vehicleData.length > 0) {
      const match = lookupVehicle(vehicleData, make, model, year, null, ""); 
      if (match) { refrigerant = match.refrigerant; grams = match.grams; }
      else {
        const fb = YEAR_FALLBACK[year];
        if (fb) { refrigerant = fb[0] === 1 ? "R1234yf" : "R134a"; grams = fb[1]; }
      }
    }
    const price = calcPrice(refrigerant, grams);
    setCarInfo({ ...carInfo, make, model, refrigerant, grams, price });
    setShowManualOverride(false);
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

      <div style={{ textAlign: "center", marginBottom: 24, animation: "fadeUp 0.4s ease" }}>
        <div style={{ width: 68, height: 68, borderRadius: "50%", background: "#1a1a1a", border: "2px solid #2a2a2a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
          <div style={{ color: "#fff", fontFamily: "'Bebas Neue',sans-serif", fontSize: 19, letterSpacing: 3, lineHeight: 1 }}>SMAC</div>
          <div style={{ display: "flex", gap: 1, marginTop: 3 }}>{[0,1,2,3,4].map(i => <div key={i} style={{ width: 6, height: 3, background: i < 3 ? "#3b82f6" : "#ef4444", borderRadius: 1 }} />)}</div>
        </div>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 3 }}>Stockport Mobile Aircon</div>
        <div style={{ color: "#6b7280", fontSize: 13, marginTop: 3 }}>Car AC Regas · We Come To You</div>
      </div>

      <div style={{ width: "100%", maxWidth: 420, background: "#111", border: "1px solid #1f1f1f", borderRadius: 20, padding: "26px 22px", animation: "fadeUp 0.4s ease" }}>
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
            <button className="btn" onClick={handleRegLookup} disabled={loading} style={{ width: "100%", padding: "16px", background: loading ? "#1f1f1f" : "linear-gradient(135deg,#2563eb,#3b82f6)", borderRadius: 12, color: loading ? "#4b5563" : "#fff", fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 3, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              {loading ? <><div style={{ width: 18, height: 18, border: "2px solid #4b5563", borderTopColor: "#9ca3af", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />Looking up...</> : "Check My Car →"}
            </button>
          </div>
        )}

        {step === 1 && carInfo && (
          <div>
            <div style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>Step 2 — Your Quote</div>
            <h2 style={{ margin: "0 0 14px", fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, letterSpacing: 2 }}>Your Car Needs</h2>
            <div style={{ display: "inline-block", background: "#f5cb00", color: "#1a1a1a", fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 4, padding: "3px 14px", borderRadius: 6, marginBottom: 14 }}>{reg.toUpperCase()}</div>
            {carInfo.make !== "Your Vehicle" && (
              <div style={{ color: "#9ca3af", fontSize: 14, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                <span>{carInfo.make} {carInfo.model} · {carInfo.year} {carInfo.dvlaFound && <span style={{ color: "#22c55e", fontSize: 11, marginLeft: 6 }}>✓ Verified</span>}</span>
                <button className="btn" onClick={() => setShowManualOverride(v => !v)} style={{ fontSize: 11, color: "#f59e0b", background: "transparent", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>Wrong car?</button>
              </div>
            )}
            {showManualOverride && (
              <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input placeholder="Make (e.g. BMW)" value={manualMake} onChange={e => setManualMake(e.target.value)} style={{ flex: 1, padding: "8px 10px", background: "#0a0a0a", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 13 }} />
                  <input placeholder="Model" value={manualModel} onChange={e => setManualModel(e.target.value)} style={{ flex: 1, padding: "8px 10px", background: "#0a0a0a", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 13 }} />
                </div>
                <button className="btn" onClick={handleManualLookup} disabled={!manualMake.trim()} style={{ width: "100%", padding: "9px", background: manualMake.trim() ? "linear-gradient(135deg,#d97706,#f59e0b)" : "#1f1f1f", borderRadius: 8, color: manualMake.trim() ? "#000" : "#4b5563", fontWeight: 700, fontSize: 13 }}>Update my car →</button>
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
                    <div style={{ color: "#6b7280", fontSize: 11 }}>Base price (up to 600g){carInfo.grams > 600 ? ` + ${carInfo.grams - 600}g extra` : ""}</div>
                    {carInfo.price.extra > 0 && <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 2 }}>Base £{carInfo.price.base} + extra £{carInfo.price.extra}</div>}
                  </div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 34, color: carInfo.refrigerant === "R1234yf" ? "#60a5fa" : "#f59e0b" }}>£{carInfo.price.total}</div>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" onClick={() => setStep(0)} style={{ flex: 1, padding: "14px", background: "transparent", border: "1px solid #333", borderRadius: 12, color: "#9ca3af", fontSize: 14, fontWeight: 600 }}>← Back</button>
              <button className="btn" onClick={() => setStep(2)} style={{ flex: 2, padding: "14px", background: "linear-gradient(135deg,#16a34a,#22c55e)", borderRadius: 12, color: "#fff", fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 3 }}>Book Now →</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>Step 3 — Your Details</div>
            <h2 style={{ margin: "0 0 6px", fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, letterSpacing: 2 }}>Book Your Slot</h2>
            {([["Full Name *","name","text","John Smith"],["Phone Number *","phone","tel","+44 7700 000000"],["Email (optional)","email","email","john@email.com"],["Postcode *","postcode","text","SK1 1AA"]] as [string,keyof FormData,string,string][]).map(([label, name, type, placeholder]) => (
              <div key={name} style={{ marginBottom: 12 }}>
                <label style={{ display: "block", color: "#9ca3af", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>{label}</label>
                <input name={name} type={type} placeholder={placeholder} value={form[name]} onChange={e => setForm({ ...form, [name]: e.target.value })} style={{ width: "100%", padding: "12px 14px", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 10, color: "#fff", fontSize: 15 }} />
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
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" onClick={() => setStep(1)} style={{ flex: 1, padding: "14px", background: "transparent", border: "1px solid #333", borderRadius: 12, color: "#9ca3af", fontSize: 14, fontWeight: 600 }}>← Back</button>
              <button className="btn" onClick={handleSubmit} disabled={!isFormValid || submitting} style={{ flex: 2, padding: "14px", background: isFormValid ? "linear-gradient(135deg,#2563eb,#3b82f6)" : "#1f1f1f", borderRadius: 12, color: isFormValid ? "#fff" : "#4b5563", fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 3, cursor: isFormValid ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {submitting ? <><div style={{ width: 16, height: 16, border: "2px solid #4b5563", borderTopColor: "#9ca3af", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />Booking...</> : "Confirm Booking →"}
              </button>
            </div>
          </div>
        )}

        {step === 3 && done && (
          <div style={{ textAlign: "center", animation: "fadeUp 0.4s ease" }}>
            <div style={{ width: 68, height: 68, borderRadius: "50%", background: "linear-gradient(135deg,#16a34a,#22c55e)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, margin: "0 auto 16px" }}>✓</div>
            <h2 style={{ margin: "0 0 8px", fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, letterSpacing: 2 }}>Booking Received!</h2>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn" onClick={() => { setStep(0); setReg(""); setForm({ name:"",phone:"",email:"",postcode:"",date:"",time:"" }); setCarInfo(null); setDone(false); setIsPrivate(false); setShowManualOverride(false); setManualMake(""); setManualModel(""); }} style={{ flex: 1, padding: "14px", background: "transparent", border: "1px solid #333", borderRadius: 12, color: "#9ca3af", fontSize: 13, fontWeight: 600 }}>New Booking</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}