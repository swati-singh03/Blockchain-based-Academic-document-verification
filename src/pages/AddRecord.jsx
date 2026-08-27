import React, { useEffect, useState, useRef } from "react";
import "./AuthorityDashboard.css";
import Tesseract from 'tesseract.js';
import { ethers } from "ethers";
import { registerHash } from "../blockchain";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// =========================================================
// DIGITAL INK OVERLAY DETECTOR (fast, single pass, O(n))
// Scanned/printed ink always has soft grayscale transitions
// (scan blur + JPEG). Paint/pen-tool strokes are hard-edged
// and non-anti-aliased. This flags that mismatch.
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
  const [forensicError, setForensicError] = useState(null); // NEW: visible error instead of alert()

  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const cancelRef = useRef(false); // NEW: lets the Cancel button stop a stuck scan

  // NEW: races any promise against a timeout so a hung network call or OCR
  // worker can never freeze the UI forever — it now fails with a clear message.
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
    addAudit(`🚫 AUTO BLOCKED: ${user} (3+ rejections)`, { user });
  };
  const unblockUser = (user) => {
    const updatedBlocked = { ...blockedUsers };
    delete updatedBlocked[user];
    localStorage.setItem("blockedUsers", JSON.stringify(updatedBlocked));
    const updatedRejections = { ...userRejections };
    delete updatedRejections[user];
    saveUserRejections(updatedRejections);
    addAudit(`✅ UNBLOCKED: ${user}`, { user });
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

  const addAudit = (action, doc) => {
    let logs = JSON.parse(localStorage.getItem("audit")) || [];
    logs.push({ action, docId: doc.id, user: doc.user, authority, time: new Date().toLocaleString() });
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
      // NEW: surface the actual backend error text instead of a bare status code
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

  const extractTextFromImage = async (imageSrc) => {
    try {
      setOcrProgress(0);
      const { data: { text } } = await Tesseract.recognize(imageSrc, 'eng', { logger: m => { if (m.status === 'recognizing text') setOcrProgress(Math.round(m.progress * 100)); } });
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
              extractedText = await extractTextFromImage(canvas.toDataURL());
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
        setSelectedDoc(prev => ({ ...prev, verificationResult: checks, detectedType: docType, textMatch: checkTextContent(selectedDoc.extractedText, docType) }));
        setShowDocTypeSelector(false);
        setSelectedDocType("");
        addAudit(`📋 Completeness Checked: ${docType.name}`, selectedDoc);
        setIsScanning(false);
      }
    }, 400);
  };

  const startForensicScan = async (doc) => {
    cancelRef.current = false; // NEW: reset cancel flag for this run
    setForensicScanning(true);
    setForensicIssuesChecked([]);
    setShowReportModal(false);
    setForensicError(null); // NEW: clear any previous error before retry

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
      // NEW: Tesseract's worker download/init can hang silently on a slow or
      // blocked network — this used to freeze the whole scan with no error.
      const ocrTextForForensics = doc.extractedText || await withTimeout(extractTextFromImage(workCanvas.toDataURL()), 45000, "OCR text extraction");
      if (cancelRef.current) return;

      setForensicStage("🧪 Running Error Level Analysis...");
      const elaResult = await withTimeout(computeELA(workCanvas, 90), 20000, "Error Level Analysis");
      if (cancelRef.current) return;

      setForensicStage("🖊️ Checking for digital ink overlays...");
      const inkOverlay = detectDigitalInkOverlay(workCanvas);
      console.log("🖊️ Ink overlay flags:", inkOverlay);

      setForensicStage("📋 Checking file metadata...");
      const metadataAnalysis = analyzePdfMetadata(pdfMetadata);

      setForensicStage("🤖 Comparing document regions with AI...");
      // NEW: this is the step most likely to hang if the backend isn't
      // reachable — now fails after 30s instead of forever.
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
      };

      setSelectedDoc(prev => ({ ...prev, forensicReport, renderedPreview: renderedDataUrl }));
      addAudit(`🕵️ AI FORENSIC SCAN: ${forensicReport.verdict} (${forensicReport.trustScore}/100)`, doc);

    } catch (err) {
      // NEW: was alert(...) — silently swallowed in iframes/embedded previews with
      // no "allow-modals" permission, which looked exactly like "no report generates".
      if (cancelRef.current) return; // don't show an error for a user-triggered cancel
      console.error("Forensic scan failed:", err);
      setForensicError(err.message || "Unknown error during forensic scan.");
    } finally {
      if (!cancelRef.current) {
        setForensicScanning(false);
        setForensicStage("");
      }
    }
  };

  // NEW: escape hatch — stops showing the blocking overlay even if the
  // underlying promise chain never settles, so the user is never trapped.
  const cancelForensicScan = () => {
    cancelRef.current = true;
    setForensicScanning(false);
    setIsScanning(false);
    setForensicStage("");
    setForensicError("Scan cancelled.");
  };

  const handleApprove = async () => {
    const failed = selectedDoc.verificationResult?.filter(i => !i.value) || [];
    if (failed.length > 0 && failed.length !== checkedIssues.length) { alert("⚠️ Review all failed completeness checks first!"); return; }
    const report = selectedDoc.forensicReport;
    if (!report) { alert("⚠️ Please run the AI Forensic Authenticity Scan before approving."); return; }
    if (report.verdict === "FAKE") { alert("❌ This document was flagged as FAKE by the forensic scan and cannot be approved."); return; }
    if (report.verdict === "SUSPICIOUS" && forensicIssuesChecked.length !== report.reasons.length) { alert("⚠️ Please review every flagged forensic concern before approving a SUSPICIOUS document."); return; }

    try {
      const hash = selectedDoc.originalHash;
      await registerHash(hash);
      let allDocs = JSON.parse(localStorage.getItem("documents")) || [];
      allDocs = allDocs.map(doc => doc.id === selectedDoc.id ? { ...doc, status: "Approved", blockchainHash: hash, trustScore: report.trustScore } : doc);
      localStorage.setItem("documents", JSON.stringify(allDocs));
      setDocuments(allDocs.filter(d => d.authority === authority));
      addAudit(`✅ APPROVED (Trust Score ${report.trustScore}/100) + STORED ON BLOCKCHAIN`, selectedDoc);
      alert("✅ Document Approved & Stored on Blockchain");
      setSelectedDoc(null);
    } catch (err) { console.error(err); alert("❌ Blockchain error"); }
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
          <table>
            <thead><tr><th>Action</th><th>User</th><th>Time</th></tr></thead>
            <tbody>{auditLogs.map((l, i) => (<tr key={i}><td>{l.action}</td><td>{l.user}</td><td>{l.time}</td></tr>))}</tbody>
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
          {(isScanning || forensicScanning) && (
            <div className="full-page-scan-overlay">
              <div className="full-scan-line" style={{ top: `${scanProgress}%`, boxShadow: '0 0 20px #00ff88, 0 0 40px #00ff88' }}><div className="scan-glow-full"></div></div>
              <div className="scan-progress-text">
                {forensicScanning ? `🕵️ ${forensicStage}` : `🧠 SCANNING... ${Math.round(scanProgress)}%`}
                {ocrProgress > 0 && !forensicScanning && <div style={{ fontSize: '12px' }}>OCR: {ocrProgress}%</div>}
              </div>
              {/* NEW: escape hatch so a hung scan never traps the user behind this overlay */}
              {forensicScanning && (
                <button
                  onClick={cancelForensicScan}
                  style={{ position: 'absolute', top: '24px', right: '24px', background: 'rgba(255,255,255,0.12)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '10px', padding: '8px 18px', cursor: 'pointer', fontSize: '13px', zIndex: 10 }}
                >
                  ✕ Cancel Scan
                </button>
              )}
            </div>
          )}

          <div className="modal">
            <div className="modal-box">
              <button className="close-btn" onClick={() => { setSelectedDoc(null); setShowDocTypeSelector(false); setSelectedDocType(""); setExtractedText(""); setForensicIssuesChecked([]); setShowReportModal(false); setPageResults([]); setForensicError(null); }}>✕</button>

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
                  <p style={{ color: '#aaa', fontSize: '13px', marginBottom: '15px' }}>This checks that expected fields are present. It's a completeness check, not the authenticity verdict — run the AI Forensic Scan below for that.</p>
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

                  {/* NEW: visible error box — this replaces the old silent alert() failure */}
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
function ReportModal({ doc, onClose, forensicIssuesChecked, setForensicIssuesChecked, onApprove, onReject }) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const [manualVerified, setManualVerified] = useState(false); // NEW: gate for manual verification
  const report = doc.forensicReport;
  const RADIUS = 70;
  const CIRC = 2 * Math.PI * RADIUS;

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

  const verdictColor = report.verdict === "REAL" ? "#00ff88" : report.verdict === "SUSPICIOUS" ? "#ffaa00" : "#ff4d6d";
  const offset = CIRC - (animatedScore / 100) * CIRC;

  const categoryCards = [
    { key: "completeness", label: "Field Completeness", icon: "📋", pass: !doc.verificationResult || doc.verificationResult.filter(i => !i.value).length === 0, detail: doc.verificationResult ? `${doc.verificationResult.filter(i => i.value).length}/${doc.verificationResult.length} fields present` : "Not run" },
    { key: "ela", label: "Compression Analysis (ELA)", icon: "🧪", pass: report.categories?.ela?.pass !== false, detail: report.categories?.ela?.strongestRegion ? `Anomaly near: ${report.categories.ela.strongestRegion}` : "No localized anomalies" },
    { key: "ink", label: "Ink Consistency", icon: "🖊️", pass: report.categories?.inkOverlay?.pass !== false, detail: report.categories?.inkOverlay?.count ? `${report.categories.inkOverlay.count} hard-edge region(s) flagged` : "All ink matches scan/print pattern" },
    { key: "ai", label: "AI Visual Audit", icon: "🤖", pass: report.categories?.aiVision?.pass !== false, detail: report.categories?.aiVision?.issuesFound ? `${report.categories.aiVision.issuesFound} finding(s)` : "No visual anomalies" }
  ];

  return (
    <div className="report-modal-overlay" onClick={onClose}>
      <style>{`
        .report-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(6px); z-index: 999; display: flex; align-items: center; justify-content: center; animation: fadeIn 0.25s ease; }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes popIn { from { transform: scale(0.92); opacity: 0 } to { transform: scale(1); opacity: 1 } }
        @keyframes cardIn { from { transform: translateY(14px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        .report-modal-box { background: #14161c; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; max-width: 640px; width: 92%; max-height: 88vh; overflow-y: auto; padding: 28px; animation: popIn 0.3s cubic-bezier(.2,.8,.2,1); box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
        .report-close { float: right; background: rgba(255,255,255,0.08); border: none; color: white; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 16px; }
        .report-close:hover { background: rgba(255,255,255,0.18); }
        .report-title { color: white; text-align: center; margin: 0 0 20px; font-size: 20px; }
        .report-ring-wrap { display: flex; justify-content: center; margin-bottom: 8px; }
        .report-verdict-pill { text-align: center; font-weight: 700; font-size: 15px; padding: 6px 18px; border-radius: 20px; display: inline-block; margin: 4px auto 22px; }
        .report-pill-wrap { text-align: center; }
        .report-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
        .report-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 14px; animation: cardIn 0.4s ease backwards; }
        .report-card:nth-child(1){animation-delay:.05s}.report-card:nth-child(2){animation-delay:.1s}.report-card:nth-child(3){animation-delay:.15s}.report-card:nth-child(4){animation-delay:.2s}
        .report-card-icon { font-size: 22px; }
        .report-card-label { color: #ddd; font-size: 13px; font-weight: 600; margin-top: 6px; }
        .report-card-status { font-size: 12px; margin-top: 4px; font-weight: 700; }
        .report-card-detail { color: #999; font-size: 11px; margin-top: 4px; line-height: 1.4; }
        .report-reasons-title { color: white; font-size: 15px; margin: 18px 0 10px; }
        .report-reason-row { display: flex; gap: 10px; align-items: flex-start; background: rgba(255,255,255,0.03); padding: 10px 12px; border-radius: 10px; margin-bottom: 8px; }
        .report-reason-row span.txt { color: #ddd; font-size: 13px; line-height: 1.5; }
        .manual-verify-box { margin-top: 24px; background: rgba(0,255,136,0.05); border: 1px solid rgba(0,255,136,0.25); border-radius: 14px; padding: 18px; animation: cardIn 0.4s ease backwards; animation-delay: .25s; }
        .manual-verify-title { color: #00ff88; font-size: 15px; font-weight: 700; margin: 0 0 10px; }
        .manual-verify-text { color: #ccc; font-size: 13px; line-height: 1.6; margin: 0 0 14px; }
        .manual-verify-checkbox { display: flex; align-items: flex-start; gap: 10px; background: rgba(255,255,255,0.03); padding: 12px; border-radius: 10px; margin-bottom: 16px; cursor: pointer; }
        .manual-verify-checkbox span { color: #ddd; font-size: 13px; line-height: 1.5; }
        .manual-verify-actions { display: flex; gap: 12px; }
        .manual-approve-btn, .manual-reject-btn { flex: 1; padding: 13px; border-radius: 12px; border: none; font-weight: 700; font-size: 14px; cursor: pointer; transition: opacity 0.2s, transform 0.1s; }
        .manual-approve-btn:active, .manual-reject-btn:active { transform: scale(0.98); }
        .manual-approve-btn { background: linear-gradient(135deg, #00ff88, #00b368); color: #04140c; }
        .manual-approve-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .manual-reject-btn { background: rgba(255,77,109,0.15); color: #ff4d6d; border: 1px solid #ff4d6d; }
      `}</style>

      <div className="report-modal-box" onClick={(e) => e.stopPropagation()}>
        <button className="report-close" onClick={onClose}>✕</button>
        <h2 className="report-title">📊 Full Authenticity Report</h2>

        <div className="report-ring-wrap">
          <svg width="180" height="180" viewBox="0 0 180 180">
            <circle cx="90" cy="90" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="14" />
            <circle
              cx="90" cy="90" r={RADIUS} fill="none"
              stroke={verdictColor} strokeWidth="14" strokeLinecap="round"
              strokeDasharray={CIRC} strokeDashoffset={offset}
              transform="rotate(-90 90 90)"
              style={{ transition: "stroke-dashoffset 0.15s linear" }}
            />
            <text x="90" y="84" textAnchor="middle" fontSize="34" fontWeight="800" fill="white">{animatedScore}</text>
            <text x="90" y="106" textAnchor="middle" fontSize="11" fill="#999">TRUST SCORE</text>
          </svg>
        </div>

        <div className="report-pill-wrap">
          <span className="report-verdict-pill" style={{ background: `${verdictColor}22`, color: verdictColor, border: `1px solid ${verdictColor}` }}>
            {report.verdict === "REAL" && "✅ AUTHENTIC"}
            {report.verdict === "SUSPICIOUS" && "⚠️ SUSPICIOUS — MANUAL REVIEW"}
            {report.verdict === "FAKE" && "❌ LIKELY FAKE"}
          </span>
        </div>

        <div className="report-cards">
          {categoryCards.map(c => (
            <div className="report-card" key={c.key} style={{ borderColor: c.pass ? "rgba(0,255,136,0.25)" : "rgba(255,77,109,0.35)" }}>
              <div className="report-card-icon">{c.icon}</div>
              <div className="report-card-label">{c.label}</div>
              <div className="report-card-status" style={{ color: c.pass ? "#00ff88" : "#ff4d6d" }}>{c.pass ? "✅ Passed" : "⚠️ Flagged"}</div>
              <div className="report-card-detail">{c.detail}</div>
            </div>
          ))}
        </div>

        {report.reasons.length > 0 && (
          <>
            <h3 className="report-reasons-title">🧠 Why this verdict</h3>
            {report.reasons.map((reason, i) => (
              <div className="report-reason-row" key={i}>
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
            {report.metadataFlags.map((f, i) => <div className="report-reason-row" key={i}><span>🚩</span><span className="txt">{f}</span></div>)}
          </>
        )}

        {/* NEW: Manual Verification — the final human sign-off, moved here from the outer modal */}
        <div className="manual-verify-box">
          <h3 className="manual-verify-title">🧑‍⚖️ Manual Verification</h3>
          <p className="manual-verify-text">
            The automated forensic scan above checks compression artifacts, ink consistency,
            and visual anomalies, and gives a strong signal — but the final call always rests
            with the reviewing authority. Please go through the trust score, verdict, and any
            flagged findings once more before signing off. Once you're satisfied this document
            genuinely matches the institution's records, confirm below to proceed.
          </p>
          <label className="manual-verify-checkbox">
            <input type="checkbox" checked={manualVerified} onChange={(e) => setManualVerified(e.target.checked)} />
            <span>I have reviewed this document and the forensic findings above, and I confirm it is verified well by the organisation.</span>
          </label>
          <div className="manual-verify-actions">
            <button className="manual-approve-btn" disabled={!manualVerified} onClick={onApprove}>✅ APPROVE DOCUMENT</button>
            <button className="manual-reject-btn" onClick={onReject}>❌ REJECT DOCUMENT</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuthorityDashboard;
