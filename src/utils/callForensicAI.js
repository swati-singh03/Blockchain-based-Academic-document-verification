// src/utils/callForensicAI.js
export async function verifyDocumentWithAI({ imageBase64, docName, ocrText, elaSummary, metadataFlags }) {
  try {
    const response = await fetch("http://localhost:5000/api/verify-document-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: imageBase64, // canvas.toDataURL("image/png") theek hai, server prefix khud hata dega
        docName,
        ocrText,
        elaSummary,
        metadataFlags,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server returned ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    console.error("Forensic AI call failed:", err);
    throw err;
  }
}