const express = require("express");
const Groq = require("groq-sdk");

const router = express.Router();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `
You are a document-forensics vision AI performing a STRICT pixel-level audit.

Your job is ONLY to inspect the supplied document image and report visible
forensic evidence. DO NOT calculate a trust score. DO NOT return a verdict.
DO NOT start from 95. Assume the document MAY be edited and look for proof.

Inspect every field for: erased text, painted-over/whited-out areas, retyped
text, changed numbers, font mismatch, character thickness mismatch, spacing
mismatch, different text sharpness, texture breaks, rectangular editing
patches, broken table borders, copied/pasted blocks, pasted seal/signature,
and hand- or digitally-drawn ink with hard edges inconsistent with the rest
of the document.

Pay special attention to: student name, roll/seat number, PRN/enrollment
number, date, marks, total, CGPA, seal, signature, photo, QR/barcode.

A genuine template can still contain one altered field — do not let an
otherwise-authentic layout make you ignore a suspicious field. Normal
scanning, JPEG compression, blur and lighting are NOT automatic evidence —
but a LOCALIZED difference within an otherwise consistent document IS.

Return ONLY this JSON, each finding naming the exact region and describing
exactly what looks wrong there (be specific, not generic):

{
  "imageQuality": "GOOD",
  "findings": [
    { "region": "Exact field/region", "severity": "MINOR", "observation": "Specific visible observation", "confidence": 0.85 }
  ],
  "toolSignaturesDetected": []
}

Severity is exactly one of: MINOR, MODERATE, MAJOR.
If nothing suspicious: { "imageQuality": "GOOD", "findings": [], "toolSignaturesDetected": [] }
`;

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Maps a pixel coordinate to a human-readable field region, based on
// the same layout proportions used to crop forensic regions on the frontend.
function mapRegionName(x, y, width, height) {
  const px = width ? x / width : 0;
  const py = height ? y / height : 0;

  if (py < 0.20) return "Header / University Logo area";
  if (py < 0.32) return "Student Information block (name, roll no., PRN)";
  if (py < 0.70) return "Marks / Grades table";
  if (px > 0.55 && py > 0.72) return "Signature & Seal area";
  if (py >= 0.70) return "Bottom section (date, statement, footer)";
  return "Document body";
}

function normalizeResult(result) {
  const findings = Array.isArray(result?.findings) ? result.findings : [];

  const cleanFindings = findings
    .filter(f => f && typeof f.observation === "string")
    .map(f => ({
      region: typeof f.region === "string" ? f.region.trim() : "Unknown region",
      severity: ["MINOR", "MODERATE", "MAJOR"].includes(String(f.severity || "").toUpperCase())
        ? String(f.severity).toUpperCase() : "MINOR",
      observation: f.observation.trim(),
      confidence: Number.isFinite(Number(f.confidence)) ? Math.max(0, Math.min(1, Number(f.confidence))) : 0.5
    }));

  let score = 95;
  const majorCount = cleanFindings.filter(f => f.severity === "MAJOR").length;
  const moderateCount = cleanFindings.filter(f => f.severity === "MODERATE").length;
  const minorCount = cleanFindings.filter(f => f.severity === "MINOR").length;

  score -= majorCount * 45;
  score -= moderateCount * 28;
  score -= minorCount * 12;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const reasons = cleanFindings.map(f => `${f.region}: ${f.observation}`);
  const tamperedIndicators = cleanFindings
    .filter(f => f.severity === "MODERATE" || f.severity === "MAJOR")
    .map(f => `${f.region} — ${f.observation}`);

  return {
    trustScore: score,
    imageQuality: typeof result?.imageQuality === "string" ? result.imageQuality : "GOOD",
    reasons,
    tamperedIndicators,
    toolSignaturesDetected: Array.isArray(result?.toolSignaturesDetected) ? result.toolSignaturesDetected : [],
    evidenceStrength: cleanFindings.length === 0 ? "LOW" : majorCount > 0 ? "HIGH" : "MEDIUM",
    findings: cleanFindings,
    // per-category breakdown, used by the report UI
    categories: {
      aiVision: { checked: true, issuesFound: cleanFindings.length, pass: cleanFindings.length === 0 }
    }
  };
}

function recalcVerdict(result) {
  if (result.trustScore >= 80) result.verdict = "REAL";
  else if (result.trustScore >= 45) result.verdict = "SUSPICIOUS";
  else result.verdict = "FAKE";
}

router.post("/api/verify-document-ai", async (req, res) => {
  console.log("🔥 DOCUMENT FORENSICS REQUEST RECEIVED");

  try {
    const { image, docName, ocrText, elaSummary, metadataFlags, inkOverlay, imgWidth, imgHeight } = req.body;

    if (!image) return res.status(400).json({ error: "Image missing" });
    if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: "GROQ_API_KEY is not configured." });

    let imageUrl = image;
    if (!image.startsWith("data:image/")) imageUrl = `data:image/jpeg;base64,${image}`;

    const ocr = String(ocrText || "").slice(0, 1200);
    const metadata = Array.isArray(metadataFlags) ? metadataFlags.slice(0, 10) : [];
    const inkFlags = Array.isArray(inkOverlay) ? inkOverlay.slice(0, 6) : [];
    const width = safeNumber(imgWidth) || 1000;
    const height = safeNumber(imgHeight) || 1400;

    const namedElaAnomalies = (elaSummary?.localizedAnomalies || []).map(a => ({
      ...a,
      region: mapRegionName(a.x, a.y, width, height)
    }));

    const namedInkFlags = inkFlags.map(f => ({
      ...f,
      region: mapRegionName(f.x, f.y, width, height)
    }));

    const analysisPrompt = `
DOCUMENT: ${docName || "Unknown"}

OCR:
${ocr}

ELA (region-tagged, sorted by strength):
${JSON.stringify(namedElaAnomalies, null, 2)}

DIGITAL INK OVERLAY DETECTOR (region-tagged — hard, non-anti-aliased edges vs the document's normal soft scan/print transitions):
${namedInkFlags.length ? JSON.stringify(namedInkFlags, null, 2) : "None detected"}

METADATA FLAGS:
${metadata.length ? metadata.join("\n") : "None"}

If ELA or the ink overlay detector flagged a named region above, look closely
at exactly that region and confirm or explain what you actually see there —
name the same region in your findings if you agree, and explain in your own
words what specifically looks altered (do not just repeat the raw numbers).
If you disagree because the region genuinely looks like normal printed
content (e.g. a seal, a table border, a barcode), say so by NOT including it
in your findings.

Return ONLY JSON.
`;

    let completion;
    try {
      completion = await groq.chat.completions.create({
        model: "qwen/qwen3.6-27b",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: [
            { type: "image_url", image_url: { url: imageUrl } },
            { type: "text", text: analysisPrompt }
          ] }
        ],
        max_tokens: 700,
        temperature: 0.1,
        reasoning_effort: "none",
        // NEW: force valid JSON output instead of relying only on the prompt.
        // Without this the model can occasionally wrap the JSON in prose or
        // markdown fences, which used to fall through to the "unreadable
        // result" fallback below far more often than it should.
        response_format: { type: "json_object" }
      });
    } catch (groqErr) {
      // NEW: Groq/API-level failures (bad key, rate limit, model unavailable,
      // network) were previously indistinguishable from a parsing failure.
      // Surface the real cause so the frontend error box shows something
      // actionable instead of a generic 500.
      console.error("❌ GROQ API CALL FAILED:", groqErr?.message || groqErr);
      return res.status(502).json({
        error: `Groq API call failed: ${groqErr?.message || "unknown error"}`
      });
    }

    let raw = completion?.choices?.[0]?.message?.content || "";
    console.log("🤖 AI RAW RESPONSE:", raw.slice(0, 800));

    let parsed = null;
    try { parsed = JSON.parse(raw); }
    catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) { try { parsed = JSON.parse(match[0]); } catch { parsed = null; } }
    }

    if (!parsed) {
      return res.json({
        verdict: "SUSPICIOUS", trustScore: 50, imageQuality: "UNKNOWN",
        reasons: ["The AI returned an unreadable forensic result. Please rescan the document."],
        tamperedIndicators: [], toolSignaturesDetected: [], evidenceStrength: "LOW",
        categories: {}
      });
    }

    const result = normalizeResult(parsed);

    // =========================================================
    // Count independent signals. A single weak signal = review,
    // not condemnation. Multiple independent signals agreeing on
    // the SAME region = strong evidence.
    // =========================================================
    const strongestElaAnomaly = namedElaAnomalies.length > 0 ? namedElaAnomalies[0] : null;
    const elaStrong = strongestElaAnomaly && Number(strongestElaAnomaly.anomalyScore) >= 30;
    const elaModerate = strongestElaAnomaly && Number(strongestElaAnomaly.anomalyScore) >= 15 && !elaStrong;
    const inkFound = namedInkFlags.length > 0;
    const aiFoundSomething = result.findings.length > 0;

    let signalCount = 0;
    if (elaStrong) signalCount++;
    if (inkFound) signalCount++;
    if (aiFoundSomething) signalCount++;

    result.categories.ela = {
      checked: true,
      pass: !elaStrong && !elaModerate,
      strongestRegion: strongestElaAnomaly?.region || null,
      anomalyScore: strongestElaAnomaly?.anomalyScore ?? 0
    };
    result.categories.inkOverlay = {
      checked: true,
      pass: !inkFound,
      regionsFlagged: namedInkFlags.map(f => f.region),
      count: namedInkFlags.length
    };

    if (elaStrong) {
      result.trustScore = Math.min(result.trustScore, signalCount >= 2 ? 35 : 55);
      result.reasons.unshift(
        `${strongestElaAnomaly.region}: compression/error-level analysis shows this region has significantly more editing artifacts (error score ${strongestElaAnomaly.meanError}) than the rest of the document, consistent with local erasing, retyping, or pasting.`
      );
      result.tamperedIndicators.unshift(`${strongestElaAnomaly.region}: localized ELA anomaly (score ${strongestElaAnomaly.anomalyScore}).`);
    } else if (elaModerate) {
      result.trustScore = Math.min(result.trustScore, 68);
      result.reasons.unshift(
        `${strongestElaAnomaly.region}: a mild compression-level irregularity was found here — not conclusive on its own, but worth a manual look.`
      );
    }

    if (inkFound) {
      const top = namedInkFlags[0];
      result.trustScore = Math.min(result.trustScore, signalCount >= 2 ? 30 : 60);
      result.reasons.unshift(
        `${top.region}: found ink/marks with hard, non-anti-aliased edges (hardness ${top.hardnessScore}) — scanned or printed content on this document normally has soft blended edges, so a sharp digitally-drawn stroke here stands out.`
      );
      result.tamperedIndicators.unshift(`${top.region}: digital ink overlay signature (${namedInkFlags.length} spot${namedInkFlags.length > 1 ? "s" : ""}).`);
    }

    recalcVerdict(result);

    const quality = result.imageQuality.toUpperCase();
    if (quality.includes("POOR") || quality.includes("BLUR") || quality.includes("UNREADABLE") || quality.includes("INSUFFICIENT")) {
      result.trustScore = Math.min(result.trustScore, 60);
      result.verdict = "SUSPICIOUS";
    }

    if (result.reasons.length === 0) {
      result.reasons.push("No visual, compression-level, or ink-consistency anomalies were found in this document.");
    }

    console.log(`✅ FORENSIC RESULT: ${result.verdict} (${result.trustScore}/100) — signals: ${signalCount}`);
    return res.json(result);

  } catch (err) {
    console.error("❌ DOCUMENT FORENSICS ERROR:", err);
    return res.status(500).json({ error: err?.message || "Document forensic analysis failed." });
  }
});

module.exports = router;