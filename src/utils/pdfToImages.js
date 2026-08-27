// src/utils/pdfToImages.js
// Renders every page of a PDF File into a real PNG image using pdfjs-dist.

import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

/**
 * Converts a PDF File object into an array of rendered page images.
 */
export async function convertPdfToImages(file, options = {}) {
  const { scale = 1.5, maxPages = 20 } = options;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const totalPages = pdf.numPages;
  const renderedPages = Math.min(totalPages, maxPages);
  const pages = [];

  for (let pageNum = 1; pageNum <= renderedPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");

    await page.render({ canvasContext: ctx, viewport }).promise;

    pages.push({
      pageNumber: pageNum,
      dataUrl: canvas.toDataURL("image/png"),
      width: viewport.width,
      height: viewport.height,
    });
  }

  // Also read the raw PDF as base64 — needed later for real
  // Producer/Creator/ModDate metadata forensics.
  const rawDataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  return { totalPages, renderedPages, pages, rawDataUrl };
}