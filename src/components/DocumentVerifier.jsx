import React, { useState, useRef } from 'react';
import DocumentForensics from "./DocumentForensics";
const DocumentVerifier = () => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [heatmap, setHeatmap] = useState(null);
  const fileInputRef = useRef(null);

  const forensics = new DocumentForensics();

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    
    setFile(selectedFile);
    setResult(null);
    setHeatmap(null);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(selectedFile);
  };

  const handleVerify = async () => {
    if (!file) return;
    
    setAnalyzing(true);
    
    try {
      // Run forensic analysis
      const analysis = await forensics.analyzeDocument(file);
      setResult(analysis);
      setHeatmap(analysis.heatmap);
    } catch (error) {
      console.error('Analysis failed:', error);
      alert('Analysis failed. Please try again with a different image.');
    } finally {
      setAnalyzing(false);
    }
  };

  const getScoreColor = (score) => {
    const num = parseFloat(score);
    if (num >= 90) return '#00ff88';
    if (num >= 70) return '#ffd700';
    if (num >= 50) return '#ff9500';
    return '#ff4444';
  };

  return (
    <div className="verifyPage">
      <h1 className="verifyTitle">🔍 Document Forensics Lab</h1>
      
      {/* Document Type Selection */}
      <div className="docGrid">
        {['Aadhaar', 'PAN Card', 'Passport', 'Driving License', 'Marksheet', 'Certificate'].map((doc) => (
          <button key={doc} className="docButton">
            <span className="docIcon">📄</span>
            <span className="docText">{doc}</span>
          </button>
        ))}
      </div>

      {/* Upload Section */}
      <div className="uploadBox" style={{ marginTop: '40px' }}>
        <div className="fileUpload">
          <input 
            type="file" 
            ref={fileInputRef}
            accept="image/*,.pdf" 
            onChange={handleFileChange}
            id="file-upload"
          />
          <label htmlFor="file-upload" className="uploadBtn">
            📁 Choose Document
          </label>
        </div>
        
        {file && (
          <button 
            className="verifyBtn" 
            onClick={handleVerify}
            disabled={analyzing}
          >
            {analyzing ? '🔬 Analyzing...' : '🔍 Forensic Scan'}
          </button>
        )}
      </div>

      {/* Preview */}
      {preview && (
        <div className="docPreview">
          <img src={preview} alt="Preview" className="previewImg" />
        </div>
      )}

      {/* Scanning Animation */}
      {analyzing && (
        <div style={{ marginTop: '30px', textAlign: 'center' }}>
          <div className="progress-bar" style={{ maxWidth: '500px', margin: '0 auto' }}>
            <div className="progress-fill" style={{ width: '100%', animation: 'pulse 1s infinite' }}></div>
          </div>
          <p style={{ color: '#00ff88', marginTop: '15px' }}>
            Running ELA, Noise Analysis, Edge Detection, Copy-Move Detection...
          </p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div style={{ marginTop: '40px', maxWidth: '900px', margin: '40px auto' }}>
          {/* Main Score */}
          <div style={{ 
            background: 'rgba(255,255,255,0.05)', 
            padding: '30px', 
            borderRadius: '20px',
            border: `3px solid ${getScoreColor(result.authenticityScore)}`,
            marginBottom: '30px'
          }}>
            <h2 style={{ 
              fontSize: '48px', 
              color: getScoreColor(result.authenticityScore),
              margin: '0'
            }}>
              {result.authenticityScore}%
            </h2>
            <p style={{ fontSize: '20px', margin: '10px 0' }}>
              {result.isTampered ? '⚠️ TAMPERING DETECTED' : '✅ AUTHENTIC DOCUMENT'}
            </p>
            <p style={{ opacity: 0.7 }}>
              Confidence: {result.confidence} | Tampering Score: {result.tamperingScore}%
            </p>
          </div>

          {/* Heatmap */}
          {heatmap && (
            <div style={{ marginBottom: '30px' }}>
              <h3 style={{ color: '#00ff88', marginBottom: '15px' }}>🗺️ Tamper Heatmap</h3>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img src={preview} alt="Original" style={{ maxWidth: '100%', borderRadius: '12px' }} />
                <img 
                  src={heatmap} 
                  alt="Heatmap" 
                  style={{ 
                    position: 'absolute', 
                    top: 0, 
                    left: 0, 
                    maxWidth: '100%',
                    borderRadius: '12px',
                    opacity: 0.7,
                    mixBlendMode: 'screen'
                  }} 
                />
              </div>
              <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '15px' }}>
                <span style={{ color: '#00ff88' }}>🟢 Safe</span>
                <span style={{ color: '#ffd700' }}>🟡 Suspicious</span>
                <span style={{ color: '#ff4444' }}>🔴 Tampered</span>
              </div>
            </div>
          )}

          {/* Detailed Results Grid */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
            gap: '20px' 
          }}>
            {/* ELA Card */}
            <div className="check-item" style={{
              background: parseFloat(result.details.ela.tamperProbability) > 30 ? 'rgba(255,68,68,0.15)' : 'rgba(0,255,136,0.15)',
              border: `2px solid ${parseFloat(result.details.ela.tamperProbability) > 30 ? '#ff4444' : '#00ff88'}`,
              borderRadius: '12px',
              padding: '20px'
            }}>
              <h4>📊 Error Level Analysis</h4>
              <p>Avg Error: {result.details.ela.averageError}</p>
              <p>Error Pixels: {result.details.ela.errorPercentage}%</p>
              <p>Risk: {result.details.ela.tamperProbability}%</p>
            </div>

            {/* Noise Card */}
            <div className="check-item" style={{
              background: parseFloat(result.details.noise.tamperProbability) > 30 ? 'rgba(255,68,68,0.15)' : 'rgba(0,255,136,0.15)',
              border: `2px solid ${parseFloat(result.details.noise.tamperProbability) > 30 ? '#ff4444' : '#00ff88'}`,
              borderRadius: '12px',
              padding: '20px'
            }}>
              <h4>🔊 Noise Analysis</h4>
              <p>Noise Variance: {result.details.noise.noiseVariance}</p>
              <p>Inconsistency: {result.details.noise.inconsistencyPercentage}%</p>
              <p>Risk: {result.details.noise.tamperProbability}%</p>
            </div>

            {/* Edge Card */}
            <div className="check-item" style={{
              background: parseFloat(result.details.edge.tamperProbability) > 30 ? 'rgba(255,68,68,0.15)' : 'rgba(0,255,136,0.15)',
              border: `2px solid ${parseFloat(result.details.edge.tamperProbability) > 30 ? '#ff4444' : '#00ff88'}`,
              borderRadius: '12px',
              padding: '20px'
            }}>
              <h4>📐 Edge Tampering</h4>
              <p>Edge Inconsistency: {result.details.edge.edgeInconsistency}%</p>
              <p>Unnatural Edges: {result.details.edge.unnaturalEdgeCount}</p>
              <p>Risk: {result.details.edge.tamperProbability}%</p>
            </div>

            {/* Copy-Move Card */}
            <div className="check-item" style={{
              background: parseFloat(result.details.copyMove.tamperProbability) > 30 ? 'rgba(255,68,68,0.15)' : 'rgba(0,255,136,0.15)',
              border: `2px solid ${parseFloat(result.details.copyMove.tamperProbability) > 30 ? '#ff4444' : '#00ff88'}`,
              borderRadius: '12px',
              padding: '20px'
            }}>
              <h4>🔄 Copy-Move Detection</h4>
              <p>Matches Found: {result.details.copyMove.copyMoveMatches}</p>
              <p>Tampered Area: {result.details.copyMove.tamperedAreaPercentage}%</p>
              <p>Risk: {result.details.copyMove.tamperProbability}%</p>
            </div>

            {/* Metadata Card */}
            <div className="check-item" style={{
              background: result.details.metadata.editingSoftware.length > 0 ? 'rgba(255,193,7,0.15)' : 'rgba(0,255,136,0.15)',
              border: `2px solid ${result.details.metadata.editingSoftware.length > 0 ? '#ffc107' : '#00ff88'}`,
              borderRadius: '12px',
              padding: '20px'
            }}>
              <h4>📝 Metadata Forensics</h4>
              <p>Software: {result.details.metadata.editingSoftware.join(', ') || 'None detected'}</p>
              <p>Flags: {result.details.metadata.suspiciousFlags.length}</p>
              <p>Risk: {result.details.metadata.tamperProbability}%</p>
            </div>

            {/* Consistency Card */}
            <div className="check-item" style={{
              background: parseFloat(result.details.consistency.tamperProbability) > 30 ? 'rgba(255,68,68,0.15)' : 'rgba(0,255,136,0.15)',
              border: `2px solid ${parseFloat(result.details.consistency.tamperProbability) > 30 ? '#ff4444' : '#00ff88'}`,
              borderRadius: '12px',
              padding: '20px'
            }}>
              <h4>🎨 Consistency Check</h4>
              <p>Variance: {result.details.consistency.averageVariance}</p>
              <p>Consistency: {result.details.consistency.consistencyScore}%</p>
              <p>Risk: {result.details.consistency.tamperProbability}%</p>
            </div>
          </div>

          {/* Suspicious Regions */}
          {result.suspiciousRegions.length > 0 && (
            <div style={{ marginTop: '30px', background: 'rgba(255,68,68,0.1)', padding: '20px', borderRadius: '12px', border: '2px solid rgba(255,68,68,0.3)' }}>
              <h4 style={{ color: '#ff4444', marginBottom: '15px' }}>🎯 Suspicious Regions Detected</h4>
              {result.suspiciousRegions.map((region, idx) => (
                <div key={idx} style={{ 
                  background: 'rgba(255,255,255,0.05)', 
                  padding: '12px', 
                  margin: '8px 0',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}>
                  <span>Region {idx + 1}: Position ({region.x}, {region.y})</span>
                  <span style={{ color: '#ff4444', fontWeight: 'bold' }}>
                    Severity: {(region.severity * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Final Verdict */}
          <div style={{ 
            marginTop: '30px', 
            padding: '25px', 
            borderRadius: '15px',
            background: result.isTampered ? 'rgba(255,68,68,0.15)' : 'rgba(0,255,136,0.15)',
            border: `2px solid ${result.isTampered ? '#ff4444' : '#00ff88'}`
          }}>
            <h3 style={{ color: result.isTampered ? '#ff4444' : '#00ff88' }}>
              {result.isTampered ? '❌ DOCUMENT REJECTED' : '✅ DOCUMENT VERIFIED'}
            </h3>
            <p style={{ marginTop: '10px', lineHeight: '1.6' }}>
              {result.isTampered 
                ? `This document shows signs of tampering with a confidence of ${result.tamperingScore}%. 
                   ${result.suspiciousRegions.length} suspicious regions were detected. 
                   The document may have been edited using ${result.details.metadata.editingSoftware.join(', ') || 'unknown software'}.`
                : 'This document appears authentic with no significant signs of tampering detected across all forensic tests.'
              }
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentVerifier;