import React, { useEffect, useState, useRef } from "react";
import "./AuthorityDashboard.css";
import Tesseract from 'tesseract.js';
import { ethers } from "ethers";
import { registerHash } from "../blockchain";
import * as pdfjsLib from "pdfjs-dist";
import QRCode from "qrcode";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// =========================================================
// DIGITAL INK OVERLAY DETECTOR (fast, single pass, O(n))
// =========================================================
function detectDigitalInkOverlay(canvas, tileSize = 20) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const w = canvas.width;
  const h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;

  const cols = Math.floor(w / tileSize);
  const rows = Math.floor(h / tileSize);

  let globalMidtone = 0;
  let globalPixels = 0;
  const tiles = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = col * tileSize;
      const y0 = row * tileSize;
      let dark = 0, midtone = 0, total = 0;

      for (let y = y0; y < y0 + tileSize && y < h; y++) {
        for (let x = x0; x < x0 + tileSize && x < w; x++) {
          const i = (y * w + x) * 4;
          const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
          total++;
          if (gray < 60) dark++;
          if (gray >= 60 && gray <= 200) midtone++;
        }
      }

      globalMidtone += midtone;
      globalPixels += total;

      tiles.push({
        row, col, x: x0, y: y0,
        darkRatio: dark / Math.max(1, total),
        midtoneRatio: midtone / Math.max(1, total)
      });
    }
  }

  const globalMidtoneRatio = globalMidtone / Math.max(1, globalPixels);

  const flagged = tiles
    .filter(t => t.darkRatio > 0.06)
    .map(t => ({
      ...t,
      hardnessScore: globalMidtoneRatio > 0
        ? Math.max(0, (globalMidtoneRatio - t.midtoneRatio) / globalMidtoneRatio)
        : 0
    }))
    .filter(t => t.hardnessScore > 0.78)
    .sort((a, b) => b.hardnessScore - a.hardnessScore)
    .slice(0, 6);

  const clusters = [];
  const used = new Set();
  flagged.forEach((t, i) => {
    if (used.has(i)) return;
    let group = [t];
    used.add(i);
    flagged.forEach((o, j) => {
      if (i === j || used.has(j)) return;
      if (Math.hypot(t.x - o.x, t.y - o.y) < tileSize * 2.5) {
        group.push(o);
        used.add(j);
      }
    });
    const best = group.sort((a, b) => b.hardnessScore - a.hardnessScore)[0];
    clusters.push({
      x: best.x, y: best.y,
      darkRatio: Number(best.darkRatio.toFixed(3)),
      hardnessScore: Number(best.hardnessScore.toFixed(3)),
      spread: group.length
    });
  });

  return clusters.slice(0, 5);
}

// =========================================================
// NEW — OCR FIELD EXTRACTOR
// Pulls structured fields out of raw OCR text instead of only
// doing keyword-presence counting. Used for the "Extracted
// Fields vs Expected" comparison table before forensic scan.
// =========================================================
function extractStructuredFields(text, docTypeKey) {
  const t = (text || "").toLowerCase();
  const fields = {};

  // Roll number / enrollment style: 4+ digit sequences, optionally with letters
  const rollMatch = t.match(/\b([a-z]{0,3}\d{4,12})\b/);
  fields.rollNumber = rollMatch ? rollMatch[1].toUpperCase() : null;

  // Email
  const emailMatch = t.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  fields.email = emailMatch ? emailMatch[0] : null;

  // CGPA (e.g. "cgpa: 8.7", "8.7 cgpa", "9.02")
  const cgpaMatch = t.match(/(?:cgpa|sgpa)[^0-9]{0,10}(\d{1,2}\.\d{1,2})/) || t.match(/(\d{1}\.\d{1,2})\s*(?:cgpa|sgpa)/);
  fields.cgpa = cgpaMatch ? cgpaMatch[1] : null;

  // Percentage
  const pctMatch = t.match(/(\d{1,3}(?:\.\d{1,2})?)\s*%/);
  fields.percentage = pctMatch ? pctMatch[1] : null;

  // Semester / Year
  const semMatch = t.match(/sem(?:ester)?\.?\s*[-:]?\s*([1-8ivx]+)/i) || t.match(/\b([1-8])(?:st|nd|rd|th)\s*(?:sem|year)/);
  fields.semester = semMatch ? semMatch[1].toUpperCase() : null;

  // Marks list — sequences like "78/100", "45 out of 50"
  const marksMatches = [...t.matchAll(/(\d{1,3})\s*\/\s*(\d{1,3})/g)].slice(0, 6);
  fields.marksEntries = marksMatches.map(m => `${m[1]}/${m[2]}`);

  // Subject-like tokens (very rough heuristic — lines with "theory"/"practical"/known subject keywords)
  const subjectHints = ["mathematics", "physics", "chemistry", "engineering", "programming", "data structures", "networks", "database", "electronics", "mechanics", "thermodynamics", "circuits", "software"];
  fields.subjectHints = subjectHints.filter(s => t.includes(s));

  // Dates (dd/mm/yyyy or dd-mm-yyyy or month yyyy)
  const dateMatch = t.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/) || t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\b/);
  fields.date = dateMatch ? dateMatch[0] : null;

  // Name heuristic: two/three capitalized-looking word tokens near "name"
  const nameMatch = t.match(/name\s*[:\-]?\s*([a-z]{2,}(?:\s+[a-z]{2,}){0,2})/);
  fields.nameNearLabel = nameMatch ? nameMatch[1] : null;

  return fields;
}

// Compares extracted fields against what's "expected" for a doc type,
// returning a small list of {label, found, expected} rows for display.
function buildFieldComparison(docTypeKey, fields, rawText) {
  const rows = [];
  const has = (v) => v !== null && v !== undefined && v !== "";

  if (docTypeKey === "marksheet") {
    rows.push({ label: "Roll / Enrollment No.", expected: "Numeric ID (4+ digits)", found: fields.rollNumber || "Not detected", ok: has(fields.rollNumber) });
    rows.push({ label: "Semester / Year", expected: "Sem 1–8 or Year", found: fields.semester || "Not detected", ok: has(fields.semester) });
    rows.push({ label: "CGPA / SGPA", expected: "Decimal e.g. 8.70", found: fields.cgpa || "Not detected", ok: has(fields.cgpa) });
    rows.push({ label: "Percentage", expected: "e.g. 78.4%", found: fields.percentage || "Not detected", ok: has(fields.cgpa) || has(fields.percentage) });
    rows.push({ label: "Subject-wise Marks", expected: "e.g. 45/50 entries", found: fields.marksEntries.length ? fields.marksEntries.join(", ") : "Not detected", ok: fields.marksEntries.length > 0 });
    rows.push({ label: "Recognizable Subjects", expected: "Course-related keywords", found: fields.subjectHints.length ? fields.subjectHints.join(", ") : "Not detected", ok: fields.subjectHints.length > 0 });
  } else if (docTypeKey === "degree") {
    rows.push({ label: "Graduation Date", expected: "A date value", found: fields.date || "Not detected", ok: has(fields.date) });
    rows.push({ label: "Serial / Certificate No.", expected: "Numeric ID", found: fields.rollNumber || "Not detected", ok: has(fields.rollNumber) });
  } else if (docTypeKey === "fee") {
    rows.push({ label: "Email on Receipt", expected: "Valid email format", found: fields.email || "Not detected", ok: has(fields.email) });
    rows.push({ label: "Receipt Date", expected: "A date value", found: fields.date || "Not detected", ok: has(fields.date) });
    rows.push({ label: "Amount Reference", expected: "Rs. / amount figures", found: /rs\.?\s*\d|₹\s*\d/.test(rawText || "") ? "Amount pattern found" : "Not detected", ok: /rs\.?\s*\d|₹\s*\d/.test(rawText || "") });
  } else {
    rows.push({ label: "ID / Roll Number", expected: "Numeric ID", found: fields.rollNumber || "Not detected", ok: has(fields.rollNumber) });
    rows.push({ label: "Date Reference", expected: "A date value", found: fields.date || "Not detected", ok: has(fields.date) });
  }
  return rows;
}

