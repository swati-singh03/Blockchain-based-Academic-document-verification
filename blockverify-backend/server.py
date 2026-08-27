from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import pytesseract
import numpy as np
import re

# 🔥 SET PATH
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

app = Flask(__name__)
CORS(app)

# ---------------- ENHANCE ----------------
def enhance(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.convertScaleAbs(gray, alpha=1.4, beta=25)
    gray = cv2.GaussianBlur(gray, (3,3), 0)
    return gray

# ---------------- OCR ----------------
def get_text(image):
    return pytesseract.image_to_string(enhance(image), config='--psm 6').lower()

# ---------------- NOISE ----------------
def noise_score(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return cv2.Laplacian(gray, cv2.CV_64F).var()

# ---------------- EDGE ----------------
def edge_score(image):
    return cv2.Canny(image, 100, 200).mean()

# ---------------- TEXT PRESENCE ----------------
def text_presence(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    thresh = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)[1]
    return np.sum(thresh == 0)

# ---------------- FACE ----------------
def face_present(image):
    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
    )
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.3, 5)
    return len(faces) > 0

# ---------------- QR ----------------
def qr_present(image):
    detector = cv2.QRCodeDetector()
    _, bbox, _ = detector.detectAndDecode(image)
    return bbox is not None

# ---------------- MAIN ----------------
def verify_aadhaar(path):
    image = cv2.imread(path)

    if image is None:
        return {"confidence": 0, "status": "Rejected", "reason": "Invalid image"}

    text = get_text(image)

    # 🔥 MULTI-SIGNAL DETECTION
    aadhaar_signals = 0

    if "uidai" in text or "aadhaar" in text:
        aadhaar_signals += 1

    if re.search(r"\d{4}\s?\d{4}\s?\d{4}", text):
        aadhaar_signals += 1

    if face_present(image):
        aadhaar_signals += 1

    if qr_present(image):
        aadhaar_signals += 1

    if text_presence(image) > 5000:
        aadhaar_signals += 1

    # 🔴 STRICT GATE
    if aadhaar_signals < 2:
        return {
            "confidence": 10,
            "status": "Rejected",
            "reason": "Not Aadhaar (insufficient Aadhaar features)"
        }

    # ---------------- SCORING ----------------
    score = 50
    reasons = []
    debug = [f"Signals:{aadhaar_signals}"]

    # 🔴 NOISE
    noise = noise_score(image)
    debug.append(f"Noise:{round(noise,1)}")

    if noise > 60:
        score += 15
    else:
        score -= 30
        reasons.append("Very smooth (screenshot)")

    # 🔴 EDGE
    edges = edge_score(image)
    debug.append(f"Edges:{round(edges,1)}")

    if edges > 10:
        score += 10
    else:
        score -= 20
        reasons.append("Artificial edges")

    # 🔴 TEXT PRESENCE
    text_pixels = text_presence(image)
    debug.append(f"Text:{text_pixels}")

    if text_pixels > 5000:
        score += 10
    else:
        score -= 10
        reasons.append("Low text")

    # 🔴 SCREENSHOT LARGE RESOLUTION CHECK
    h, w = image.shape[:2]
    if w > 1000 and h > 700:
        score -= 20
        reasons.append("Looks like screen capture")

    # 🔴 TOO PERFECT TEXT (UI SCREEN)
    if text_pixels > 20000:
        score -= 15
        reasons.append("Uniform screen text")

    # 🔴 FACE
    if face_present(image):
        score += 10
        debug.append("Face OK")
    else:
        score -= 10
        reasons.append("No face")

    # 🔴 QR (LOW WEIGHT)
    if qr_present(image):
        score += 5
        debug.append("QR OK")
    else:
        reasons.append("QR missing")

    # ---------------- FINAL LIMIT ----------------
    score = max(0, min(score, 100))

    # ---------------- DECISION ----------------
    if score >= 75:
        status = "Approved"
    elif score >= 50:
        status = "Manual Review"
    else:
        status = "Rejected"

    return {
        "confidence": score,
        "status": status,
        "reason": ", ".join(reasons),
        "debug": ", ".join(debug)
    }

# ---------------- API ----------------
@app.route('/verify-aadhaar', methods=['POST'])
def verify():
    file = request.files['file']
    path = "temp.jpg"
    file.save(path)

    return jsonify(verify_aadhaar(path))

# ---------------- RUN ----------------
if __name__ == "__main__":
    app.run(debug=True)