import { useState } from "react";
import { ethers } from "ethers";
import { verifyHash } from "../blockchain";
import "./VerifyRecord.css";
import DocumentVerifier from '../components/DocumentVerifier';

// Apne existing page mein:
function VerifyPage() {
  return (
    <div>
      {/* Purana code hatado ya niche add karo */}
      <DocumentVerifier />
    </div>
  );
}

export default function VerifyRecord() {

  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  // ✅ CORRECT HASH FUNCTION
  const generateHash = async (file) => {
    const buffer = await file.arrayBuffer();

    const hash = ethers.keccak256(
      new Uint8Array(buffer) // ✅ FIXED
    );

    return hash;
  };

  const handleVerify = async () => {

    if (!file) return alert("Upload PDF first");

    setLoading(true);

    try {

      const hash = await generateHash(file);

      console.log("VERIFY HASH:", hash);

      const result = await verifyHash(hash);

      console.log("BLOCKCHAIN RESULT:", result);

      alert(result ? "✅ Authentic Document" : "❌ Fake Document");

      // Save in local storage
      const existingDocs =
        JSON.parse(localStorage.getItem("orgDocs")) || [];

      const newDoc = {
        name: file.name,
        date: new Date().toISOString(),
        status: result ? "Verified" : "Fake",
        hash
      };

      existingDocs.unshift(newDoc);

      localStorage.setItem("orgDocs", JSON.stringify(existingDocs));

    } catch (err) {
      console.log("VERIFY ERROR:", err);
      alert("❌ Verification failed");
    }

    setLoading(false);
  };

  return (
    <div className="verify-container">
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

        <button className="verify-btn" onClick={handleVerify}>
          {loading ? "Verifying..." : "Verify on Blockchain"}
        </button>

      </div>
    </div>
  );
}