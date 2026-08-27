import { useState } from "react";
import { ethers } from "ethers";
import { verifyHash } from "../blockchain";
import {
  calculateConfidence,
  buildMetadataEvidence,
  buildBlockchainEvidence,
} from "../utils/confidenceEngine";
import "./VerifyRecord.css";

export default function VerifyRecord() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [popup, setPopup] = useState("");

  // ✅ CORRECT HASH FUNCTION (unchanged)
  const generateHash = async (file) => {
    const buffer = await file.arrayBuffer();
    const hash = ethers.keccak256(new Uint8Array(buffer));
    return hash;
  };

  const handleVerify = async () => {
    if (!file) {
      setPopup("⚠ Upload PDF first");
      setTimeout(() => setPopup(""), 3000);
      return;
    }

    setLoading(true);
    setReport(null);

    try {
      const hash = await generateHash(file);
      console.log("VERIFY HASH:", hash);

      const result = await verifyHash(hash);
      console.log("BLOCKCHAIN RESULT:", result);

      /* ===== REAL EVIDENCE — NO FAKE NUMBERS ===== */
      const metadataEvidence = buildMetadataEvidence(file);
      const blockchainEvidence = buildBlockchainEvidence(!!result);

      const confidenceResult = calculateConfidence({
        metadata: metadataEvidence,
        blockchain: blockchainEvidence,
      });

      setReport({
        ...confidenceResult,
        verified: !!result,
        fileName: file.name,
        hash,
      });

      // Save in local storage (unchanged existing feature)
      const existingDocs = JSON.parse(localStorage.getItem("orgDocs")) || [];

      const newDoc = {
        name: file.name,
        date: new Date().toISOString(),
        status: result ? "Verified" : "Fake",
        hash,
      };

      existingDocs.unshift(newDoc);
      localStorage.setItem("orgDocs", JSON.stringify(existingDocs));
    } catch (err) {
      console.log("VERIFY ERROR:", err);
      setPopup("❌ Verification failed");
      setTimeout(() => setPopup(""), 4000);
    }

    setLoading(false);
  };

  const riskColor = (risk) =>
    risk === "LOW" ? "#00ff9c" : risk === "MEDIUM" ? "#ffcc00" : "#ff4d6d";

  return (
    <div className="verify-container">
      {popup && <div className="vr-popup">{popup}</div>}

      {!report && (
        <div className="verify-card">
          <h2>Verify Document</h2>

          <input
            type="file"
            accept="application/pdf"
            id="fileUpload"
            onChange={(e) => setFile(e.target.files[0])}
            hidden
          />

          <label htmlFor="fileUpload" className="choose-btn">
            {file ? file.name : "Choose PDF File"}
          </label>

          <button className="verify-btn" onClick={handleVerify} disabled={loading}>
            {loading ? "Verifying..." : "Verify on Blockchain"}
          </button>

          {loading && (
            <div className="progress-bar" style={{ marginTop: "20px" }}>
              <div className="progress-fill" style={{ width: "100%" }} />
            </div>
          )}
        </div>
      )}

      {/* ===== FORENSIC EVIDENCE REPORT ===== */}
      {report && (
        <div className="vr-report fade-in">
          <div className="vr-status-line">
            {report.verified ? (
              <span className="vr-verified">✅ Authentic Document</span>
            ) : (
              <span className="vr-fake">❌ Not Found On Blockchain</span>
            )}
          </div>

          <div className="vr-trust-wrap">
            <div
              className="vr-trust-circle"
              style={{
                background: `conic-gradient(${riskColor(report.risk)} ${
                  report.overallConfidence * 3.6
                }deg, rgba(255,255,255,0.08) 0deg)`,
              }}
            >
              <div className="vr-trust-inner">
                <span className="vr-trust-score">{report.overallConfidence}%</span>
                <span className="vr-trust-label">Trust Score</span>
              </div>
            </div>

            <div className="vr-risk-meta">
              <div
                className="vr-risk-badge"
                style={{ color: riskColor(report.risk), borderColor: riskColor(report.risk) }}
              >
                Forgery Risk: {report.risk}
              </div>
              <div className="vr-tamper">
                Tampering Probability: {report.tamperingProbability}%
              </div>
            </div>
          </div>

          <h3 className="vr-evidence-heading">📊 Evidence Breakdown</h3>

          <div className="vr-evidence-grid">
            {report.breakdown.map((item, i) => (
              <div key={i} className="vr-evidence-card">
                <div className="vr-evidence-top">
                  <span>{item.module.toUpperCase()}</span>
                  <span className="vr-evidence-wt">{item.weightPercent}% wt</span>
                </div>
                <div className="vr-evidence-bar">
                  <div
                    className="vr-evidence-fill"
                    style={{
                      width: `${item.score}%`,
                      background:
                        item.score >= 80 ? "#00ff9c" : item.score >= 60 ? "#ffcc00" : "#ff4d6d",
                    }}
                  />
                </div>
                <div className="vr-evidence-score">{item.score}%</div>
                <p className="vr-evidence-reason">{item.reason}</p>
              </div>
            ))}
          </div>

          <div className="vr-hash-box">
            <p>Document Hash</p>
            <small>{report.hash}</small>
          </div>

          <div className="vr-actions">
            <button
              className="verify-btn"
              onClick={() => {
                setReport(null);
                setFile(null);
              }}
            >
              Verify Another Document
            </button>
          </div>
        </div>
      )}
    </div>
  );
}