function AuthorityDashboard() {
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [tab, setTab] = useState("pending");
  const [blockedUsers, setBlockedUsers] = useState({});
  const [auditLogs, setAuditLogs] = useState([]);
  const [checkedIssues, setCheckedIssues] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [showDocTypeSelector, setShowDocTypeSelector] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState("");
  const [extractedText, setExtractedText] = useState("");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [userRejections, setUserRejections] = useState({});
  const [pageResults, setPageResults] = useState([]);

  const [forensicScanning, setForensicScanning] = useState(false);
  const [forensicStage, setForensicStage] = useState("");
  const [forensicIssuesChecked, setForensicIssuesChecked] = useState([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [forensicError, setForensicError] = useState(null);

  // NEW — approve-flow visible error (was: silent alert() swallow)
  const [approveError, setApproveError] = useState(null);
  const [approving, setApproving] = useState(false);

  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const cancelRef = useRef(false);

  const withTimeout = (promise, ms, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s — check your network/backend connection and try again.`)), ms))
  ]);

  const colleges = ["Usha Mittal Institute of Technology"];

  const documentTypes = {
    marksheet: { name: "Marksheet / Grade Card", checks: ["🎓 University Logo", "👤 Student Name", "🎫 Roll Number", "📚 Course Name", "📊 Semester/Year", "📝 Subject Names", "🎯 Marks/Grades", "📈 CGPA/Percentage", "📅 Issue Date", "✍️ Controller Signature", "📱 QR Code"], requiredKeywords: ["marksheet", "grade", "semester", "cgpa", "percentage", "roll", "subject", "marks"] },
    degree: { name: "Degree Certificate", checks: ["🎓 University Logo", "👤 Student Name", "🎓 Degree Name", "📅 Graduation Date", "🔢 Serial Number", "✍️ VC/Registrar Signature", "🔒 Official Seal"], requiredKeywords: ["degree", "bachelor", "master", "graduation", "certificate", "serial"] },
    bonafide: { name: "Bonafide Certificate", checks: ["🏛️ College Logo", "👤 Student Name", "🎫 Roll Number", "📚 Course Name", "📅 Year/Semester", "📜 Study Statement", "📅 Issue Date", "✍️ Principal Signature"], requiredKeywords: ["bonafide", "student", "bona", "fide", "principal"] },
    tc: { name: "Transfer Certificate (TC)", checks: ["🏛️ College Logo", "👤 Student Name", "👪 Parent Name", "📅 DOB", "📚 Course", "📅 Admission Date", "📅 Leaving Date", "✍️ Principal Signature"], requiredKeywords: ["transfer", "tc", "leaving", "admission", "parent"] },
    migration: { name: "Migration Certificate", checks: ["🎓 University Logo", "👤 Student Name", "🎫 Enrollment No", "📜 Transfer Statement", "📅 Issue Date", "✍️ Registrar Signature", "🔒 Seal"], requiredKeywords: ["migration", "enrollment", "registrar", "transfer"] },
    admit: { name: "Admit Card / Hall Ticket", checks: ["🎓 University Logo", "👤 Student Name", "🎫 Roll Number", "📋 Exam Name", "📅 Exam Dates", "📍 Exam Center", "🖼️ Photo", "📱 Barcode/QR"], requiredKeywords: ["admit", "hall", "ticket", "exam", "center"] },
    idcard: { name: "Identity Card (ID Card)", checks: ["🏛️ College Logo", "🖼️ Student Photo", "👤 Name", "🎫 ID Number", "📅 Validity Dates", "📍 College Address", "✍️ Principal Signature"], requiredKeywords: ["id card", "identity", "student id", "valid"] },
    provisional: { name: "Provisional Certificate", checks: ["🎓 University Logo", "👤 Student Name", "🎓 Degree Name", "📜 Pending Statement", "📅 Issue Date", "🔢 Certificate No", "✍️ Registrar Signature"], requiredKeywords: ["provisional", "pending", "certificate", "degree"] },
    character: { name: "Character Certificate", checks: ["🏛️ College Name", "👤 Student Name", "📚 Course", "📅 Study Duration", "📜 Character Statement", "✍️ Principal Signature"], requiredKeywords: ["character", "conduct", "principal", "student"] },
    fee: { name: "Fee Receipt", checks: ["🏛️ College Logo", "👤 Student Name", "🎫 Receipt No", "📧 Email Address", "💰 Fee Details", "💳 Amount Paid", "📅 Date", "✍️ Accountant Signature"], requiredKeywords: ["receipt", "fee", "paid", "amount", "rs", "email"] }
  };

  const authority = localStorage.getItem("authority") || "Usha Mittal Institute of Technology";

  const loadUserRejections = () => {
    const saved = JSON.parse(localStorage.getItem("userRejections")) || {};
    setUserRejections(saved);
  };
  const saveUserRejections = (rejections) => {
    localStorage.setItem("userRejections", JSON.stringify(rejections));
    setUserRejections(rejections);
  };
  const isUserBlocked = (user) => blockedUsers[user] || userRejections[user]?.count >= 3;
  const autoBlockUser = (user) => {
    const updatedBlocked = { ...blockedUsers, [user]: { blockedAt: new Date().toLocaleString(), reason: "3+ Rejections" } };
    localStorage.setItem("blockedUsers", JSON.stringify(updatedBlocked));
    setBlockedUsers(updatedBlocked);
    addAudit("🚫 AUTO BLOCKED (3+ rejections)", { user });
  };
  const unblockUser = (user) => {
    const updatedBlocked = { ...blockedUsers };
    delete updatedBlocked[user];
    localStorage.setItem("blockedUsers", JSON.stringify(updatedBlocked));
    const updatedRejections = { ...userRejections };
    delete updatedRejections[user];
    saveUserRejections(updatedRejections);
    addAudit("✅ UNBLOCKED", { user });
  };
  const incrementUserRejection = (user) => {
    const current = userRejections[user] || { count: 0 };
    const updated = { ...current, count: current.count + 1, lastRejected: new Date().toLocaleString() };
    if (updated.count >= 3) autoBlockUser(user);
    else saveUserRejections({ ...userRejections, [user]: updated });
  };

  useEffect(() => {
    if (!localStorage.getItem("documents")) {
      const sampleDocs = [
        { id: "1", name: "COEP Bonafide Certificate 2024", user: "raj@coep.ac.in", image: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=400&h=500&fit=crop", authority, status: "Pending", previewData: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=400&h=500&fit=crop", thumbnailData: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=120&h=120&fit=crop" },
        { id: "2", name: "VJTI Semester Marksheet 2023", user: "priya@vjti.ac.in", image: "https://via.placeholder.com/550x750/00ff88/000?text=VJTI+Marksheet", authority, status: "Pending" },
        { id: "3", name: "UMIT Degree Certificate B.Tech CSE", user: "amit@umit.edu", image: "https://via.placeholder.com/500x700/ff6b6b/fff?text=UMIT+Degree", authority, status: "Approved" },
        { id: "4", name: "Thakur College Fee Receipt 2024 - amit@gmail.com", user: "amit@gmail.com", image: "https://via.placeholder.com/500x700/e8a139/fff?text=Fee+Receipt", authority, status: "Pending" }
      ];
      localStorage.setItem("documents", JSON.stringify(sampleDocs));
    }
    const docs = JSON.parse(localStorage.getItem("documents")) || [];
    setDocuments(docs.filter(d => d.authority === authority));
    const blocked = JSON.parse(localStorage.getItem("blockedUsers")) || {};
    setBlockedUsers(blocked);
    const logs = JSON.parse(localStorage.getItem("audit")) || [];
    setAuditLogs(logs.filter(l => l.authority === authority));
    loadUserRejections();
  }, [authority]);

  const pending = documents.filter(d => d.status === "Pending").length;
  const approved = documents.filter(d => d.status === "Approved").length;
  const rejected = documents.filter(d => d.status === "Rejected").length;
  const total = documents.length;
  const usersList = [...new Set(documents.map(d => d.user))];
  const blockedUsersList = Object.entries(blockedUsers).map(([user, data]) => ({ user, ...data, rejectionCount: userRejections[user]?.count || 0 }));

  const getAnalyticsData = () => {
    const statusCounts = { pending: documents.filter(d => d.status === "Pending").length, approved: documents.filter(d => d.status === "Approved").length, rejected: documents.filter(d => d.status === "Rejected").length };
    const docTypes = {};
    documents.forEach(doc => {
      const type = doc.name.toLowerCase().includes('marksheet') ? 'Marksheet' : doc.name.toLowerCase().includes('degree') ? 'Degree' : doc.name.toLowerCase().includes('bonafide') ? 'Bonafide' : doc.name.toLowerCase().includes('fee') ? 'Fee Receipt' : doc.name.toLowerCase().includes('tc') ? 'TC' : 'Other';
      docTypes[type] = (docTypes[type] || 0) + 1;
    });
    const topUsers = [...new Set(documents.map(d => d.user))].map(user => ({ user, count: documents.filter(d => d.user === user).length })).sort((a, b) => b.count - a.count).slice(0, 5);
    return { statusCounts, docTypes, topUsers };
  };

  // =========================================================
  // UPDATED — addAudit now stores a structured object (not just
  // a text string) so the audit trail can render rich rows:
  // action, docId, docName, user, authority, time, AND optional
  // meta: { trustScore, blockchainHash, verdict, reportGenerated,
  //         reportSentToUser }
  // =========================================================
  const addAudit = (action, doc, meta = {}) => {
    let logs = JSON.parse(localStorage.getItem("audit")) || [];
    const entry = {
      id: Date.now() + Math.random(),
      action,
      docId: doc.id,
      docName: doc.name || "",
      user: doc.user,
      authority,
      time: new Date().toLocaleString(),
      timestamp: Date.now(),
      ...meta
    };
    logs.push(entry);
    localStorage.setItem("audit", JSON.stringify(logs));
    setAuditLogs(logs.filter(l => l.authority === authority));
    return entry;
  };

  // NEW — update an existing audit entry in place (used to attach the
  // "report sent" flag onto the original approval row instead of
  // spamming a second disconnected log line).
  const updateAuditEntry = (id, patch) => {
    let logs = JSON.parse(localStorage.getItem("audit")) || [];
    logs = logs.map(l => (l.id === id ? { ...l, ...patch } : l));
    localStorage.setItem("audit", JSON.stringify(logs));
    setAuditLogs(logs.filter(l => l.authority === authority));
  };

  const isPdfSource = (src) => {
    if (!src) return false;
    if (src.startsWith("data:application/pdf")) return true;
    if (/\.pdf($|\?)/i.test(src)) return true;
    return false;
  };

  const renderPdfToDataUrl = async (pdfSource) => {
    const loadingTask = pdfjsLib.getDocument(pdfSource);
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;

    let metadata = null;
    try {
      const meta = await pdf.getMetadata();
      metadata = { producer: meta.info?.Producer || "Unknown", creator: meta.info?.Creator || "Unknown", creationDate: meta.info?.CreationDate || null, modDate: meta.info?.ModDate || null };
    } catch (e) { console.warn("PDF metadata extraction failed:", e); }

    return { dataUrl: canvas.toDataURL("image/png"), metadata, pageCount: pdf.numPages };
  };

  const analyzePdfMetadata = (metadata) => {
    if (!metadata) return { flags: [], raw: null };
    const flags = [];
    const suspiciousTools = ["photoshop", "gimp", "canva", "illustrator", "paint.net", "ilovepdf", "smallpdf", "pdf editor", "foxit editor", "snagit"];
    const producer = (metadata.producer || "").toLowerCase();
    const creator = (metadata.creator || "").toLowerCase();
    suspiciousTools.forEach(tool => {
      if (producer.includes(tool) || creator.includes(tool)) {
        flags.push(`File metadata records "${tool}" as the producer/creator — official certificates are normally exported directly from institutional ERP/print software, not saved through an image or PDF editor.`);
      }
    });
    if (metadata.creationDate && metadata.modDate && metadata.creationDate !== metadata.modDate) {
      flags.push(`Creation date and last-modified date in the file's metadata don't match — the PDF was opened and re-saved after it was first generated.`);
    }
    return { flags, raw: metadata };
  };

  const computeELA = (sourceCanvas, quality = 90) => {
    return new Promise((resolve) => {
      const w = sourceCanvas.width;
      const h = sourceCanvas.height;
      const recompressed = document.createElement("canvas");
      recompressed.width = w;
      recompressed.height = h;
      const rctx = recompressed.getContext("2d", { willReadFrequently: true });
      const jpegDataUrl = sourceCanvas.toDataURL("image/jpeg", quality / 100);
      const img = new Image();

      img.onload = () => {
        rctx.drawImage(img, 0, 0, w, h);
        const origCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
        const orig = origCtx.getImageData(0, 0, w, h).data;
        const comp = rctx.getImageData(0, 0, w, h).data;

        let totalError = 0, maxError = 0, hotspotPixels = 0;
        const COLS = 10, ROWS = 14;
        const tiles = [];
        for (let row = 0; row < ROWS; row++) {
          for (let col = 0; col < COLS; col++) {
            tiles.push({ row, col, x: Math.floor((col / COLS) * w), y: Math.floor((row / ROWS) * h), totalError: 0, pixels: 0, hotspotPixels: 0 });
          }
        }

        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const err = (Math.abs(orig[i] - comp[i]) + Math.abs(orig[i + 1] - comp[i + 1]) + Math.abs(orig[i + 2] - comp[i + 2])) / 3;
            totalError += err;
            if (err > maxError) maxError = err;
            if (err > 25) hotspotPixels++;

            const col = Math.min(COLS - 1, Math.floor((x / w) * COLS));
            const row = Math.min(ROWS - 1, Math.floor((y / h) * ROWS));
            const tile = tiles[row * COLS + col];
            tile.totalError += err;
            tile.pixels++;
            if (err > 25) tile.hotspotPixels++;
          }
        }

        const totalPixels = orig.length / 4;
        const meanError = totalError / totalPixels;
        const hotspotPercentage = (hotspotPixels / totalPixels) * 100;

        const localizedAnomalies = tiles.map((tile) => {
          const tileMeanError = tile.totalError / Math.max(1, tile.pixels);
          const tileHotspotPercentage = (tile.hotspotPixels / Math.max(1, tile.pixels)) * 100;
          const errorRatio = tileMeanError / Math.max(0.1, meanError);
          const hotspotRatio = tileHotspotPercentage / Math.max(0.1, hotspotPercentage);
          let anomalyScore = 0;
          if (errorRatio >= 1.8 && tileHotspotPercentage >= 1) anomalyScore += 35;
          else if (errorRatio >= 1.5 && tileHotspotPercentage >= 0.8) anomalyScore += 25;
          else if (errorRatio >= 1.2 && tileHotspotPercentage >= 0.5) anomalyScore += 15;
          if (hotspotRatio >= 2.5 && tileHotspotPercentage >= 0.8) anomalyScore += 15;

          return { row: tile.row, col: tile.col, x: tile.x, y: tile.y, meanError: Number(tileMeanError.toFixed(2)), hotspotPercentage: Number(tileHotspotPercentage.toFixed(2)), anomalyScore: Math.min(50, anomalyScore) };
        }).filter(t => t.anomalyScore >= 8).sort((a, b) => b.anomalyScore - a.anomalyScore).slice(0, 5);

        resolve({ meanError: Number(meanError.toFixed(2)), maxError: Number(maxError.toFixed(2)), hotspotPercentage: Number(hotspotPercentage.toFixed(2)), localizedAnomalies });
      };

      img.src = jpegDataUrl;
    });
  };

  const runAIForensicAnalysis = async ({ imageDataUrl, elaSummary, ocrText, metadataFlags, docName, inkOverlay, imgWidth, imgHeight }) => {
    const response = await fetch("http://localhost:5000/api/verify-document-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imageDataUrl, docName, ocrText: (ocrText || "").slice(0, 1200), elaSummary, metadataFlags, inkOverlay, imgWidth, imgHeight })
    });
    if (!response.ok) {
      let detail = "";
      try { const j = await response.json(); detail = j?.error ? ` — ${j.error}` : ""; } catch (_) { /* ignore parse failure */ }
      throw new Error(`AI verification service error (${response.status})${detail}`);
    }
    return response.json();
  };

  const checkTextContent = (text, docType) => {
    if (!text || text.length < 20) return false;
    const words = text.split(/\s+/).filter(w => w.length > 2);
    let matches = 0;
    docType.requiredKeywords.forEach(keyword => {
      if (text.includes(keyword.toLowerCase()) || words.some(word => word.includes(keyword.toLowerCase()))) matches++;
    });
    return matches >= Math.max(1, Math.floor(docType.requiredKeywords.length * 0.4));
  };

  const detectCollegeFromText = (text) => colleges.some(college => text.includes(college.toLowerCase()) || college.split(' ').some(word => text.includes(word.toLowerCase())));

  // =========================================================
  // UPDATED OCR — image preprocessing (grayscale + contrast
  // boost) before Tesseract, plus a whitelist-aware config for
  // cleaner alphanumeric reads on certificates. This is the
  // "make step 1 actually better" ask — no pipeline restructure,
  // just a stronger single-pass read.
  // =========================================================
  const preprocessForOCR = (srcCanvas) => {
    const out = document.createElement("canvas");
    out.width = srcCanvas.width;
    out.height = srcCanvas.height;
    const ctx = out.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(srcCanvas, 0, 0);
    const imgData = ctx.getImageData(0, 0, out.width, out.height);
    const d = imgData.data;
    const contrast = 1.35; // mild boost — enough to sharpen faint printed/scanned text
    const intercept = 128 * (1 - contrast);
    for (let i = 0; i < d.length; i += 4) {
      const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      const adjusted = Math.min(255, Math.max(0, gray * contrast + intercept));
      d[i] = d[i + 1] = d[i + 2] = adjusted;
    }
    ctx.putImageData(imgData, 0, 0);
    return out;
  };

  const extractTextFromImage = async (imageSrcOrCanvas) => {
    try {
      setOcrProgress(0);
      let ocrInput = imageSrcOrCanvas;
      // If given a canvas, run it through preprocessing first for a cleaner read
      if (typeof imageSrcOrCanvas !== "string") {
        ocrInput = preprocessForOCR(imageSrcOrCanvas).toDataURL();
      }
      const { data: { text } } = await Tesseract.recognize(ocrInput, 'eng', {
        logger: m => { if (m.status === 'recognizing text') setOcrProgress(Math.round(m.progress * 100)); }
      });
      return text.toLowerCase().trim();
    } catch (error) { console.error('OCR Error:', error); return ''; }
  };

  const runPageByPageOCR = async (doc, onProgress) => {
    const pages = doc.pages && doc.pages.length > 0 ? doc.pages : [doc.renderedPreview || doc.previewData || doc.image];
    const results = [];
    let combinedText = "";
    for (let i = 0; i < pages.length; i++) {
      onProgress?.(Math.round((i / pages.length) * 100), i + 1, pages.length);
      const { data } = await Tesseract.recognize(pages[i], 'eng');
      const pageText = (data.text || "").toLowerCase().trim();
      const avgConfidence = data.words?.length ? data.words.reduce((s, w) => s + (w.confidence || 0), 0) / data.words.length : (data.confidence ?? 0);
      combinedText += " " + pageText;
      results.push({ pageNumber: i + 1, thumbnail: pages[i], text: pageText, confidence: Number(avgConfidence.toFixed(1)), wordCount: pageText.split(/\s+/).filter(Boolean).length });
    }
    onProgress?.(100, pages.length, pages.length);
    return { pageResults: results, combinedText: combinedText.trim() };
  };

  const analyzeImageElements = (canvas, ctx, extractedText) => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    const results = {};
    let headerDark = 0, contentDark = 0, footerDark = 0, textDensity = 0;

    for (let y = 0; y < canvas.height * 0.2; y++) for (let x = 0; x < canvas.width; x++) {
      const idx = ((Math.floor(y) * canvas.width) + Math.floor(x)) * 4;
      if (idx < pixels.length && (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3 < 140) headerDark++;
    }
    for (let y = canvas.height * 0.2; y < canvas.height * 0.8; y++) for (let x = 0; x < canvas.width; x++) {
      const idx = ((Math.floor(y) * canvas.width) + Math.floor(x)) * 4;
      if (idx < pixels.length && (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3 < 120) { contentDark++; textDensity++; }
    }
    for (let y = canvas.height * 0.8; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const idx = ((Math.floor(y) * canvas.width) + Math.floor(x)) * 4;
      if (idx < pixels.length && (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3 < 130) footerDark++;
    }

    const headerArea = canvas.width * canvas.height * 0.2, contentArea = canvas.width * canvas.height * 0.6, footerArea = canvas.width * canvas.height * 0.2;
    results.hasLogo = headerDark > (headerArea * 0.15);
    results.hasContent = contentDark > (contentArea * 0.25);
    results.hasSignature = footerDark > (footerArea * 0.12);
    results.hasSeal = footerDark > (footerArea * 0.08);
    results.hasText = textDensity > (contentArea * 0.2);
    results.hasExtractedText = !!extractedText && extractedText.length > 20;
    results.imageQuality = contentDark > (contentArea * 0.1);
    return results;
  };

  const detectSocialMedia = (docName) => ['facebook', 'instagram', 'twitter', 'linkedin', 'snapchat', 'tiktok', 'whatsapp'].some(k => docName.toLowerCase().includes(k));
  const detectAadhar = (docName) => ['aadhar', 'aadhhar', 'uidai', 'aadhaar'].some(k => docName.toLowerCase().includes(k));
  const detectCourse = (text) => text.includes("engineering") || text.includes("btech") || text.includes("course");
  const detectSemester = (text) => text.includes("sem") || text.includes("semester") || /\b[1-8]\b/.test(text);
  const detectSubjects = (text) => text.includes("subject") || text.includes("theory") || text.includes("practical");
  const detectSignature = (text, analysis) => text.includes("controller") || text.includes("signature") || text.includes("examiner") || analysis?.hasSignature;
  const detectQR = (text) => text.includes("qr") || text.includes("code") || text.includes("verify");

  const verifyDocument = async (doc) => {
    setIsScanning(true); setScanProgress(0); setCheckedIssues([]); setExtractedText(""); setOcrProgress(0); setPageResults([]);
    const checks = [];
    let progress = 0;
    const initialScanInterval = setInterval(() => { progress += 100 / 75; setScanProgress(Math.min(progress, 100)); }, 40);

    setTimeout(async () => {
      clearInterval(initialScanInterval);
      try {
        const rawSrc = doc.pdfRawData || doc.image || doc.previewData;
        let sourceForImage = rawSrc;
        let pdfMeta = null;
        const sourceIsPdf = isPdfSource(rawSrc);

        if (sourceIsPdf) {
          checks.push({ name: "📄 Reading PDF Metadata...", value: null });
          const pdfResult = await renderPdfToDataUrl(rawSrc);
          sourceForImage = pdfResult.dataUrl;
          pdfMeta = pdfResult.metadata;
          checks[checks.length - 1] = { name: "📄 PDF Metadata Read Successfully", value: true };
        }

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = sourceForImage;

        await new Promise((resolve) => {
          img.onload = async () => {
            const canvas = canvasRef.current;
            if (!canvas) { resolve(); return; }
            const ctx = canvas.getContext('2d');
            canvas.width = Math.min(img.width, 800);
            canvas.height = (img.height * canvas.width) / img.width;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            checks.push({ name: "🔄 Extracting Text (Page-by-Page)...", value: null });
            let extractedText;
            if (doc.pages && doc.pages.length > 0) {
              const { pageResults: pr, combinedText } = await runPageByPageOCR(doc, (pct, cur, tot) => { setOcrProgress(pct); checks[checks.length - 1] = { name: `🔄 Scanning Page ${cur}/${tot}...`, value: null }; });
              setPageResults(pr);
              extractedText = combinedText;
            } else {
              setPageResults([]);
              extractedText = await extractTextFromImage(canvas); // NEW: pass canvas → preprocessed before OCR
            }
            setExtractedText(extractedText);

            checks[checks.length - 1] = { name: "📄 Text Extracted", value: !!extractedText && extractedText.length > 20 };
            checks.push({ name: "🚫 Not Social Media", value: !detectSocialMedia(extractedText) });
            checks.push({ name: "🚫 Not Aadhar Card", value: !detectAadhar(doc.name) });
            const collegeMatch = colleges.some(c => doc.name.toLowerCase().includes(c.toLowerCase().split(' ').join('')) || doc.name.toLowerCase().includes(c.toLowerCase().split(' ')[0]));
            checks.push({ name: "🎓 College Name Match", value: collegeMatch });

            const analysis = analyzeImageElements(canvas, ctx, extractedText);
            checks.push({ name: "🖼️ Image Quality OK", value: analysis.imageQuality });
            checks.push({ name: "📄 Readable Text Density", value: analysis.hasText });
            checks.push({ name: "📝 OCR Text Found", value: analysis.hasExtractedText });
            checks.push({ name: "🏛️ College Detected in Text", value: detectCollegeFromText(extractedText) });

            setSelectedDoc({ ...doc, basicChecks: checks, scanImage: canvas.toDataURL(), extractedText, renderedPreview: sourceForImage, isPdfSource: sourceIsPdf, pdfMeta });
            setShowDocTypeSelector(true);
            addAudit(sourceIsPdf ? "🔍 PDF Metadata + Page-by-Page OCR Complete" : "🔍 OCR + Basic Scan Complete", doc);
            resolve();
          };
          img.onerror = () => {
            checks.push({ name: "🖼️ Image/PDF Load Failed", value: false });
            setSelectedDoc({ ...doc, basicChecks: checks, imageLoadFailed: true, verificationResult: checks });
            setShowDocTypeSelector(false);
            addAudit("❌ IMAGE/PDF LOAD FAILED", doc);
            setIsScanning(false);
            resolve();
          };
        });
      } catch (err) {
        console.error(err);
        setSelectedDoc({ ...doc, basicChecks: [{ name: "❌ Scan Error", value: false }], imageLoadFailed: true });
        setShowDocTypeSelector(true);
      } finally { setIsScanning(false); }
    }, 1000);
  };

  const startDeepVerification = () => {
    if (!selectedDocType || !selectedDoc.extractedText) return;
    const lowerText = selectedDoc.extractedText.toLowerCase();
    setIsScanning(true); setScanProgress(0); setCheckedIssues([]);
    const docType = documentTypes[selectedDocType];
    const checks = [...(selectedDoc?.basicChecks || [])];
    const canvas = canvasRef.current;

    // NEW — structured field extraction + comparison table data,
    // computed alongside the existing pass/fail checklist.
    const structuredFields = extractStructuredFields(lowerText, selectedDocType);
    const fieldComparison = buildFieldComparison(selectedDocType, structuredFields, lowerText);

    if (canvas && selectedDoc.extractedText) {
      const ctx = canvas.getContext('2d');
      const analysis = analyzeImageElements(canvas, ctx, selectedDoc.extractedText);
      docType.checks.forEach(checkItem => {
        let passed = false;
        const lowerCheck = checkItem.toLowerCase();
        if (lowerCheck.includes("course")) passed = detectCourse(lowerText);
        else if (lowerCheck.includes("semester") || lowerCheck.includes("year")) passed = detectSemester(lowerText);
        else if (lowerCheck.includes("subject")) passed = detectSubjects(lowerText);
        else if (lowerCheck.includes("signature") || lowerCheck.includes("controller")) passed = detectSignature(lowerText, analysis);
        else if (lowerCheck.includes("qr")) passed = detectQR(lowerText);
        else if (lowerCheck.includes('logo')) passed = analysis.hasLogo || lowerText.includes("university") || lowerText.includes("institute");
        else if (lowerCheck.includes('seal')) passed = analysis.hasSeal;
        else if (lowerCheck.includes('photo')) passed = analysis.hasContent;
        else if (lowerCheck.includes('college') || lowerCheck.includes('university')) passed = colleges.some(college => lowerText.includes(college.toLowerCase()) || college.toLowerCase().split(" ").some(word => lowerText.includes(word)));
        else if (lowerCheck.includes('name') || lowerCheck.includes('student')) passed = lowerText.includes('student') || lowerText.includes('name') || /[a-z]{3,}\s[a-z]{3,}/.test(lowerText);
        else if (lowerCheck.includes('roll') || lowerCheck.includes('id')) passed = /\d{4,}/.test(lowerText);
        else if (lowerCheck.includes('date')) passed = /\d{4}/.test(lowerText);
        else if (lowerCheck.includes('marks') || lowerCheck.includes('grade') || lowerCheck.includes('cgpa')) passed = lowerText.includes('marks') || lowerText.includes('grade') || lowerText.includes('cgpa');
        else if (lowerCheck.includes('fee') || lowerCheck.includes('receipt')) passed = lowerText.includes('receipt') || lowerText.includes('rs');
        else if (lowerCheck.includes('email')) passed = /\S+@\S+\.\S+/.test(lowerText);
        else if (lowerCheck.includes('degree')) passed = lowerText.includes("engineering") || lowerText.includes("btech") || lowerText.includes("course") || lowerText.includes("computer") || lowerText.includes("science");
        checks.push({ name: checkItem, value: passed });
      });
    }

    let progress = 0;
    const interval = setInterval(() => {
      progress += 16.6;
      setScanProgress(Math.min(progress, 100));
      if (progress >= 100) {
        clearInterval(interval);
        setSelectedDoc(prev => ({ ...prev, verificationResult: checks, detectedType: docType, textMatch: checkTextContent(selectedDoc.extractedText, docType), fieldComparison, structuredFields }));
        setShowDocTypeSelector(false);
        setSelectedDocType("");
        addAudit(`📋 Completeness Checked: ${docType.name}`, selectedDoc);
        setIsScanning(false);
      }
    }, 400);
  };

  const startForensicScan = async (doc) => {
    cancelRef.current = false;
    setForensicScanning(true);
    setForensicIssuesChecked([]);
    setShowReportModal(false);
    setForensicError(null);

    try {
      setForensicStage("📄 Loading document...");
      const rawSrc = doc.pdfRawData || doc.image || doc.previewData;
      let renderedDataUrl = doc.renderedPreview || rawSrc;
      let pdfMetadata = doc.pdfMeta || null;

      if (!doc.renderedPreview && isPdfSource(rawSrc)) {
        const pdfResult = await withTimeout(renderPdfToDataUrl(rawSrc), 30000, "PDF rendering");
        renderedDataUrl = pdfResult.dataUrl;
        pdfMetadata = pdfResult.metadata;
      }
      if (cancelRef.current) return;

      const workCanvas = document.createElement('canvas');
      const img = new Image();
      img.crossOrigin = "anonymous";
      await withTimeout(new Promise((resolve, reject) => {
        img.onload = () => {
          const MAX_FORENSIC_WIDTH = 1200;
          const newScale = Math.min(1, MAX_FORENSIC_WIDTH / img.width);
          workCanvas.width = Math.round(img.width * newScale);
          workCanvas.height = Math.round(img.height * newScale);
          const ctx = workCanvas.getContext("2d", { willReadFrequently: true });
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, workCanvas.width, workCanvas.height);
          resolve();
        };
        img.onerror = () => reject(new Error("Could not load the document image (broken URL, blocked CORS, or unsupported format)."));
        img.src = renderedDataUrl;
      }), 20000, "Image loading");
      if (cancelRef.current) return;

      setForensicStage("🔠 Reading document text (OCR)...");
      const ocrTextForForensics = doc.extractedText || await withTimeout(extractTextFromImage(workCanvas), 45000, "OCR text extraction");
      if (cancelRef.current) return;

      setForensicStage("🧪 Running Error Level Analysis...");
      const elaResult = await withTimeout(computeELA(workCanvas, 90), 20000, "Error Level Analysis");
      if (cancelRef.current) return;

      setForensicStage("🖊️ Checking for digital ink overlays...");
      const inkOverlay = detectDigitalInkOverlay(workCanvas);

      setForensicStage("📋 Checking file metadata...");
      const metadataAnalysis = analyzePdfMetadata(pdfMetadata);

      setForensicStage("🤖 Comparing document regions with AI...");
      const aiResult = await withTimeout(runAIForensicAnalysis({
        imageDataUrl: workCanvas.toDataURL("image/jpeg", 0.82),
        elaSummary: elaResult,
        ocrText: ocrTextForForensics,
        metadataFlags: metadataAnalysis.flags,
        docName: doc.name,
        inkOverlay,
        imgWidth: workCanvas.width,
        imgHeight: workCanvas.height
      }), 30000, "AI forensic request");
      if (cancelRef.current) return;

      const forensicReport = {
        verdict: aiResult.verdict || "SUSPICIOUS",
        trustScore: typeof aiResult.trustScore === 'number' ? aiResult.trustScore : 50,
        reasons: aiResult.reasons || [],
        tamperedIndicators: aiResult.tamperedIndicators || [],
        toolSignaturesDetected: aiResult.toolSignaturesDetected || [],
        categories: aiResult.categories || {},
        ela: elaResult,
        inkOverlay,
        pdfMetadata,
        metadataFlags: metadataAnalysis.flags,
        isPdf: !!pdfMetadata,
        sourceWidth: workCanvas.width,
        sourceHeight: workCanvas.height,
      };
      setSelectedDoc(prev => ({ ...prev, forensicReport, renderedPreview: renderedDataUrl }));
      addAudit(`🕵️ AI FORENSIC SCAN: ${forensicReport.verdict} (${forensicReport.trustScore}/100)`, doc, {
        verdict: forensicReport.verdict,
        trustScore: forensicReport.trustScore
      });

    } catch (err) {
      if (cancelRef.current) return;
      console.error("Forensic scan failed:", err);
      setForensicError(err.message || "Unknown error during forensic scan.");
    } finally {
      if (!cancelRef.current) {
        setForensicScanning(false);
        setForensicStage("");
      }
    }
  };

  const cancelForensicScan = () => {
    cancelRef.current = true;
    setForensicScanning(false);
    setIsScanning(false);
    setForensicStage("");
    setForensicError("Scan cancelled.");
  };

  // =========================================================
  // NEW — Verification report generator
  // Builds a self-contained, print-ready HTML report (opened in
  // a new window and immediately sent to print/save-as-PDF), with
  // an embedded QR code encoding a public verification URL:
  //   {origin}/verify/{docId}?hash={originalHash}
  // Returns the verification URL + report metadata so it can be
  // logged in the audit trail and attached for the user.
  // =========================================================
  const generateVerificationReport = async (doc, blockchainHash) => {
    const verifyUrl = `${window.location.origin}/verify/${doc.id}?hash=${blockchainHash}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 220, margin: 1, color: { dark: "#0b3d2e", light: "#ffffff" } });

    const report = doc.forensicReport || {};
    const issuedOn = new Date().toLocaleString();
    const caseId = String(doc.id ?? "0000").toString().slice(-8).toUpperCase();

    const checksHtml = (doc.verificationResult || [])
      .map(c => `<tr><td>${c.value ? "✅" : "⚠️"} ${c.name}</td></tr>`)
      .join("");

    const reasonsHtml = (report.reasons || [])
      .map(r => `<li>${r}</li>`)
      .join("") || "<li>No forensic concerns flagged.</li>";

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Verification Report — ${doc.name}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Georgia', 'Times New Roman', serif; color: #1a2332; margin: 0; padding: 0; background: #fff; }
  .sheet { max-width: 760px; margin: 0 auto; padding: 10px 0; }
  .letterhead { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0b3d2e; padding-bottom: 16px; margin-bottom: 22px; }
  .letterhead h1 { font-size: 20px; margin: 0 0 4px; color: #0b3d2e; letter-spacing: 0.02em; }
  .letterhead .sub { font-size: 12px; color: #55606e; font-family: Arial, sans-serif; }
  .badge { text-align: right; }
  .badge .case { font-family: 'Courier New', monospace; font-size: 11px; color: #55606e; }
  .verdict-strip { display: flex; justify-content: space-between; align-items: center; background: #f4f8f6; border: 1px solid #d5e5dd; border-radius: 10px; padding: 16px 20px; margin-bottom: 22px; }
  .verdict-strip .verdict { font-size: 18px; font-weight: bold; }
  .verdict-strip .verdict.real { color: #0b8f5e; }
  .verdict-strip .verdict.suspicious { color: #b5790a; }
  .verdict-strip .score { font-family: Arial, sans-serif; font-size: 13px; color: #55606e; }
  .score .num { font-size: 26px; font-weight: bold; color: #0b3d2e; }
  h2.section { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #0b3d2e; border-bottom: 1px solid #d5e5dd; padding-bottom: 6px; margin: 26px 0 12px; font-family: Arial, sans-serif; }
  table.meta { width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 13px; }
  table.meta td { padding: 6px 0; vertical-align: top; }
  table.meta td.label { color: #55606e; width: 180px; }
  table.checks { width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12.5px; }
  table.checks td { padding: 5px 4px; border-bottom: 1px dotted #e2e8e5; }
  ul.reasons { font-family: Arial, sans-serif; font-size: 12.5px; line-height: 1.7; padding-left: 18px; margin: 0; }
  .hash-block { font-family: 'Courier New', monospace; font-size: 11px; background: #f4f8f6; border: 1px solid #d5e5dd; border-radius: 8px; padding: 10px 14px; word-break: break-all; margin-top: 6px; }
  .footer { display: flex; justify-content: space-between; align-items: center; margin-top: 34px; padding-top: 18px; border-top: 2px solid #0b3d2e; }
  .footer .qr-block { text-align: center; }
  .footer .qr-block img { display: block; margin-bottom: 6px; }
  .footer .qr-block span { font-family: Arial, sans-serif; font-size: 10px; color: #55606e; }
  .footer .seal { font-family: Arial, sans-serif; font-size: 11px; color: #55606e; text-align: right; max-width: 320px; line-height: 1.5; }
  .footer .seal strong { color: #0b3d2e; display: block; font-size: 13px; margin-bottom: 4px; }
  @media print { .no-print { display: none; } }
  .no-print { text-align: center; margin: 18px 0; font-family: Arial, sans-serif; }
  .no-print button { padding: 10px 22px; background: #0b3d2e; color: #fff; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; }
</style>
</head>
<body>
  <div class="no-print"><button onclick="window.print()">🖨️ Save as PDF / Print</button></div>
  <div class="sheet">
    <div class="letterhead">
      <div>
        <h1>Document Verification Report</h1>
        <div class="sub">${authority}</div>
      </div>
      <div class="badge">
        <div class="case">CASE #${caseId}</div>
        <div class="case">Issued: ${issuedOn}</div>
      </div>
    </div>

    <div class="verdict-strip">
      <div>
        <div class="verdict ${report.verdict === "REAL" ? "real" : "suspicious"}">
          ${report.verdict === "REAL" ? "✅ AUTHENTIC — APPROVED" : "⚠️ APPROVED AFTER MANUAL REVIEW"}
        </div>
        <div class="score">AI Forensic Trust Score</div>
      </div>
      <div class="score"><span class="num">${report.trustScore ?? "—"}</span> / 100</div>
    </div>

    <h2 class="section">Document Details</h2>
    <table class="meta">
      <tr><td class="label">Document Name</td><td>${doc.name}</td></tr>
      <tr><td class="label">Submitted By</td><td>${doc.user}</td></tr>
      <tr><td class="label">Reviewing Authority</td><td>${authority}</td></tr>
      <tr><td class="label">Document Type</td><td>${doc.detectedType?.name || "Not classified"}</td></tr>
      <tr><td class="label">Approved On</td><td>${issuedOn}</td></tr>
    </table>

    <h2 class="section">Completeness Checks</h2>
    <table class="checks">${checksHtml || "<tr><td>No completeness check was run.</td></tr>"}</table>

    <h2 class="section">Forensic Findings</h2>
    <ul class="reasons">${reasonsHtml}</ul>

    <h2 class="section">Blockchain Record</h2>
    <div class="hash-block">${blockchainHash}</div>

    <div class="footer">
      <div class="qr-block">
        <img src="${qrDataUrl}" width="110" height="110" />
        <span>Scan to verify online</span>
      </div>
      <div class="seal">
        <strong>${authority}</strong>
        This report was generated automatically upon approval and is
        cryptographically anchored to the blockchain hash above.
        Scan the QR code or visit the verification link to confirm
        this document's status at any time.
      </div>
    </div>
  </div>
</body>
</html>`;

    return { html, verifyUrl, qrDataUrl, caseId, issuedOn };
  };

  // =========================================================
  // FIXED — handleApprove
  // Previous version had silent early-returns (alert + return)
  // with no logging of *why* it stopped, and — the actual bug —
  // no guaranteed write-through: if registerHash() resolved but
  // the localStorage write raced with another tab/update, the
  // doc could stay "Pending" looking. This version:
  //  1) validates with visible errors (no more mystery blocks)
  //  2) always re-reads the freshest "documents" list right
  //     before writing, so it can't clobber a concurrent update
  //  3) generates the classy PDF-style report + QR
  //  4) writes ALL of: status, blockchainHash, trustScore,
  //     report metadata onto the doc in one atomic write
  //  5) logs a structured audit entry with blockchain + report info
  // =========================================================
  const handleApprove = async () => {
    setApproveError(null);
    const failed = selectedDoc.verificationResult?.filter(i => !i.value) || [];
    if (failed.length > 0 && failed.length !== checkedIssues.length) {
      setApproveError("⚠️ Please review all failed completeness checks first (tick each one) before approving.");
      return;
    }
    const report = selectedDoc.forensicReport;
    if (!report) {
      setApproveError("⚠️ Please run the AI Forensic Authenticity Scan before approving.");
      return;
    }
    if (report.verdict === "FAKE") {
      setApproveError("❌ This document was flagged as FAKE by the forensic scan and cannot be approved.");
      return;
    }
    if (report.verdict === "SUSPICIOUS" && forensicIssuesChecked.length !== report.reasons.length) {
      setApproveError("⚠️ Please review every flagged forensic concern (tick each one) before approving a SUSPICIOUS document.");
      return;
    }

    setApproving(true);
    try {
      const hash = selectedDoc.originalHash;
      if (!hash) {
        setApproveError("❌ This document has no original hash on record — ask the user to re-upload before approving.");
        setApproving(false);
        return;
      }

      await registerHash(hash);

      // Re-read the freshest copy right before writing — avoids a stale
      // in-memory `documents` array silently overwriting a concurrent change.
      let allDocs = JSON.parse(localStorage.getItem("documents")) || [];
      const stillExists = allDocs.some(d => d.id === selectedDoc.id);
      if (!stillExists) {
        setApproveError("❌ This document no longer exists in storage (it may have been removed). Approval cancelled.");
        setApproving(false);
        return;
      }

      const { html, verifyUrl, caseId, issuedOn } = await generateVerificationReport(selectedDoc, hash);

      allDocs = allDocs.map(d => d.id === selectedDoc.id ? {
        ...d,
        status: "Approved",
        blockchainHash: hash,
        blockchainStoredAt: new Date().toISOString(),
        trustScore: report.trustScore,
        verificationVerdict: report.verdict,
        reportHtml: html,
        reportVerifyUrl: verifyUrl,
        reportCaseId: caseId,
        reportIssuedOn: issuedOn,
        reportSentToUser: false
      } : d);

      localStorage.setItem("documents", JSON.stringify(allDocs));
      setDocuments(allDocs.filter(d => d.authority === authority));

      const auditEntry = addAudit(
        `✅ APPROVED & STORED ON BLOCKCHAIN (Trust Score ${report.trustScore}/100)`,
        selectedDoc,
        {
          blockchainHash: hash,
          trustScore: report.trustScore,
          verdict: report.verdict,
          reportGenerated: true,
          reportVerifyUrl: verifyUrl,
          reportSentToUser: false
        }
      );

      // Open the classy printable report immediately for the authority
      const reportWindow = window.open("", "_blank");
      if (reportWindow) {
        reportWindow.document.write(html);
        reportWindow.document.close();
      }

      setSelectedDoc(null);
      setShowReportModal(false);
    } catch (err) {
      console.error("Approve failed:", err);
      setApproveError("❌ Approval failed: " + (err.message || "Unknown blockchain error. Please try again."));
    } finally {
      setApproving(false);
    }
  };

  // =========================================================
  // NEW — Send the generated report to the user's dashboard.
  // Writes into a per-user report inbox + pushes a notification
  // entry that UserDashboard's existing notification poller
  // already knows how to surface (same "documents" localStorage
  // status-change pattern, plus a dedicated userReports_ key).
  // =========================================================
  const sendReportToUser = (auditEntry) => {
    let allDocs = JSON.parse(localStorage.getItem("documents")) || [];
    const doc = allDocs.find(d => d.id === auditEntry.docId);
    if (!doc || !doc.reportHtml) return;

    const reportsKey = `userReports_${doc.user}`;
    let userReports = JSON.parse(localStorage.getItem(reportsKey)) || [];
    userReports.push({
      id: Date.now() + Math.random(),
      docId: doc.id,
      docName: doc.name,
      authority,
      sentAt: new Date().toISOString(),
      reportHtml: doc.reportHtml,
      verifyUrl: doc.reportVerifyUrl,
      caseId: doc.reportCaseId,
      trustScore: doc.trustScore,
      blockchainHash: doc.blockchainHash
    });
    localStorage.setItem(reportsKey, JSON.stringify(userReports));

    allDocs = allDocs.map(d => d.id === doc.id ? { ...d, reportSentToUser: true } : d);
    localStorage.setItem("documents", JSON.stringify(allDocs));
    setDocuments(allDocs.filter(d => d.authority === authority));

    // Reuse the existing per-authority notification channel style, but
    // targeted at the user via a parallel key the User Dashboard can poll.
    const userNotifKey = `userNotifications_${doc.user}`;
    let userNotifs = JSON.parse(localStorage.getItem(userNotifKey)) || [];
    userNotifs.push({
      id: Date.now(),
      message: `📑 Your verification report for "${doc.name}" is ready — Trust Score ${doc.trustScore}/100`,
      type: "report_ready",
      timestamp: new Date().toISOString(),
      docId: doc.id
    });
    localStorage.setItem(userNotifKey, JSON.stringify(userNotifs.slice(-20)));

    updateAuditEntry(auditEntry.id, { reportSentToUser: true, reportSentAt: new Date().toLocaleString() });
  };

  const handleReject = () => {
    const reason = prompt("Enter rejection reason:");
    if (reason) {
      incrementUserRejection(selectedDoc.user);
      updateStatus("Rejected");
      addAudit(`❌ REJECTED: ${reason} (Rejection #${userRejections[selectedDoc.user]?.count + 1 || 1})`, selectedDoc);
    }
  };

  const handleImageLoadReject = () => {
    incrementUserRejection(selectedDoc.user);
    updateStatus("Rejected");
    addAudit(`🚫 REJECTED: Image Load Failed`, selectedDoc);
  };

  const updateStatus = (status) => {
    let allDocs = JSON.parse(localStorage.getItem("documents")) || [];
    allDocs = allDocs.map(doc => doc.id === selectedDoc.id ? { ...doc, status } : doc);
    localStorage.setItem("documents", JSON.stringify(allDocs));
    setDocuments(allDocs.filter(d => d.authority === authority));
    addAudit(`${status.toUpperCase()} ✅`, selectedDoc);
    setSelectedDoc(null);
    setShowDocTypeSelector(false);
    setSelectedDocType("");
    setExtractedText("");
  };

  if (documents.length === 0) {
    return (
      <div className="auth-container" style={{ textAlign: 'center', padding: '100px 20px' }}>
        <h1 style={{ color: 'white' }}>🔐 Authority Console</h1>
        <div style={{ background: 'rgba(255,255,255,0.1)', padding: '40px', borderRadius: '20px', maxWidth: '500px', margin: '0 auto' }}>
          <h2 style={{ color: '#00ff88' }}>📋 No Documents</h2>
          <p style={{ color: 'rgba(255,255,255,0.8)' }}>Sample data loaded. Check Pending tab!</p>
        </div>
      </div>
    );
  }

  const analyticsData = getAnalyticsData();

  return (
    <div className="auth-container">
      <h1>🔐 Authority Console - AI Document Forensics</h1>

      <div className="stats">
        <div className="card yellow">{pending}<span>Pending</span></div>
        <div className="card blue">{total}<span>Total</span></div>
        <div className="card green">{approved}<span>Approved</span></div>
        <div className="card red">{rejected}<span>Rejected</span></div>
      </div>

      <div className="tab-buttons">
        <button className={tab === "pending" ? "active white-btn" : "white-btn"} onClick={() => setTab("pending")}>📋 Pending ({pending})</button>
        <button className={tab === "users" ? "active white-btn" : "white-btn"} onClick={() => setTab("users")}>👥 Users ({usersList.length})</button>
        <button className={tab === "blocked" ? "active white-btn" : "white-btn"} onClick={() => setTab("blocked")}>🚫 Blocked ({blockedUsersList.length})</button>
        <button className={tab === "audit" ? "active white-btn" : "white-btn"} onClick={() => setTab("audit")}>📊 Audit ({auditLogs.length})</button>
        <button className={tab === "analytics" ? "active white-btn" : "white-btn"} onClick={() => setTab("analytics")}>📈 Analytics</button>
      </div>

      {tab === "users" && (
        <div style={{ color: "white", padding: "20px" }}>
          <h2>👥 Users List ({usersList.length})</h2>
          {usersList.map((u, i) => (
            <div key={i} className={`user-item ${isUserBlocked(u) ? 'blocked-user' : ''}`} style={{ padding: "12px", borderBottom: "1px solid #444", marginBottom: "5px" }}>
              📧 {u}
              {userRejections[u] && <span style={{ marginLeft: '10px', color: '#ffaa00' }}>(Rejections: {userRejections[u].count})</span>}
              {isUserBlocked(u) && <span style={{ color: '#ff6b6b', marginLeft: '10px' }}>🚫 BLOCKED</span>}
            </div>
          ))}
        </div>
      )}

      {tab === "blocked" && (
        <div style={{ color: "white", padding: "20px" }}>
          <h2>🚫 Blocked Users ({blockedUsersList.length})</h2>
          {blockedUsersList.length === 0 ? <p>No blocked users yet.</p> : (
            <div className="blocked-users-list">
              {blockedUsersList.map(({ user, blockedAt, reason, rejectionCount }, i) => (
                <div key={i} className="blocked-user-card">
                  <div>
                    <strong>📧 {user}</strong>
                    <div style={{ color: '#ffaa00', fontSize: '14px' }}>Rejections: {rejectionCount} | Blocked: {blockedAt}</div>
                    {reason && <div style={{ color: '#ff6b6b', fontSize: '12px' }}>Reason: {reason}</div>}
                  </div>
                  <button className="unblock-btn" onClick={() => { if (window.confirm(`Unblock ${user}?`)) unblockUser(user); }}>✅ Unblock</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "audit" && (
        <div style={{ color: "white", padding: "20px" }}>
          <h2>📊 Audit Logs ({auditLogs.length})</h2>
          {/* UPDATED — richer audit table: shows blockchain hash + trust
              score + a "Send Report to User" action when a report exists
              and hasn't been sent yet. */}
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>User</th>
                <th>Blockchain / Trust</th>
                <th>Time</th>
                <th>Report</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.slice().reverse().map((l, i) => (
                <tr key={l.id || i}>
                  <td>{l.action}</td>
                  <td>{l.user}</td>
                  <td>
                    {l.blockchainHash ? (
                      <div style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                        ⛓️ {l.blockchainHash.slice(0, 10)}...
                        {typeof l.trustScore === 'number' && (
                          <div style={{ color: l.trustScore >= 70 ? '#10D9A0' : l.trustScore >= 40 ? '#F5A623' : '#FF4D6D' }}>
                            Trust: {l.trustScore}/100 {l.verdict ? `(${l.verdict})` : ''}
                          </div>
                        )}
                      </div>
                    ) : "—"}
                  </td>
                  <td>{l.time}</td>
                  <td>
                    {l.reportGenerated ? (
                      l.reportSentToUser ? (
                        <span style={{ color: '#10D9A0', fontSize: '12px' }}>✅ Sent to user{l.reportSentAt ? ` (${l.reportSentAt})` : ''}</span>
                      ) : (
                        <button
                          onClick={() => sendReportToUser(l)}
                          style={{ padding: '6px 12px', background: '#4a90e2', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}
                        >
                          📤 Send Report to User
                        </button>
                      )
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "analytics" && (
        <div className="analytics-container">
          <h2 style={{ color: '#00ff88', textAlign: 'center', marginBottom: '30px' }}>📈 AI Document Analytics Dashboard</h2>
          <div className="analytics-grid">
            <div className="chart-card">
              <h3>📊 Status Distribution</h3>
              <div className="pie-chart" style={{ background: `conic-gradient(#ff6b6b ${360 * (analyticsData.statusCounts.pending / total * 100) / 100}deg, #4a90e2 ${360 * (analyticsData.statusCounts.approved / total * 100) / 100}deg, #ffaa00 ${360 * (analyticsData.statusCounts.rejected / total * 100) / 100}deg)`, animation: 'spin 2s linear infinite' }}>
                <div className="pie-label">{Math.round((analyticsData.statusCounts.pending / total) * 100)}% Pending</div>
              </div>
              <div className="chart-legend">
                <div><span style={{ background: '#ff6b6b' }}></span>Pending: {analyticsData.statusCounts.pending}</div>
                <div><span style={{ background: '#4a90e2' }}></span>Approved: {analyticsData.statusCounts.approved}</div>
                <div><span style={{ background: '#ffaa00' }}></span>Rejected: {analyticsData.statusCounts.rejected}</div>
              </div>
            </div>
            <div className="chart-card">
              <h3>🚫 Blocked Users</h3>
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <div style={{ fontSize: '48px', color: '#ff6b6b' }}>{blockedUsersList.length}</div>
                <div style={{ color: '#ffaa00' }}>Total Blocked</div>
              </div>
            </div>
            <div className="chart-card">
              <h3>📋 Document Types</h3>
              <div className="bar-chart">
                {Object.entries(analyticsData.docTypes).map(([type, count], i) => (
                  <div key={i} className="bar-container">
                    <div className="bar-label">{type}</div>
                    <div className="bar" style={{ width: `${(count / Math.max(...Object.values(analyticsData.docTypes))) * 90}%`, background: `hsl(${i * 40}, 70%, 50%)` }}>{count}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="chart-card">
              <h3>👥 Top Users</h3>
              <div className="top-users">
                {analyticsData.topUsers.map((user, i) => (
                  <div key={i} className="user-rank">
                    <span className="rank">#{i + 1}</span>
                    <span className="user">{user.user}</span>
                    <span className="count">{user.count} docs</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="metrics-grid">
            <div className="metric-card green"><div className="metric-number">{approved}</div><div className="metric-label">✅ Approved</div></div>
            <div className="metric-card red"><div className="metric-number">{rejected}</div><div className="metric-label">❌ Rejected</div></div>
            <div className="metric-card blue"><div className="metric-number">{usersList.length}</div><div className="metric-label">👥 Unique Users</div></div>
            <div className="metric-card purple"><div className="metric-number">{blockedUsersList.length}</div><div className="metric-label">🚫 Blocked Users</div></div>
          </div>
        </div>
      )}

      {tab === "pending" && (
        <div className="doc-grid">
          {documents.filter(d => d.status === "Pending").map(doc => {
            const isBlocked = isUserBlocked(doc.user);
            const isPdf = !!doc.pdfRawData || doc.pageCount > 0;
            return (
              <div key={doc.id} className={`doc-card ${isBlocked ? 'blocked-doc' : ''}`}>
                <div className="doc-preview-small">
                  <img src={doc.previewData || doc.image || doc.thumbnailData} alt={doc.name} onError={(e) => { e.target.onerror = null; e.target.src = "https://via.placeholder.com/300x400/666/fff?text=No+Image"; }} />
                  {isPdf && <div className="pdf-badge">📄 PDF{doc.pageCount > 1 ? ` · ${doc.pageCount}p` : ''}</div>}
                </div>
                <h3>{doc.name}</h3>
                <p>👤 {doc.user}</p>
                {isBlocked && <div style={{ color: '#ff6b6b', fontSize: '12px', marginBottom: '10px' }}>🚫 USER BLOCKED</div>}
                <button className="scan-btn" onClick={() => setSelectedDoc(doc)} disabled={isBlocked}>{isBlocked ? "🚫 BLOCKED USER" : "🔍 Open & Verify"}</button>
              </div>
            );
          })}
        </div>
      )}

      {selectedDoc && (
        <>
          <div className="modal">
            <div className="modal-box">
              {(isScanning || forensicScanning) && (
                <div className="scan-overlay">
                  <div className="scan-overlay-line" style={{ top: `${scanProgress}%` }}><div className="scan-overlay-glow"></div></div>
                  <div className="scan-overlay-text">
                    {forensicScanning ? `🕵️ ${forensicStage}` : `🧠 SCANNING... ${Math.round(scanProgress)}%`}
                    {ocrProgress > 0 && !forensicScanning && <div className="scan-overlay-subtext">OCR: {ocrProgress}%</div>}
                  </div>
                  {forensicScanning && (
                    <button className="scan-cancel-btn" onClick={cancelForensicScan}>
                      ✕ Cancel Scan
                    </button>
                  )}
                </div>
              )}

              <button className="close-btn" onClick={() => { setSelectedDoc(null); setShowDocTypeSelector(false); setSelectedDocType(""); setExtractedText(""); setForensicIssuesChecked([]); setShowReportModal(false); setPageResults([]); setForensicError(null); setApproveError(null); }}>✕</button>

              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <h2 style={{ marginBottom: '10px' }}>📄 {selectedDoc.name}</h2>
                <p style={{ color: "#00ff88", fontSize: '16px' }}>👤 {selectedDoc.user}</p>
                {isUserBlocked(selectedDoc.user) && <div style={{ color: '#ff6b6b', fontSize: '14px', fontWeight: 'bold' }}>🚫 USER IS BLOCKED (3+ Rejections)</div>}
                {userRejections[selectedDoc.user] && <div style={{ color: '#ffaa00', fontSize: '12px' }}>Rejections: {userRejections[selectedDoc.user].count}/3</div>}
              </div>

              <div className="doc-preview-top">
                <img ref={imgRef} src={selectedDoc.renderedPreview || selectedDoc.scanImage || selectedDoc.previewData || selectedDoc.image || selectedDoc.thumbnailData} alt="Document Preview" className="top-preview-img" onError={(e) => { e.target.onerror = null; e.target.src = "https://via.placeholder.com/700x500/222/fff?text=Preview+Not+Available"; }} />
                <canvas ref={canvasRef} style={{ display: "none" }} />
                {isScanning && <div className="scan-line" style={{ top: `${scanProgress}%` }}><div className="scan-glow"></div></div>}
              </div>

              {selectedDoc.imageLoadFailed && !selectedDoc.verificationResult && (
                <div className="image-fail-modal">
                  <div style={{ background: 'rgba(255,107,107,0.3)', padding: '20px', borderRadius: '12px', borderLeft: '4px solid #ff6b6b', textAlign: 'center' }}>
                    <h3 style={{ color: '#ff6b6b', marginBottom: '10px' }}>🖼️ Document Failed to Load</h3>
                    <p style={{ color: 'white', marginBottom: '20px' }}>Cannot process document - file not accessible or unsupported format.</p>
                    <button className="reject-btn" onClick={handleImageLoadReject} style={{ marginRight: '10px' }}>❌ REJECT DOCUMENT</button>
                    <button className="close-btn" onClick={() => setSelectedDoc(null)}>✕ Close</button>
                  </div>
                </div>
              )}

              {!selectedDoc.imageLoadFailed && !selectedDoc.basicChecks && !showDocTypeSelector && (
                <button className="scan-btn-big" onClick={() => verifyDocument(selectedDoc)} disabled={isScanning || isUserBlocked(selectedDoc.user)}>
                  {isUserBlocked(selectedDoc.user) ? "🚫 BLOCKED USER" : isScanning ? `🧠 Scanning... ${Math.round(scanProgress)}%` : "🚀 Start Document Scan"}
                </button>
              )}

              {selectedDoc.basicChecks && showDocTypeSelector && !selectedDoc.verificationResult && !selectedDoc.imageLoadFailed && (
                <div className="doc-type-selector">
                  <h3 style={{ color: '#4a90e2', marginBottom: '15px' }}>📋 (Optional) What type of document is this?</h3>
                  <p style={{ color: '#aaa', fontSize: '13px', marginBottom: '15px' }}>This checks that expected fields are present and compares them against what's typically found on this document type. It's a completeness check, not the authenticity verdict — run the AI Forensic Scan below for that.</p>
                  {selectedDoc.extractedText && (
                    <div style={{ background: 'rgba(0,0,0,0.5)', padding: '15px', borderRadius: '10px', marginBottom: '20px', maxHeight: '150px', overflowY: 'auto', fontSize: '12px', fontFamily: 'monospace' }}>
                      <strong>📝 Extracted Text Preview:</strong><br />{selectedDoc.extractedText.substring(0, 300)}...
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '20px' }}>
                    {Object.entries(documentTypes).map(([key, docType]) => {
                      const textMatch = selectedDoc.extractedText ? checkTextContent(selectedDoc.extractedText, docType) : false;
                      return (
                        <button key={key} className={`doc-type-btn ${selectedDocType === key ? 'selected' : ''} ${textMatch ? 'text-match' : ''}`} onClick={() => setSelectedDocType(key)} style={{ borderColor: textMatch ? '#00ff88' : '' }}>
                          📄 {docType.name}
                          <div style={{ fontSize: '12px', opacity: 0.8 }}>{docType.checks.length} checks {textMatch && '✅'}</div>
                        </button>
                      );
                    })}
                  </div>
                  <button className="scan-btn-big" onClick={startDeepVerification} disabled={!selectedDocType || !selectedDoc.extractedText}>🚀 Run {documentTypes[selectedDocType]?.name} Completeness Check</button>
                  <button className="skip-btn" onClick={() => setShowDocTypeSelector(false)}>Skip → Go to Forensic Scan</button>
                </div>
              )}

              {selectedDoc.verificationResult && !selectedDoc.imageLoadFailed && (
                <div className="results-container">
                  <div style={{ background: selectedDoc.textMatch ? 'rgba(0,255,136,0.3)' : 'rgba(74,144,226,0.2)', padding: '15px', borderRadius: '12px', marginBottom: '20px', borderLeft: `4px solid ${selectedDoc.textMatch ? '#00ff88' : '#4a90e2'}`, textAlign: 'center' }}>
                    <strong>📋 Completeness: {selectedDoc.detectedType.name}</strong>
                    <div style={{ fontSize: '14px', color: '#ccc', marginTop: '5px' }}>{selectedDoc.detectedType.checks.length} expected fields checked</div>
                  </div>

                  {/* NEW — Extracted Fields vs Expected comparison table */}
                  {selectedDoc.fieldComparison && selectedDoc.fieldComparison.length > 0 && (
                    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
                      <h4 style={{ margin: '0 0 12px', color: '#4a90e2' }}>🔎 Extracted Fields vs Expected</h4>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                        <thead>
                          <tr style={{ color: '#9ca3af', textAlign: 'left' }}>
                            <th style={{ padding: '6px 4px' }}>Field</th>
                            <th style={{ padding: '6px 4px' }}>Expected Format</th>
                            <th style={{ padding: '6px 4px' }}>Found in OCR Text</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedDoc.fieldComparison.map((row, i) => (
                            <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                              <td style={{ padding: '8px 4px', color: '#e5e7eb' }}>{row.ok ? "✅" : "⚠️"} {row.label}</td>
                              <td style={{ padding: '8px 4px', color: '#9ca3af' }}>{row.expected}</td>
                              <td style={{ padding: '8px 4px', color: row.ok ? '#00ff88' : '#ff6b6b', fontFamily: 'monospace' }}>{row.found}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="checks-grid">
                    {selectedDoc.verificationResult.map((item, i) => (
                      <div key={i} className={`check-item ${item.value ? 'pass' : 'fail'}`}><span className="check-icon">{item.value ? "✅" : "❌"}</span><span>{item.name}</span></div>
                    ))}
                  </div>
                  {selectedDoc.verificationResult.filter(i => !i.value).length > 0 && (
                    <div className="issues-section">
                      <h4>⚠️ Missing Fields — Review:</h4>
                      {selectedDoc.verificationResult.filter(i => !i.value).map((item, i) => (
                        <label key={i} className="checkbox-item">
                          <input type="checkbox" checked={checkedIssues.includes(item.name)} onChange={(e) => { if (e.target.checked) setCheckedIssues([...checkedIssues, item.name]); else setCheckedIssues(checkedIssues.filter(x => x !== item.name)); }} />
                          <span style={{ color: '#ff6b6b' }}>{item.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="summary">
                    <div className="pass-count">✅ {selectedDoc.verificationResult.filter(i => i.value).length} Passed</div>
                    <div className="fail-count">❌ {selectedDoc.verificationResult.filter(i => !i.value).length} Failed</div>
                    <div className="pass-rate">📊 Completeness: {Math.round((selectedDoc.verificationResult.filter(i => i.value).length / selectedDoc.verificationResult.length) * 100)}%</div>
                  </div>
                </div>
              )}

              {pageResults.length > 1 && (
                <div style={{ margin: '25px 0', background: 'rgba(255,255,255,0.04)', padding: '20px', borderRadius: '14px' }}>
                  <h3>📑 Page-by-Page Analysis ({pageResults.length} pages)</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '14px', marginTop: '15px' }}>
                    {pageResults.map((p) => (
                      <div key={p.pageNumber} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <img src={p.thumbnail} alt={`Page ${p.pageNumber}`} style={{ width: '100%', height: '160px', objectFit: 'cover', display: 'block' }} />
                        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px', color: '#ccc' }}>
                          <span>Page {p.pageNumber}</span>
                          <span style={{ color: p.confidence >= 70 ? '#00ff9c' : p.confidence >= 40 ? '#ffcc00' : '#ff4d6d', fontWeight: 600 }}>{p.confidence}% OCR confidence</span>
                          <span>{p.wordCount} words read</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedDoc.basicChecks && !selectedDoc.imageLoadFailed && (
                <div className="forensic-section">
                  <div className="forensic-header">
                    <h3>🕵️ AI Forensic Authenticity Scan</h3>
                    {!selectedDoc.forensicReport && (
                      <button className="scan-btn-big forensic-scan-btn" onClick={() => startForensicScan(selectedDoc)} disabled={forensicScanning}>
                        {forensicScanning ? (forensicStage || "Scanning...") : "🚀 Run Deep Authenticity Scan"}
                      </button>
                    )}
                  </div>

                  {forensicError && !selectedDoc.forensicReport && (
                    <div style={{ background: 'rgba(255,77,109,0.15)', border: '1px solid #ff4d6d', color: '#ff4d6d', padding: '14px', borderRadius: '12px', marginTop: '14px', fontSize: '13px', lineHeight: 1.5 }}>
                      <strong>⚠️ Scan failed:</strong> {forensicError}
                      <div style={{ marginTop: '8px' }}>
                        <button onClick={() => startForensicScan(selectedDoc)} style={{ color: '#4a90e2', background: 'none', border: '1px solid #4a90e2', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer' }}>
                          🔁 Retry Scan
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedDoc.forensicReport && (
                    <div className={`forensic-report verdict-${selectedDoc.forensicReport.verdict.toLowerCase()}`}>
                      <div className="forensic-top-row">
                        <div className={`verdict-badge verdict-${selectedDoc.forensicReport.verdict.toLowerCase()}`}>
                          {selectedDoc.forensicReport.verdict === "REAL" && "✅ AUTHENTIC"}
                          {selectedDoc.forensicReport.verdict === "SUSPICIOUS" && "⚠️ SUSPICIOUS"}
                          {selectedDoc.forensicReport.verdict === "FAKE" && "❌ LIKELY FAKE"}
                        </div>
                        <div className="trust-score-ring" style={{ "--score": selectedDoc.forensicReport.trustScore }}>
                          <div className="trust-score-number">{selectedDoc.forensicReport.trustScore}</div>
                          <div className="trust-score-label">Trust Score / 100</div>
                        </div>
                      </div>

                      <button
                        onClick={() => setShowReportModal(true)}
                        style={{
                          display: 'block',
                          margin: '16px auto 0',
                          padding: '12px 28px',
                          background: 'linear-gradient(135deg, #4a90e2, #6a5acd)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '12px',
                          fontWeight: 700,
                          fontSize: '14px',
                          cursor: 'pointer'
                        }}
                      >
                        📊 View Full Report
                      </button>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>

          {showReportModal && selectedDoc.forensicReport && (
            <ReportModal
              doc={selectedDoc}
              onClose={() => setShowReportModal(false)}
              forensicIssuesChecked={forensicIssuesChecked}
              setForensicIssuesChecked={setForensicIssuesChecked}
              onApprove={handleApprove}
              onReject={handleReject}
              approveError={approveError}
              approving={approving}
            />
          )}
        </>
      )}
    </div>
  );
}

// =========================================================
// FULL FORENSIC REPORT MODAL — animated score ring + square
// breakdown cards for each detection category.
// =========================================================
function ReportModal({ doc, onClose, forensicIssuesChecked, setForensicIssuesChecked, onApprove, onReject, approveError, approving }) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const [manualVerified, setManualVerified] = useState(false);
  const [showRegions, setShowRegions] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [weights, setWeights] = useState({ completeness: 25, ela: 25, ink: 25, ai: 25 });
  const report = doc.forensicReport;
  const RADIUS = 70;
  const CIRC = 2 * Math.PI * RADIUS;

  const frameRef = useRef(null);
  const imgElRef = useRef(null);
  const [imgLayout, setImgLayout] = useState(null);

  const recomputeImgLayout = () => {
    const frame = frameRef.current;
    const imgEl = imgElRef.current;
    if (!frame || !imgEl) return;
    const frameRect = frame.getBoundingClientRect();
    const imgRect = imgEl.getBoundingClientRect();
    if (imgRect.width < 2 || imgRect.height < 2) return;
    setImgLayout({
      offsetX: imgRect.left - frameRect.left,
      offsetY: imgRect.top - frameRect.top,
      dispW: imgRect.width,
      dispH: imgRect.height
    });
  };

  useEffect(() => {
    recomputeImgLayout();
    const settleTimer = setTimeout(recomputeImgLayout, 420);

    const ro = new ResizeObserver(() => recomputeImgLayout());
    if (frameRef.current) ro.observe(frameRef.current);
    if (imgElRef.current) ro.observe(imgElRef.current);

    window.addEventListener("resize", recomputeImgLayout);
    return () => {
      clearTimeout(settleTimer);
      ro.disconnect();
      window.removeEventListener("resize", recomputeImgLayout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  useEffect(() => {
    let raf;
    const target = report.trustScore;
    const start = performance.now();
    const duration = 1000;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimatedScore(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [report.trustScore]);

  const verdictColor = report.verdict === "REAL" ? "#10D9A0" : report.verdict === "SUSPICIOUS" ? "#F5A623" : "#FF4D6D";
  const offset = CIRC - (animatedScore / 100) * CIRC;

  const categoryCards = [
    { key: "completeness", label: "Field Completeness", icon: "📋", pass: !doc.verificationResult || doc.verificationResult.filter(i => !i.value).length === 0, detail: doc.verificationResult ? `${doc.verificationResult.filter(i => i.value).length}/${doc.verificationResult.length} fields present` : "Not run" },
    { key: "ela", label: "Compression Analysis (ELA)", icon: "🧪", pass: report.categories?.ela?.pass !== false, detail: report.categories?.ela?.strongestRegion ? `Anomaly near: ${report.categories.ela.strongestRegion}` : "No localized anomalies" },
    { key: "ink", label: "Ink Consistency", icon: "🖊️", pass: report.categories?.inkOverlay?.pass !== false, detail: report.categories?.inkOverlay?.count ? `${report.categories.inkOverlay.count} hard-edge region(s) flagged` : "All ink matches scan/print pattern" },
    { key: "ai", label: "AI Visual Audit", icon: "🤖", pass: report.categories?.aiVision?.pass !== false, detail: report.categories?.aiVision?.issuesFound ? `${report.categories.aiVision.issuesFound} finding(s)` : "No visual anomalies" }
  ];

  const caseId = String(doc.id ?? "0000").padStart(4, "0");

  const completenessScore = doc.verificationResult
    ? Math.round((doc.verificationResult.filter(i => i.value).length / doc.verificationResult.length) * 100)
    : 100;
  const elaAnomalies = report.ela?.localizedAnomalies || [];
  const elaScore = Math.max(0, Math.min(100, Math.round(100 - (report.ela?.meanError || 0) * 3 - elaAnomalies.length * 8)));
  const inkFlags = report.inkOverlay || [];
  const topHardness = inkFlags.length ? Math.max(...inkFlags.map(t => t.hardnessScore)) : 0;
  const inkScore = Math.max(0, Math.min(100, Math.round(100 - inkFlags.length * 15 - topHardness * 30)));
  const aiScore = report.trustScore;

  const weightSum = weights.completeness + weights.ela + weights.ink + weights.ai || 1;
  const adjustedScore = Math.round(
    (completenessScore * weights.completeness + elaScore * weights.ela + inkScore * weights.ink + aiScore * weights.ai) / weightSum
  );
  const setWeight = (key, value) => setWeights(w => ({ ...w, [key]: Number(value) }));
  const adjustedColor = adjustedScore >= 70 ? "#10D9A0" : adjustedScore >= 40 ? "#F5A623" : "#FF4D6D";

  const srcW = report.sourceWidth || 1200;
  const srcH = report.sourceHeight || 1600;
  const elaTileW = srcW / 10;
  const elaTileH = srcH / 14;
  const inkTileSize = 20 * 2.5;
  const previewSrc = doc.renderedPreview || doc.scanImage || doc.previewData || doc.image;

  const parsePdfDate = (str) => {
    if (!str) return null;
    const m = /D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/.exec(str);
    if (!m) return null;
    const [, y, mo, d, h = "00", mi = "00", s = "00"] = m;
    const parsed = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`);
    return isNaN(parsed.getTime()) ? null : parsed;
  };
  const createdDate = parsePdfDate(report.pdfMetadata?.creationDate);
  const modifiedDate = parsePdfDate(report.pdfMetadata?.modDate);
  const timelineMismatch = createdDate && modifiedDate && Math.abs(modifiedDate - createdDate) > 60000;

  return (
    <div className="report-modal-overlay" onClick={onClose}>
      <style>{`
        .report-modal-overlay {
          position: fixed; inset: 0;
          background: radial-gradient(ellipse 70% 60% at 50% 20%, rgba(91,141,239,0.10), transparent), rgba(4,6,10,0.82);
          backdrop-filter: blur(8px);
          z-index: 999999; display: flex; align-items: center; justify-content: center;
          animation: overlayFade 0.3s ease; padding: 20px;
        }
        @keyframes overlayFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes popIn { from { transform: scale(0.9) translateY(10px); opacity: 0 } to { transform: scale(1) translateY(0); opacity: 1 } }
        @keyframes cardIn { from { transform: translateY(14px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes rowSlideIn { from { transform: translateX(-10px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes gridDrift { from { background-position: 0 0, 0 0; } to { background-position: 36px 36px, 36px 36px; } }
        @keyframes scanSweepOnce {
          0% { top: -6%; opacity: 0; }
          10% { opacity: 1; }
          88% { opacity: 1; }
          100% { top: 104%; opacity: 0; }
        }
        @keyframes bracketPulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
        @keyframes livePulseDot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.7); } }
        @keyframes blinkCursor { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
        @keyframes ringRotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes ringRotateRev { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
        @keyframes ringGlowPulse { 0%, 100% { filter: drop-shadow(0 0 4px var(--rc)) drop-shadow(0 0 0px var(--rc)); } 50% { filter: drop-shadow(0 0 14px var(--rc)) drop-shadow(0 0 26px var(--rc)); } }
        @keyframes pillShimmer { 0% { transform: translateX(-120%) skewX(-18deg); } 100% { transform: translateX(220%) skewX(-18deg); } }
        @keyframes badgeSettle { 0% { opacity: 0; transform: scale(0.85); } 65% { transform: scale(1.03); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes verifyBorderPulse { 0%, 100% { box-shadow: 0 0 0 1px rgba(16,217,160,0.25), 0 0 24px -8px rgba(16,217,160,0.35); } 50% { box-shadow: 0 0 0 1px rgba(16,217,160,0.5), 0 0 34px -6px rgba(16,217,160,0.6); } }

        .report-modal-box {
          position: relative;
          background:
            linear-gradient(rgba(16,217,160,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(16,217,160,0.05) 1px, transparent 1px),
            linear-gradient(165deg, #171b26, #101319);
          background-size: 34px 34px, 34px 34px, auto;
          animation: popIn 0.35s cubic-bezier(.16,1,.3,1), gridDrift 7s linear infinite;
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 22px;
          max-width: 780px; width: 100%; max-height: 90vh; overflow-y: auto; overflow-x: hidden;
          padding: 30px 30px 26px;
          box-shadow: 0 30px 90px -20px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.03);
        }
        .report-modal-box::-webkit-scrollbar { width: 8px; }
        .report-modal-box::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #10D9A0, #5B8DEF); border-radius: 6px; }

        .report-scan-sweep {
          position: absolute; left: 0; right: 0; height: 2px; z-index: 5; pointer-events: none;
          background: linear-gradient(90deg, transparent, #10D9A0, transparent);
          box-shadow: 0 0 18px #10D9A0, 0 0 34px rgba(16,217,160,0.6);
          animation: scanSweepOnce 1.9s cubic-bezier(.4,0,.2,1) 1;
        }

        .report-corner { position: absolute; width: 22px; height: 22px; border-color: rgba(16,217,160,0.55); pointer-events: none; animation: bracketPulse 2.6s ease-in-out infinite; z-index: 4; }
        .report-corner.tl { top: 10px; left: 10px; border-top: 2px solid; border-left: 2px solid; border-radius: 6px 0 0 0; }
        .report-corner.tr { top: 10px; right: 10px; border-top: 2px solid; border-right: 2px solid; border-radius: 0 6px 0 0; animation-delay: .2s; }
        .report-corner.bl { bottom: 10px; left: 10px; border-bottom: 2px solid; border-left: 2px solid; border-radius: 0 0 0 6px; animation-delay: .4s; }
        .report-corner.br { bottom: 10px; right: 10px; border-bottom: 2px solid; border-right: 2px solid; border-radius: 0 0 6px 0; animation-delay: .6s; }

        .report-close {
          position: absolute; top: 16px; right: 16px; z-index: 6;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: white;
          width: 34px; height: 34px; border-radius: 50%; cursor: pointer; font-size: 15px;
          transition: all 0.25s cubic-bezier(.16,1,.3,1);
        }
        .report-close:hover { background: #ff4d6d; border-color: #ff4d6d; transform: rotate(90deg); }

        .report-eyebrow {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.08em;
          color: #10D9A0; text-transform: uppercase; margin-bottom: 6px;
        }
        .report-eyebrow-dot { width: 7px; height: 7px; border-radius: 50%; background: #10D9A0; box-shadow: 0 0 0 3px rgba(16,217,160,0.18), 0 0 10px #10D9A0; animation: livePulseDot 1.8s ease-in-out infinite; }
        .report-cursor { animation: blinkCursor 1s step-start infinite; color: #10D9A0; }

        .report-title {
          color: white; text-align: center; margin: 0 0 22px; font-size: 21px; font-weight: 700;
          font-family: 'Space Grotesk', sans-serif; letter-spacing: -0.01em;
        }

        .report-ring-wrap { display: flex; justify-content: center; margin-bottom: 10px; position: relative; }
        .report-ring-glow { position: relative; width: 190px; height: 190px; display: flex; align-items: center; justify-content: center; }
        .report-ring-deco { position: absolute; inset: 0; animation: ringRotate 18s linear infinite; opacity: 0.55; }
        .report-ring-deco.rev { animation: ringRotateRev 26s linear infinite; opacity: 0.3; }
        .report-ring-core { position: relative; z-index: 2; animation: ringGlowPulse 2.4s ease-in-out infinite; }

        .report-pill-wrap { text-align: center; margin-bottom: 6px; }
        .report-verdict-pill {
          position: relative; overflow: hidden; text-align: center; font-weight: 700; font-size: 14.5px;
          padding: 9px 22px; border-radius: 30px; display: inline-block; margin: 4px auto 24px;
          font-family: 'Space Grotesk', sans-serif; letter-spacing: 0.02em;
          animation: badgeSettle 0.55s cubic-bezier(.16,1,.3,1) backwards; animation-delay: .1s;
        }
        .report-verdict-pill::after {
          content: ''; position: absolute; top: 0; left: 0; width: 40%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent);
          animation: pillShimmer 2.8s ease-in-out infinite; animation-delay: 1s;
        }

        .report-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 26px; }
        .report-card {
          position: relative; background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px; padding: 15px; overflow: hidden;
          animation: cardIn 0.45s cubic-bezier(.16,1,.3,1) backwards;
          transition: transform 0.3s cubic-bezier(.16,1,.3,1), border-color 0.3s, background 0.3s;
        }
        .report-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: var(--accent, #5B8DEF); opacity: 0.85; }
        .report-card:hover { transform: translateY(-3px); background: rgba(255,255,255,0.06); }
        .report-card:nth-child(1){animation-delay:.08s}.report-card:nth-child(2){animation-delay:.15s}.report-card:nth-child(3){animation-delay:.22s}.report-card:nth-child(4){animation-delay:.29s}
        .report-card-icon { font-size: 21px; }
        .report-card-label { color: #dfe3ea; font-size: 12.5px; font-weight: 600; margin-top: 8px; font-family: 'Inter', sans-serif; }
        .report-card-status { font-size: 11.5px; margin-top: 5px; font-weight: 700; font-family: 'JetBrains Mono', monospace; letter-spacing: 0.02em; }
        .report-card-detail { color: #8b95a7; font-size: 11px; margin-top: 5px; line-height: 1.45; }

        .report-reasons-title {
          color: white; font-size: 14.5px; margin: 20px 0 12px; font-family: 'Space Grotesk', sans-serif;
          display: flex; align-items: center; gap: 8px; letter-spacing: -0.005em;
        }
        .report-reason-row {
          position: relative; display: flex; gap: 10px; align-items: flex-start;
          background: rgba(255,255,255,0.035); padding: 11px 14px 11px 16px; border-radius: 10px; margin-bottom: 8px;
          animation: rowSlideIn 0.4s cubic-bezier(.16,1,.3,1) backwards; transition: background 0.2s;
          border-left: 2px solid var(--rowaccent, rgba(255,255,255,0.15));
        }
        .report-reason-row:hover { background: rgba(255,255,255,0.06); }
        .report-reason-row span.txt { color: #dfe3ea; font-size: 13px; line-height: 1.55; font-family: 'Inter', sans-serif; }
        .report-reason-row input[type="checkbox"] { margin-top: 2px; width: 16px; height: 16px; accent-color: #F5A623; cursor: pointer; flex-shrink: 0; }

        .manual-verify-box {
          margin-top: 26px; background: rgba(16,217,160,0.045); border: 1px solid rgba(16,217,160,0.25);
          border-radius: 16px; padding: 20px; position: relative; overflow: hidden;
          animation: cardIn 0.45s cubic-bezier(.16,1,.3,1) backwards, verifyBorderPulse 3s ease-in-out infinite;
          animation-delay: .3s, 0s;
        }
        .manual-verify-title {
          color: #10D9A0; font-size: 14.5px; font-weight: 700; margin: 0 0 10px;
          font-family: 'Space Grotesk', sans-serif; display: flex; align-items: center; gap: 8px;
        }
        .manual-verify-text { color: #b7bfcc; font-size: 12.5px; line-height: 1.65; margin: 0 0 15px; font-family: 'Inter', sans-serif; }
        .manual-verify-checkbox {
          display: flex; align-items: flex-start; gap: 10px; background: rgba(255,255,255,0.035);
          padding: 13px; border-radius: 10px; margin-bottom: 17px; cursor: pointer; transition: background 0.2s;
        }
        .manual-verify-checkbox:hover { background: rgba(255,255,255,0.06); }
        .manual-verify-checkbox input { margin-top: 2px; width: 17px; height: 17px; accent-color: #10D9A0; cursor: pointer; flex-shrink: 0; }
        .manual-verify-checkbox span { color: #dfe3ea; font-size: 12.5px; line-height: 1.55; font-family: 'Inter', sans-serif; }
        .manual-verify-actions { display: flex; gap: 12px; }
        .manual-approve-btn, .manual-reject-btn {
          flex: 1; padding: 14px; border-radius: 12px; border: none; font-weight: 700; font-size: 13.5px;
          cursor: pointer; transition: all 0.25s cubic-bezier(.16,1,.3,1); font-family: 'Space Grotesk', sans-serif;
          text-transform: uppercase; letter-spacing: 0.03em;
        }
        .manual-approve-btn:active:not(:disabled), .manual-reject-btn:active { transform: scale(0.97); }
        .manual-approve-btn { background: linear-gradient(135deg, #10D9A0, #0FBF8F); color: #04140c; box-shadow: 0 10px 26px -8px rgba(16,217,160,0.5); }
        .manual-approve-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 14px 32px -8px rgba(16,217,160,0.65); }
        .manual-approve-btn:disabled { opacity: 0.35; cursor: not-allowed; box-shadow: none; }
        .manual-reject-btn { background: rgba(255,77,109,0.12); color: #ff4d6d; border: 1px solid #ff4d6d; }
        .manual-reject-btn:hover { background: rgba(255,77,109,0.22); transform: translateY(-2px); }

        .approve-error-box {
          margin-top: 14px; background: rgba(255,77,109,0.12); border: 1px solid #ff4d6d;
          color: #ff9fae; padding: 12px 14px; border-radius: 10px; font-size: 12.5px; line-height: 1.5;
          font-family: 'Inter', sans-serif;
        }

        @media (max-width: 520px) {
          .report-cards { grid-template-columns: 1fr; }
          .report-modal-box { padding: 26px 18px 22px; }
        }
      `}</style>

      <div className="report-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="report-scan-sweep"></div>
        <div className="report-corner tl"></div>
        <div className="report-corner tr"></div>
        <div className="report-corner bl"></div>
        <div className="report-corner br"></div>

        <button className="report-close" onClick={onClose}>✕</button>

        <div className="report-eyebrow">
          <span className="report-eyebrow-dot"></span>
          FORENSIC ANALYSIS · CASE #{caseId}
          <span className="report-cursor">_</span>
        </div>
        <h2 className="report-title">📊 Full Authenticity Report</h2>

        <div className="report-ring-wrap">
          <div className="report-ring-glow" style={{ "--rc": verdictColor }}>
            <svg className="report-ring-deco" width="190" height="190" viewBox="0 0 190 190">
              <circle cx="95" cy="95" r="88" fill="none" stroke={verdictColor} strokeOpacity="0.25" strokeWidth="1" strokeDasharray="1 7" strokeLinecap="round" />
            </svg>
            <svg className="report-ring-deco rev" width="190" height="190" viewBox="0 0 190 190">
              <circle cx="95" cy="95" r="82" fill="none" stroke={verdictColor} strokeOpacity="0.18" strokeWidth="1" strokeDasharray="0.5 10" strokeLinecap="round" />
            </svg>
            <svg className="report-ring-core" width="180" height="180" viewBox="0 0 180 180">
              <circle cx="90" cy="90" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="14" />
              <circle
                cx="90" cy="90" r={RADIUS} fill="none"
                stroke={verdictColor} strokeWidth="14" strokeLinecap="round"
                strokeDasharray={CIRC} strokeDashoffset={offset}
                transform="rotate(-90 90 90)"
                style={{ transition: "stroke-dashoffset 0.15s linear" }}
              />
              <text x="90" y="84" textAnchor="middle" fontSize="34" fontWeight="800" fill="white" fontFamily="'JetBrains Mono', monospace">{animatedScore}</text>
              <text x="90" y="106" textAnchor="middle" fontSize="10.5" fill="#8b95a7" letterSpacing="1.5" fontFamily="'Inter', sans-serif">TRUST SCORE</text>
            </svg>
          </div>
        </div>

        <div className="report-pill-wrap">
          <span className="report-verdict-pill" style={{ background: `${verdictColor}22`, color: verdictColor, border: `1px solid ${verdictColor}`, boxShadow: `0 0 26px -8px ${verdictColor}` }}>
            {report.verdict === "REAL" && "✅ AUTHENTIC"}
            {report.verdict === "SUSPICIOUS" && "⚠️ SUSPICIOUS — MANUAL REVIEW"}
            {report.verdict === "FAKE" && "❌ LIKELY FAKE"}
          </span>
        </div>

        <div className="report-cards">
          {categoryCards.map(c => (
            <div className="report-card" key={c.key} style={{ "--accent": c.pass ? "#10D9A0" : "#FF4D6D", borderColor: c.pass ? "rgba(16,217,160,0.22)" : "rgba(255,77,109,0.32)" }}>
              <div className="report-card-icon">{c.icon}</div>
              <div className="report-card-label">{c.label}</div>
              <div className="report-card-status" style={{ color: c.pass ? "#10D9A0" : "#ff4d6d" }}>{c.pass ? "✅ Passed" : "⚠️ Flagged"}</div>
              <div className="report-card-detail">{c.detail}</div>
            </div>
          ))}
        </div>

        <div className="visual-inspect-block">
          <div className="visual-inspect-header">
            <h3 className="report-reasons-title" style={{ margin: 0 }}>🔍 Visual Inspection</h3>
            <div className="visual-toggle-group">
              <button className={`visual-toggle-btn ${showRegions ? "active" : ""}`} onClick={() => setShowRegions(s => !s)}>
                🎯 {showRegions ? "Hide" : "Highlight"} Flagged Regions
              </button>
              <button className={`visual-toggle-btn heat ${showHeatmap ? "active" : ""}`} onClick={() => setShowHeatmap(s => !s)}>
                🌡️ {showHeatmap ? "Hide" : "Show"} ELA Heatmap
              </button>
            </div>
          </div>

          <div className="visual-inspect-frame" ref={frameRef} style={{ position: "relative" }}>
            <img
              src={previewSrc}
              alt="Document"
              className="visual-inspect-img"
              ref={imgElRef}
              onLoad={recomputeImgLayout}
            />

            {showHeatmap && imgLayout && elaAnomalies.map((t, i) => (
              <div
                key={`ela-heat-${i}`}
                className="heatmap-tile"
                style={{
                  position: "absolute",
                  left: `${imgLayout.offsetX + (t.x / srcW) * imgLayout.dispW}px`,
                  top: `${imgLayout.offsetY + (t.y / srcH) * imgLayout.dispH}px`,
                  width: `${Math.max(2, (elaTileW / srcW) * imgLayout.dispW)}px`,
                  height: `${Math.max(2, (elaTileH / srcH) * imgLayout.dispH)}px`,
                  background: `rgba(255, ${Math.max(0, 170 - t.anomalyScore * 3)}, 0, ${Math.min(0.65, 0.2 + t.anomalyScore / 90)})`,
                  animationDelay: `${i * 0.05}s`,
                  pointerEvents: "none"
                }}
              ></div>
            ))}

            {showRegions && imgLayout && inkFlags.map((t, i) => (
              <div
                key={`ink-box-${i}`}
                className="region-box ink"
                style={{
                  position: "absolute",
                  left: `${imgLayout.offsetX + (t.x / srcW) * imgLayout.dispW}px`,
                  top: `${imgLayout.offsetY + (t.y / srcH) * imgLayout.dispH}px`,
                  width: `${Math.max(6, (inkTileSize / srcW) * imgLayout.dispW)}px`,
                  height: `${Math.max(6, (inkTileSize / srcH) * imgLayout.dispH)}px`,
                  animationDelay: `${i * 0.06}s`,
                  pointerEvents: "none"
                }}
              >
                <span className="region-tag" style={{ position: "absolute", top: "-22px", left: 0, whiteSpace: "nowrap" }}>✍️ Ink</span>
              </div>
            ))}

            {showRegions && imgLayout && elaAnomalies.slice(0, 5).map((t, i) => (
              <div
                key={`ela-box-${i}`}
                className="region-box ela"
                style={{
                  position: "absolute",
                  left: `${imgLayout.offsetX + (t.x / srcW) * imgLayout.dispW}px`,
                  top: `${imgLayout.offsetY + (t.y / srcH) * imgLayout.dispH}px`,
                  width: `${Math.max(6, (elaTileW / srcW) * imgLayout.dispW)}px`,
                  height: `${Math.max(6, (elaTileH / srcH) * imgLayout.dispH)}px`,
                  animationDelay: `${(i + inkFlags.length) * 0.06}s`,
                  pointerEvents: "none"
                }}
              >
                <span className="region-tag" style={{ position: "absolute", top: "-22px", left: 0, whiteSpace: "nowrap" }}>🧪 ELA</span>
              </div>
            ))}

            {!imgLayout && (showRegions || showHeatmap) && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#8b95a7", fontSize: "12px", pointerEvents: "none" }}>
                Measuring image…
              </div>
            )}
          </div>

          {showRegions && imgLayout && inkFlags.length === 0 && elaAnomalies.length === 0 && (
            <div className="visual-inspect-empty" style={{ color: "#10D9A0" }}>✅ No flagged regions — ink strokes and compression patterns look consistent with a genuine scan.</div>
          )}
          {showHeatmap && imgLayout && elaAnomalies.length === 0 && (
            <div className="visual-inspect-empty" style={{ color: "#10D9A0" }}>✅ No compression anomalies — nothing to heat-map, this image reads as clean.</div>
          )}

          <div className="visual-inspect-legend">
            <span><i className="legend-dot ink"></i> Ink inconsistency (hard-edged, non-scanned strokes)</span>
            <span><i className="legend-dot ela"></i> Compression anomaly (possible edited region)</span>
          </div>
        </div>

        <div className="weight-adjust-block">
          <h3 className="report-reasons-title" style={{ margin: "0 0 8px" }}>🎚️ Adjust Trust Weighting</h3>
          <p className="weight-adjust-sub">
            Drag to re-weigh how much each signal contributes to the score and watch it recalculate live.
            This is an exploratory view for the reviewer — it doesn't change the official AI verdict above.
          </p>

          <div className="weight-live-score">
            <span className="weight-live-number" style={{ color: adjustedColor }}>{adjustedScore}</span>
            <span className="weight-live-label">/ 100 recalculated score</span>
          </div>

          {[
            { key: "completeness", label: "📋 Completeness", raw: completenessScore, color: "#5B8DEF" },
            { key: "ela", label: "🧪 ELA", raw: elaScore, color: "#F5A623" },
            { key: "ink", label: "🖊️ Ink", raw: inkScore, color: "#9B7EF0" },
            { key: "ai", label: "🤖 AI Audit", raw: aiScore, color: "#10D9A0" },
          ].map(row => (
            <div className="weight-row" key={row.key}>
              <div className="weight-row-top">
                <span className="weight-row-label" style={{ color: row.color }}>{row.label}</span>
                <span className="weight-row-raw">raw: {row.raw}/100</span>
                <span className="weight-row-val">{weights[row.key]}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={weights[row.key]}
                onChange={(e) => setWeight(row.key, e.target.value)}
                className="weight-slider"
                style={{ "--fill": row.color }}
              />
            </div>
          ))}
        </div>

        <div className="metadata-timeline-block">
          <h3 className="report-reasons-title" style={{ margin: "0 0 4px" }}>🕰️ File Metadata Timeline</h3>
          {report.isPdf ? (
            (report.pdfMetadata?.creationDate || report.pdfMetadata?.modDate) ? (
              <>
                <div className={`meta-timeline ${timelineMismatch ? "mismatch" : ""}`}>
                  <div className="meta-timeline-track">
                    <div className="meta-timeline-dot start"></div>
                    <div className="meta-timeline-line"></div>
                    <div className="meta-timeline-dot end"></div>
                  </div>
                  <div className="meta-timeline-labels">
                    <div>
                      <div className="meta-timeline-tag">CREATED</div>
                      <div className="meta-timeline-date">{createdDate ? createdDate.toLocaleString() : (report.pdfMetadata?.creationDate || "Unknown")}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="meta-timeline-tag">LAST MODIFIED</div>
                      <div className="meta-timeline-date">{modifiedDate ? modifiedDate.toLocaleString() : (report.pdfMetadata?.modDate || "Unknown")}</div>
                    </div>
                  </div>
                  {timelineMismatch && (
                    <div className="meta-timeline-warning">
                      ⚠️ File was re-saved {Math.round(Math.abs(modifiedDate - createdDate) / 60000)} minute(s) after creation — it was opened and edited after being first generated.
                    </div>
                  )}
                  {!timelineMismatch && createdDate && modifiedDate && (
                    <div className="meta-timeline-ok">✅ Creation and last-modified timestamps match — no post-generation edits detected in the file metadata.</div>
                  )}
                </div>
              </>
            ) : (
              <div className="meta-timeline-empty">No embedded creation/modification timestamps were found in this file's metadata.</div>
            )
          ) : (
            <div className="meta-timeline-empty">This document was uploaded as an image, so there's no embedded file metadata (creation/modified timestamps) to show — this timeline applies to PDF uploads only.</div>
          )}
          {report.isPdf && (
            <div className="meta-tool-row">
              <span className="meta-tool-tag">Producer: {report.pdfMetadata?.producer || "Unknown"}</span>
              <span className="meta-tool-tag">Creator: {report.pdfMetadata?.creator || "Unknown"}</span>
            </div>
          )}
        </div>

        {report.reasons.length > 0 && (
          <>
            <h3 className="report-reasons-title">🧠 Why this verdict</h3>
            {report.reasons.map((reason, i) => (
              <div className="report-reason-row" key={i} style={{ "--rowaccent": report.verdict === "FAKE" ? "#FF4D6D" : report.verdict === "SUSPICIOUS" ? "#F5A623" : "#10D9A0", animationDelay: `${i * 0.06}s` }}>
                {report.verdict === "SUSPICIOUS" ? (
                  <input type="checkbox" checked={forensicIssuesChecked.includes(reason)} onChange={(e) => {
                    if (e.target.checked) setForensicIssuesChecked([...forensicIssuesChecked, reason]);
                    else setForensicIssuesChecked(forensicIssuesChecked.filter(x => x !== reason));
                  }} />
                ) : <span>{report.verdict === "FAKE" ? "❌" : "✅"}</span>}
                <span className="txt">{reason}</span>
              </div>
            ))}
          </>
        )}

        {report.metadataFlags?.length > 0 && (
          <>
            <h3 className="report-reasons-title">📋 File Metadata Flags</h3>
            {report.metadataFlags.map((f, i) => <div className="report-reason-row" key={i} style={{ "--rowaccent": "#F5A623", animationDelay: `${i * 0.06}s` }}><span>🚩</span><span className="txt">{f}</span></div>)}
          </>
        )}

        <div className="manual-verify-box">
          <h3 className="manual-verify-title">🧑‍⚖️ Manual Verification</h3>
          <p className="manual-verify-text">
            The automated forensic scan above checks compression artifacts, ink consistency,
            and visual anomalies, and gives a strong signal — but the final call always rests
            with the reviewing authority. Please go through the trust score, verdict, and any
            flagged findings once more before signing off. Once you're satisfied this document
            genuinely matches the institution's records, confirm below to proceed. Approving
            will store the document's hash on the blockchain and generate a downloadable
            verification report with a QR code, automatically.
          </p>
          <label className="manual-verify-checkbox">
            <input type="checkbox" checked={manualVerified} onChange={(e) => setManualVerified(e.target.checked)} />
            <span>I have reviewed this document and the forensic findings above, and I confirm it is verified well by the organisation.</span>
          </label>
          <div className="manual-verify-actions">
            <button className="manual-approve-btn" disabled={!manualVerified || approving} onClick={onApprove}>
              {approving ? "⏳ Approving..." : "✅ APPROVE & STORE ON BLOCKCHAIN"}
            </button>
            <button className="manual-reject-btn" onClick={onReject} disabled={approving}>❌ REJECT DOCUMENT</button>
          </div>
          {approveError && (
            <div className="approve-error-box">⚠️ {approveError}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AuthorityDashboard;
