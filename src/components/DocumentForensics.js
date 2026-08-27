/**
 * Document Forensics Engine
 * Detects tampering, editing, forgery in document images
 * Logic-based approach using image processing algorithms
 */

class DocumentForensics {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.elaCanvas = document.createElement('canvas');
    this.elaCtx = this.elaCanvas.getContext('2d', { willReadFrequently: true });
  }

  /**
   * Main analysis function - runs all forensic tests
   */
  async analyzeDocument(imageFile) {
    const img = await this.loadImage(imageFile);
    this.canvas.width = img.width;
    this.canvas.height = img.height;
    this.ctx.drawImage(img, 0, 0);
    
    const originalData = this.ctx.getImageData(0, 0, img.width, img.height);
    
    // Run all forensic tests in parallel
    const [
      elaResult,
      noiseResult,
      edgeResult,
      copyMoveResult,
      metadataResult,
      consistencyResult
    ] = await Promise.all([
      this.runELA(originalData, img.width, img.height),
      this.analyzeNoise(originalData, img.width, img.height),
      this.detectEdgeTampering(originalData, img.width, img.height),
      this.detectCopyMove(originalData, img.width, img.height),
      this.analyzeMetadata(imageFile),
      this.checkConsistency(originalData, img.width, img.height)
    ]);

    // Calculate overall tampering score (0-100, higher = more tampered)
    const tamperingScore = this.calculateTamperingScore({
      ela: elaResult,
      noise: noiseResult,
      edge: edgeResult,
      copyMove: copyMoveResult,
      metadata: metadataResult,
      consistency: consistencyResult
    });

    // Generate heatmap visualization
    const heatmap = this.generateHeatmap(elaResult, noiseResult, edgeResult, img.width, img.height);

    return {
      authenticityScore: Math.max(0, 100 - tamperingScore).toFixed(2),
      tamperingScore: tamperingScore.toFixed(2),
      isTampered: tamperingScore > 15,
      confidence: this.getConfidenceLevel(tamperingScore),
      details: {
        ela: elaResult,
        noise: noiseResult,
        edge: edgeResult,
        copyMove: copyMoveResult,
        metadata: metadataResult,
        consistency: consistencyResult
      },
      heatmap: heatmap,
      suspiciousRegions: this.identifySuspiciousRegions(elaResult, noiseResult, edgeResult, img.width, img.height)
    };
  }

  /**
   * Error Level Analysis (ELA)
   * Detects areas with different compression levels (sign of editing)
   */
  async runELA(imageData, width, height) {
    // Save as JPEG with quality 95
    const jpegData = this.canvas.toDataURL('image/jpeg', 0.95);
    
    // Reload the compressed image
    const compressedImg = await this.loadImage(jpegData);
    this.elaCanvas.width = width;
    this.elaCanvas.height = height;
    this.elaCtx.drawImage(compressedImg, 0, 0);
    
    const compressedData = this.elaCtx.getImageData(0, 0, width, height);
    
    // Calculate error levels
    let totalError = 0;
    let maxError = 0;
    let errorPixels = 0;
    const errorMap = new Float32Array(width * height);
    const threshold = 15; // Error threshold
    
    for (let i = 0; i < imageData.data.length; i += 4) {
      const idx = i / 4;
      const rDiff = Math.abs(imageData.data[i] - compressedData.data[i]);
      const gDiff = Math.abs(imageData.data[i + 1] - compressedData.data[i + 1]);
      const bDiff = Math.abs(imageData.data[i + 2] - compressedData.data[i + 2]);
      
      const error = (rDiff + gDiff + bDiff) / 3;
      errorMap[idx] = error;
      totalError += error;
      
      if (error > maxError) maxError = error;
      if (error > threshold) errorPixels++;
    }
    
    const avgError = totalError / (width * height);
    const errorPercentage = (errorPixels / (width * height)) * 100;
    
    // High error areas indicate possible editing
    const tamperProbability = Math.min(100, (avgError / 5) * 100 + (errorPercentage * 2));
    
    return {
      averageError: avgError.toFixed(2),
      maxError: maxError.toFixed(2),
      errorPercentage: errorPercentage.toFixed(2),
      tamperProbability: tamperProbability.toFixed(2),
      errorMap: errorMap,
      threshold: threshold
    };
  }

  /**
   * Noise Analysis
   * Edited regions often have different noise patterns
   */
  analyzeNoise(imageData, width, height) {
    // Convert to grayscale
    const gray = new Float32Array(width * height);
    for (let i = 0; i < imageData.data.length; i += 4) {
      gray[i / 4] = 0.299 * imageData.data[i] + 0.587 * imageData.data[i + 1] + 0.114 * imageData.data[i + 2];
    }
    
    // Calculate local noise using Laplacian
    const noiseMap = new Float32Array(width * height);
    let totalNoise = 0;
    let noiseVariance = 0;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        // Laplacian kernel for noise detection
        const laplacian = 
          Math.abs(4 * gray[idx] - gray[idx - 1] - gray[idx + 1] - gray[idx - width] - gray[idx + width]);
        
        noiseMap[idx] = laplacian;
        totalNoise += laplacian;
      }
    }
    
    const avgNoise = totalNoise / ((width - 2) * (height - 2));
    
    // Calculate noise variance (edited areas have inconsistent noise)
    let variance = 0;
    let inconsistentPixels = 0;
    
    for (let i = 0; i < noiseMap.length; i++) {
      const diff = Math.abs(noiseMap[i] - avgNoise);
      variance += diff * diff;
      if (diff > avgNoise * 3) inconsistentPixels++;
    }
    
    variance = Math.sqrt(variance / noiseMap.length);
    const inconsistencyPercentage = (inconsistentPixels / noiseMap.length) * 100;
    
    return {
      averageNoise: avgNoise.toFixed(2),
      noiseVariance: variance.toFixed(2),
      inconsistencyPercentage: inconsistencyPercentage.toFixed(2),
      noiseMap: noiseMap,
      tamperProbability: Math.min(100, inconsistencyPercentage * 3).toFixed(2)
    };
  }

  /**
   * Edge Tampering Detection
   * Detects unnatural edges that appear when objects are pasted/erased
   */
  detectEdgeTampering(imageData, width, height) {
    const gray = new Float32Array(width * height);
    for (let i = 0; i < imageData.data.length; i += 4) {
      gray[i / 4] = 0.299 * imageData.data[i] + 0.587 * imageData.data[i + 1] + 0.114 * imageData.data[i + 2];
    }
    
    // Sobel edge detection
    const edgeMap = new Float32Array(width * height);
    let totalEdgeStrength = 0;
    let unnaturalEdges = 0;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        // Sobel X
        const gx = 
          -1 * gray[idx - width - 1] + 1 * gray[idx - width + 1] +
          -2 * gray[idx - 1] + 2 * gray[idx + 1] +
          -1 * gray[idx + width - 1] + 1 * gray[idx + width + 1];
        
        // Sobel Y
        const gy = 
          -1 * gray[idx - width - 1] - 2 * gray[idx - width] - 1 * gray[idx - width + 1] +
          1 * gray[idx + width - 1] + 2 * gray[idx + width] + 1 * gray[idx + width + 1];
        
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        edgeMap[idx] = magnitude;
        totalEdgeStrength += magnitude;
        
        // Unnatural edges: too sharp or inconsistent
        if (magnitude > 500 && magnitude < 50) {
          unnaturalEdges++;
        }
      }
    }
    
    const avgEdge = totalEdgeStrength / ((width - 2) * (height - 2));
    
    // Detect edge inconsistencies (sign of copy-paste or erasing)
    let edgeInconsistency = 0;
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        const idx = y * width + x;
        const localAvg = (
          edgeMap[idx - 1] + edgeMap[idx + 1] + 
          edgeMap[idx - width] + edgeMap[idx + width]
        ) / 4;
        
        if (Math.abs(edgeMap[idx] - localAvg) > avgEdge * 4) {
          edgeInconsistency++;
        }
      }
    }
    
    const inconsistencyPercentage = (edgeInconsistency / ((width - 4) * (height - 4))) * 100;
    
    return {
      averageEdgeStrength: avgEdge.toFixed(2),
      unnaturalEdgeCount: unnaturalEdges,
      edgeInconsistency: inconsistencyPercentage.toFixed(2),
      tamperProbability: Math.min(100, inconsistencyPercentage * 2.5).toFixed(2)
    };
  }

  /**
   * Copy-Move Detection
   * Detects if parts of the image were copied and pasted elsewhere
   */
  detectCopyMove(imageData, width, height) {
    // Use block matching for copy-move detection
    const blockSize = 8;
    const blocks = [];
    
    // Extract blocks
    for (let y = 0; y < height - blockSize; y += blockSize / 2) {
      for (let x = 0; x < width - blockSize; x += blockSize / 2) {
        const block = [];
        for (let by = 0; by < blockSize; by++) {
          for (let bx = 0; bx < blockSize; bx++) {
            const idx = ((y + by) * width + (x + bx)) * 4;
            block.push(
              imageData.data[idx] * 0.299 + 
              imageData.data[idx + 1] * 0.587 + 
              imageData.data[idx + 2] * 0.114
            );
          }
        }
        blocks.push({ x, y, data: block });
      }
    }
    
    // Find similar blocks (simplified DCT-based approach)
    const matches = [];
    const similarityThreshold = 0.98;
    
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const b1 = blocks[i];
        const b2 = blocks[j];
        
        // Skip adjacent blocks
        if (Math.abs(b1.x - b2.x) < blockSize * 2 && Math.abs(b1.y - b2.y) < blockSize * 2) {
          continue;
        }
        
        const similarity = this.calculateSimilarity(b1.data, b2.data);
        if (similarity > similarityThreshold) {
          matches.push({ block1: b1, block2: b2, similarity });
        }
      }
    }
    
    // Calculate tampered area percentage
    const tamperedPixels = matches.length * blockSize * blockSize;
    const tamperPercentage = (tamperedPixels / (width * height)) * 100;
    
    return {
      copyMoveMatches: matches.length,
      tamperedAreaPercentage: tamperPercentage.toFixed(2),
      tamperProbability: Math.min(100, tamperPercentage * 5).toFixed(2),
      matches: matches.slice(0, 10) // Return top 10 matches for visualization
    };
  }

  /**
   * Metadata Analysis
   * Check for editing software traces
   */
  async analyzeMetadata(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target.result;
        const metadata = {
          hasEXIF: false,
          editingSoftware: [],
          suspiciousFlags: [],
          tamperProbability: 0
        };
        
        // Check for common editing software signatures in binary
        const signatures = [
          { name: 'Adobe Photoshop', patterns: ['Adobe Photoshop', 'Photoshop 3.0'] },
          { name: 'GIMP', patterns: ['GIMP'] },
          { name: 'Paint.NET', patterns: ['paint.net', 'Paint.NET'] },
          { name: 'Microsoft Paint', patterns: ['MSPaint', 'Paint'] },
          { name: 'Canva', patterns: ['Canva'] },
          { name: 'Figma', patterns: ['Figma'] }
        ];
        
        const text = typeof result === 'string' ? result : '';
        
        signatures.forEach(sig => {
          sig.patterns.forEach(pattern => {
            if (text.includes(pattern) || this.binarySearch(result, pattern)) {
              metadata.editingSoftware.push(sig.name);
              metadata.suspiciousFlags.push(`Found ${sig.name} signature`);
            }
          });
        });
        
        // Check for re-saving indicators
        if (text.includes('JFIF') && text.includes('Exif')) {
          metadata.hasEXIF = true;
        }
        
        // Multiple save operations often indicate editing
        const saveCount = (text.match(/8BIM/g) || []).length;
        if (saveCount > 2) {
          metadata.suspiciousFlags.push(`Multiple save operations detected (${saveCount})`);
        }
        
        metadata.tamperProbability = Math.min(100, metadata.editingSoftware.length * 25 + metadata.suspiciousFlags.length * 10);
        
        resolve(metadata);
      };
      reader.readAsBinaryString(file.slice(0, 50000)); // Read first 50KB
    });
  }

  /**
   * Consistency Check
   * Checks color consistency, lighting, and patterns
   */
  checkConsistency(imageData, width, height) {
    // Divide image into regions and check consistency
    const regionsX = 4;
    const regionsY = 4;
    const regionWidth = Math.floor(width / regionsX);
    const regionHeight = Math.floor(height / regionsY);
    
    const regionStats = [];
    
    for (let ry = 0; ry < regionsY; ry++) {
      for (let rx = 0; rx < regionsX; rx++) {
        let rSum = 0, gSum = 0, bSum = 0;
        let count = 0;
        
        for (let y = ry * regionHeight; y < (ry + 1) * regionHeight && y < height; y++) {
          for (let x = rx * regionWidth; x < (rx + 1) * regionWidth && x < width; x++) {
            const idx = (y * width + x) * 4;
            rSum += imageData.data[idx];
            gSum += imageData.data[idx + 1];
            bSum += imageData.data[idx + 2];
            count++;
          }
        }
        
        regionStats.push({
          avgR: rSum / count,
          avgG: gSum / count,
          avgB: bSum / count,
          brightness: (rSum + gSum + bSum) / (3 * count)
        });
      }
    }
    
    // Calculate variance between regions
    let totalVariance = 0;
    let suspiciousRegions = 0;
    
    for (let i = 0; i < regionStats.length; i++) {
      for (let j = i + 1; j < regionStats.length; j++) {
        const brightnessDiff = Math.abs(regionStats[i].brightness - regionStats[j].brightness);
        totalVariance += brightnessDiff;
        
        // Suspicious if brightness difference is too high for a document
        if (brightnessDiff > 60) {
          suspiciousRegions++;
        }
      }
    }
    
    const avgVariance = totalVariance / (regionStats.length * (regionStats.length - 1) / 2);
    const suspiciousPercentage = (suspiciousRegions / (regionStats.length * regionStats.length)) * 100;
    
    return {
      averageVariance: avgVariance.toFixed(2),
      suspiciousRegions: suspiciousRegions,
      consistencyScore: Math.max(0, 100 - suspiciousPercentage).toFixed(2),
      tamperProbability: Math.min(100, suspiciousPercentage * 2).toFixed(2)
    };
  }

  /**
   * Calculate overall tampering score using weighted algorithm
   */
  calculateTamperingScore(results) {
    // Weights for each test (based on reliability)
    const weights = {
      ela: 0.30,
      noise: 0.25,
      edge: 0.20,
      copyMove: 0.15,
      metadata: 0.05,
      consistency: 0.05
    };
    
    let score = 0;
    score += parseFloat(results.ela.tamperProbability) * weights.ela;
    score += parseFloat(results.noise.tamperProbability) * weights.noise;
    score += parseFloat(results.edge.tamperProbability) * weights.edge;
    score += parseFloat(results.copyMove.tamperProbability) * weights.copyMove;
    score += parseFloat(results.metadata.tamperProbability) * weights.metadata;
    score += parseFloat(results.consistency.tamperProbability) * weights.consistency;
    
    // Boost score if multiple tests agree
    const highProbabilityTests = [
      results.ela.tamperProbability > 50,
      results.noise.tamperProbability > 50,
      results.edge.tamperProbability > 50,
      results.copyMove.tamperProbability > 50
    ].filter(Boolean).length;
    
    if (highProbabilityTests >= 2) {
      score *= 1.2; // Boost by 20% if multiple tests agree
    }
    
    return Math.min(100, score);
  }

  /**
   * Generate heatmap of suspicious areas
   */
  generateHeatmap(ela, noise, edge, width, height) {
    const heatmapCanvas = document.createElement('canvas');
    heatmapCanvas.width = width;
    heatmapCanvas.height = height;
    const ctx = heatmapCanvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    
    for (let i = 0; i < width * height; i++) {
      const x = i % width;
      const y = Math.floor(i / width);
      
      // Normalize and combine scores
      const elaScore = Math.min(1, ela.errorMap[i] / (ela.threshold * 3));
      const noiseScore = Math.min(1, noise.noiseMap[i] / (parseFloat(noise.averageNoise) * 5));
      
      // Create heatmap color (blue = safe, red = tampered)
      const intensity = Math.min(1, (elaScore + noiseScore) / 2);
      
      const r = Math.floor(intensity * 255);
      const g = Math.floor((1 - intensity) * 255);
      const b = 0;
      
      imageData.data[i * 4] = r;
      imageData.data[i * 4 + 1] = g;
      imageData.data[i * 4 + 2] = b;
      imageData.data[i * 4 + 3] = Math.floor(intensity * 200);
    }
    
    ctx.putImageData(imageData, 0, 0);
    return heatmapCanvas.toDataURL();
  }

  /**
   * Identify specific suspicious regions
   */
  identifySuspiciousRegions(ela, noise, edge, width, height) {
    const regions = [];
    const visited = new Set();
    
    // Find connected components of high error
    for (let y = 0; y < height; y += 10) {
      for (let x = 0; x < width; x += 10) {
        const idx = y * width + x;
        
        if (visited.has(idx)) continue;
        
        const elaScore = ela.errorMap[idx] / (ela.threshold * 3);
        const noiseScore = noise.noiseMap[idx] / (parseFloat(noise.averageNoise) * 5);
        
        if (elaScore > 0.7 || noiseScore > 0.7) {
          // Found suspicious region, find its bounds
          const region = this.floodFill(x, y, width, height, ela, noise, visited);
          if (region.area > 100) { // Minimum area threshold
            regions.push({
              x: region.minX,
              y: region.minY,
              width: region.maxX - region.minX,
              height: region.maxY - region.minY,
              area: region.area,
              severity: region.severity
            });
          }
        }
      }
    }
    
    return regions.slice(0, 5); // Return top 5 regions
  }

  /**
   * Flood fill algorithm for region detection
   */
  floodFill(startX, startY, width, height, ela, noise, visited) {
    const stack = [[startX, startY]];
    let minX = startX, maxX = startX, minY = startY, maxY = startY;
    let area = 0;
    let totalSeverity = 0;
    
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      const idx = y * width + x;
      
      if (visited.has(idx) || x < 0 || x >= width || y < 0 || y >= height) continue;
      
      const elaScore = ela.errorMap[idx] / (ela.threshold * 3);
      const noiseScore = noise.noiseMap[idx] / (parseFloat(noise.averageNoise) * 5);
      
      if (elaScore < 0.5 && noiseScore < 0.5) continue;
      
      visited.add(idx);
      area++;
      totalSeverity += Math.max(elaScore, noiseScore);
      
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    
    return {
      minX, maxX, minY, maxY, area,
      severity: area > 0 ? totalSeverity / area : 0
    };
  }

  /**
   * Helper: Calculate similarity between two arrays
   */
  calculateSimilarity(a, b) {
    let sum = 0;
    let sumA = 0;
    let sumB = 0;
    
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i];
      sumA += a[i] * a[i];
      sumB += b[i] * b[i];
    }
    
    return sum / (Math.sqrt(sumA) * Math.sqrt(sumB));
  }

  /**
   * Helper: Binary search in ArrayBuffer
   */
  binarySearch(buffer, str) {
    const encoder = new TextEncoder();
    const searchBytes = encoder.encode(str);
    
    if (typeof buffer === 'string') {
      return buffer.includes(str);
    }
    
    // Simple search for binary data
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length - searchBytes.length; i++) {
      let found = true;
      for (let j = 0; j < searchBytes.length; j++) {
        if (bytes[i + j] !== searchBytes[j]) {
          found = false;
          break;
        }
      }
      if (found) return true;
    }
    return false;
  }

  /**
   * Helper: Load image from file
   */
  loadImage(source) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      
      if (typeof source === 'string') {
        img.src = source;
      } else {
        const reader = new FileReader();
        reader.onload = (e) => { img.src = e.target.result; };
        reader.readAsDataURL(source);
      }
    });
  }

  getConfidenceLevel(score) {
    if (score < 10) return 'Very High';
    if (score < 25) return 'High';
    if (score < 50) return 'Moderate';
    if (score < 75) return 'Low';
    return 'Very Low';
  }
}

// Export for use in modules or global
export default DocumentForensics;