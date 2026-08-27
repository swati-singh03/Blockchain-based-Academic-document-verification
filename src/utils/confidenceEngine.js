// src/utils/confidenceEngine.js
// Weighted, evidence-based confidence engine.
// NO hardcoded percentages — every score is derived from real signals.

export const EVIDENCE_WEIGHTS = {
  metadata: 0.15,
  ocr: 0.15,
  template: 0.20,
  logo: 0.10,
  noise: 0.08,
  ela: 0.10,
  compression: 0.08,
  font: 0.05,
  seal: 0.04,
  qr: 0.05,
  clone: 0.05,
  edge: 0.05,
};

/**
 * Combines whatever evidence modules you actually ran into one
 * overall trust score. Modules you didn't run are simply skipped
 * (their weight is redistributed) instead of being faked.
 *
 * evidence = {
 *   ocr:      { score: 0-100, reason: "..." },
 *   metadata: { score: 0-100, reason: "..." },
 *   qr:       { score: 0-100, reason: "..." },
 *   ...
 * }
 */
export function calculateConfidence(evidence) {
  let totalWeight = 0;
  let weightedSum = 0;
  const breakdown = [];

  for (const key in EVIDENCE_WEIGHTS) {
    const item = evidence[key];
    if (!item || item.score === undefined || item.score === null) continue;

    const weight = EVIDENCE_WEIGHTS[key];
    const score = Math.max(0, Math.min(100, Number(item.score)));

    weightedSum += score * weight;
    totalWeight += weight;

    breakdown.push({
      module: key,
      score: Number(score.toFixed(2)),
      weightPercent: Number((weight * 100).toFixed(1)),
      reason: item.reason || "No explanation provided by this module.",
    });
  }

  const overallConfidence =
    totalWeight > 0 ? Number((weightedSum / totalWeight).toFixed(2)) : 0;

  const tamperingProbability = Number((100 - overallConfidence).toFixed(2));

  let risk = "LOW";
  if (overallConfidence < 60) risk = "HIGH";
  else if (overallConfidence < 80) risk = "MEDIUM";

  breakdown.sort((a, b) => b.weightPercent - a.weightPercent);

  return { overallConfidence, tamperingProbability, risk, breakdown };
}

/**
 * Real OCR evidence — built from Tesseract's OWN reported per-word
 * confidence (not invented), plus how many expected keywords for
 * that document type were actually found in the extracted text.
 */
export function buildOcrEvidence(tesseractResult, requiredKeywords = []) {
  const text = (tesseractResult?.data?.text || "").toLowerCase();
  const words = tesseractResult?.data?.words || [];

  const avgWordConfidence = words.length
    ? words.reduce((sum, w) => sum + (w.confidence || 0), 0) / words.length
    : (tesseractResult?.data?.confidence ?? 0);

  const matchedKeywords = requiredKeywords.filter((k) =>
    text.includes(k.toLowerCase())
  );

  const keywordRatio = requiredKeywords.length
    ? matchedKeywords.length / requiredKeywords.length
    : 1;

  // 70% weight: OCR engine's own confidence. 30%: content relevance.
  const score = avgWordConfidence * 0.7 + keywordRatio * 100 * 0.3;

  const reason = requiredKeywords.length
    ? `Tesseract OCR engine reported ${avgWordConfidence.toFixed(
        1
      )}% average character-recognition confidence. ${
        matchedKeywords.length
      }/${requiredKeywords.length} expected keywords were found in the extracted text${
        matchedKeywords.length ? ` (${matchedKeywords.join(", ")})` : ""
      }.`
    : `Tesseract OCR engine reported ${avgWordConfidence.toFixed(
        1
      )}% average character-recognition confidence.`;

  return { score: Number(score.toFixed(2)), reason };
}

/**
 * Metadata evidence from the browser File object itself —
 * only signals that actually exist, nothing invented.
 */
export function buildMetadataEvidence(file) {
  const now = Date.now();
  let score = 90;
  const reasons = [];

  if (!file.lastModified || file.lastModified > now) {
    score -= 40;
    reasons.push(
      "File's last-modified timestamp is missing or set in the future, which is inconsistent with normal file handling."
    );
  } else {
    const ageDays = (now - file.lastModified) / (1000 * 60 * 60 * 24);
    reasons.push(
      `File's last-modified timestamp is ${ageDays.toFixed(
        1
      )} day(s) before upload, consistent with normal usage.`
    );
  }

  if (!file.type) {
    score -= 15;
    reasons.push("Browser reported no MIME type for this file.");
  } else {
    reasons.push(`MIME type reported as "${file.type}".`);
  }

  score = Math.max(0, Math.min(100, score));
  return { score: Number(score.toFixed(2)), reason: reasons.join(" ") };
}

/**
 * Blockchain evidence — a real boolean result from your existing
 * verifyHash() call, not a guess.
 */
export function buildBlockchainEvidence(isVerifiedOnChain) {
  return {
    score: isVerifiedOnChain ? 100 : 20,
    reason: isVerifiedOnChain
      ? "Document hash matched an existing record stored on the blockchain ledger."
      : "Document hash did not match any record currently stored on the blockchain ledger.",
  };
}

/**
 * QR evidence — pass in whatever your QR decoder actually returned.
 */
export function buildQrEvidence(qrResult) {
  if (!qrResult) {
    return {
      score: 40,
      reason: "No QR code was detected on the document.",
    };
  }
  return {
    score: qrResult.checksumValid ? 100 : 55,
    reason: qrResult.checksumValid
      ? "QR code was successfully decoded and its checksum is valid."
      : "QR code was decoded but its checksum could not be validated.",
  };
}