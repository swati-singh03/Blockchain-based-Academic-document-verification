import { useState } from "react";

function Home() {
  const [msg, setMsg] = useState("");
  const role = localStorage.getItem("role");

  const handleAccess = (type) => {
    if (!role) {
      window.location.href = "/login";
      return;
    }

    if (role !== type) {
      setMsg(`You are a ${role}. Please select a valid option.`);
      setTimeout(() => setMsg(""), 3000);
      return;
    }

    if (type === "user") {
      window.location.href = "/dashboard";
    } else if (type === "authority") {
      window.location.href = "/authority-dashboard";
    } else {
      window.location.href = "/organization-dashboard";
    }
  };

  return (
    <div style={page}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&family=Inter:wght@400;500;600;700;800&display=swap');

        * {
          box-sizing: border-box;
        }

        @keyframes heroReveal {
          from {
            opacity: 0;
            transform: translateY(25px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes blockFall1 {
          0% {
            transform: translateY(-180px) rotate(0deg);
            opacity: 0;
          }

          15% {
            opacity: 0.65;
          }

          100% {
            transform: translateY(850px) rotate(180deg);
            opacity: 0;
          }
        }

        @keyframes blockFall2 {
          0% {
            transform: translateY(-220px) rotate(20deg);
            opacity: 0;
          }

          15% {
            opacity: 0.55;
          }

          100% {
            transform: translateY(850px) rotate(220deg);
            opacity: 0;
          }
        }

        @keyframes blockFall3 {
          0% {
            transform: translateY(-150px) rotate(45deg);
            opacity: 0;
          }

          20% {
            opacity: 0.6;
          }

          100% {
            transform: translateY(850px) rotate(260deg);
            opacity: 0;
          }
        }

        @keyframes glowPulse {
          0%, 100% {
            opacity: 0.12;
            transform: scale(1);
          }

          50% {
            opacity: 0.28;
            transform: scale(1.1);
          }
        }

        .hero-content {
          animation: heroReveal 0.9s ease-out forwards;
        }

        .fall-block {
          position: absolute;

          width: 44px;
          height: 44px;

          border: 1px solid rgba(34, 211, 238, 0.35);

          background:
            linear-gradient(
              135deg,
              rgba(34, 211, 238, 0.10),
              rgba(37, 99, 235, 0.03)
            );

          box-shadow:
            0 0 24px rgba(34, 211, 238, 0.08),
            inset 0 0 18px rgba(34, 211, 238, 0.04);

          backdrop-filter: blur(4px);
        }

        .block1 {
          right: 29%;
          top: -80px;
          animation: blockFall1 8s linear infinite;
        }

        .block2 {
          right: 17%;
          top: -180px;
          width: 30px;
          height: 30px;
          animation: blockFall2 10s linear infinite 2s;
        }

        .block3 {
          right: 8%;
          top: -120px;
          width: 56px;
          height: 56px;
          animation: blockFall3 12s linear infinite 4s;
        }

        .block4 {
          right: 40%;
          top: -230px;
          width: 24px;
          height: 24px;
          animation: blockFall2 9s linear infinite 5s;
        }

        .glow {
          position: absolute;

          width: 280px;
          height: 280px;

          border-radius: 50%;

          background: rgba(14, 165, 233, 0.07);

          filter: blur(70px);

          animation: glowPulse 5s ease-in-out infinite;
        }

        .access-btn {
          transition:
            transform 0.25s ease,
            border-color 0.25s ease,
            background 0.25s ease,
            box-shadow 0.25s ease;
        }

        .access-btn:hover {
          transform: translateX(7px);

          border-color:
            rgba(34, 211, 238, 0.55) !important;

          background:
            rgba(12, 38, 62, 0.78) !important;

          box-shadow:
            0 8px 25px rgba(0, 0, 0, 0.25);
        }

        .access-btn:hover .arrow {
          transform: translateX(4px);
        }

        .arrow {
          transition: transform 0.25s ease;
        }

        @media (max-width: 1000px) {
          .hero {
            padding-left: 8vw !important;
          }

          .title-line {
            font-size: 48px !important;
          }
        }

        @media (max-width: 700px) {
          .hero {
            padding-left: 30px !important;
            padding-right: 25px !important;
          }

          .title-line {
            font-size: 40px !important;
          }

          .description {
            max-width: 500px !important;
          }
        }

        @media (max-width: 500px) {
          .title-line {
            font-size: 32px !important;
          }

          .access-options {
            width: 100% !important;
          }
        }
      `}</style>

      {/* =========================
          BACKGROUND VIDEO
      ========================== */}

      <video
        autoPlay
        muted
        loop
        playsInline
        style={video}
      >
        <source
          src="/videos.mp4"
          type="video/mp4"
        />
      </video>


      {/* =========================
          DARK OVERLAY
      ========================== */}

      <div style={overlay}></div>


      {/* =========================
          FALLING BLOCK ANIMATION
      ========================== */}

      <div style={fallingArea}>

        <div
          className="glow"
          style={{
            right: "15%",
            top: "25%",
          }}
        />

        <div className="fall-block block1"></div>

        <div className="fall-block block2"></div>

        <div className="fall-block block3"></div>

        <div className="fall-block block4"></div>

      </div>


      {/* =========================
          TOP CYAN LINE
      ========================== */}

      <div style={accent}></div>


      {/* =========================
          ERROR MESSAGE
      ========================== */}

      {msg && (
        <div style={message}>
          {msg}
        </div>
      )}


      {/* =========================
          HERO
      ========================== */}

      <main
        className="hero"
        style={hero}
      >

        <section
          className="hero-content"
          style={content}
        >

          {/* SMALL BRAND */}

          <div style={eyebrow}>
            BLOCKVERIFY
          </div>


          {/* =========================
              MAIN TITLE

              EXACTLY 3 LINES
          ========================== */}

          <div style={mainTitle}>

            <div
              className="title-line"
              style={titleLine}
            >
              Blockchain-Based
            </div>

            <div
              className="title-line"
              style={titleLine}
            >
              Academic
            </div>

            <div
              className="title-line"
              style={titleLine}
            >
              Document Verification
            </div>

          </div>


          {/* =========================
              DESCRIPTION
          ========================== */}

          <p
            className="description"
            style={description}
          >
            Verify academic documents. Detect tampering.
            Secure trusted records on blockchain.
          </p>


          {/* =========================
              CYAN LINE
          ========================== */}

          <div style={accentLine}></div>


          {/* =========================
              ACCESS OPTIONS
          ========================== */}

          <div
            className="access-options"
            style={options}
          >

            {/* USER */}

            <button
              className="access-btn"
              style={option}
              onClick={() => handleAccess("user")}
            >

              <span style={number}>
                01
              </span>

              <span style={optionText}>

                <strong>
                  User
                </strong>

                <small>
                  Verify your document
                </small>

              </span>

              <span
                className="arrow"
                style={arrow}
              >
                ↗
              </span>

            </button>


            {/* ORGANIZATION */}

            <button
              className="access-btn"
              style={option}
              onClick={() => handleAccess("org")}
            >

              <span style={number}>
                02
              </span>

              <span style={optionText}>

                <strong>
                  Organization
                </strong>

                <small>
                  Verify submitted records
                </small>

              </span>

              <span
                className="arrow"
                style={arrow}
              >
                ↗
              </span>

            </button>


            {/* AUTHORITY */}

            <button
              className="access-btn"
              style={option}
              onClick={() => handleAccess("authority")}
            >

              <span style={number}>
                03
              </span>

              <span style={optionText}>

                <strong>
                  Authority
                </strong>

                <small>
                  Register &amp; verify records
                </small>

              </span>

              <span
                className="arrow"
                style={arrow}
              >
                ↗
              </span>

            </button>

          </div>

        </section>

      </main>

    </div>
  );
}


/* =========================================================
   PAGE
========================================================= */

const page = {
  position: "relative",

  width: "100%",

  height: "calc(100vh - 70px)",

  minHeight: "600px",

  overflow: "hidden",

  background: "#020617",

  boxSizing: "border-box",
};


/* =========================================================
   VIDEO
========================================================= */

const video = {
  position: "absolute",

  inset: 0,

  width: "100%",

  height: "100%",

  objectFit: "cover",

  zIndex: 0,
};


/* =========================================================
   OVERLAY
========================================================= */

const overlay = {
  position: "absolute",

  inset: 0,

  zIndex: 1,

  background:
    "linear-gradient(90deg, rgba(2,6,23,0.97) 0%, rgba(2,6,23,0.91) 38%, rgba(2,6,23,0.55) 72%, rgba(2,6,23,0.30) 100%)",
};


/* =========================================================
   FALLING AREA
========================================================= */

const fallingArea = {
  position: "absolute",

  inset: 0,

  zIndex: 2,

  pointerEvents: "none",

  overflow: "hidden",
};


/* =========================================================
   TOP ACCENT
========================================================= */

const accent = {
  position: "absolute",

  top: 0,

  left: 0,

  width: "100%",

  height: "2px",

  background:
    "linear-gradient(90deg, #22d3ee, #2563eb, #22d3ee)",

  zIndex: 10,
};


/* =========================================================
   HERO
========================================================= */

const hero = {
  position: "relative",

  zIndex: 4,

  width: "100%",

  height: "100%",

  display: "flex",

  alignItems: "center",

  boxSizing: "border-box",

  paddingLeft: "18vw",

  paddingRight: "30px",
};


/* =========================================================
   CONTENT
========================================================= */

const content = {
  width: "auto",

  maxWidth: "900px",

  boxSizing: "border-box",
};


/* =========================================================
   BRAND
========================================================= */

const eyebrow = {
  marginBottom: "18px",

  fontFamily: "Inter, sans-serif",

  fontSize: "11px",

  fontWeight: "700",

  letterSpacing: "4px",

  color: "#67e8f9",
};


/* =========================================================
   MAIN TITLE

   Separate DIVs = NO WRAPPING PROBLEM
========================================================= */

const mainTitle = {
  display: "flex",

  flexDirection: "column",

  alignItems: "flex-start",

  margin: 0,

  padding: 0,
};


/* =========================================================
   TITLE LINE
========================================================= */

const titleLine = {
  display: "block",

  whiteSpace: "nowrap",

  fontFamily:
    "'Playfair Display', Georgia, serif",

  fontSize: "clamp(42px, 4.5vw, 62px)",

  lineHeight: "1.08",

  fontWeight: "800",

  letterSpacing: "-1.5px",

  background:
    "linear-gradient(90deg, #ffffff 0%, #67e8f9 55%, #60a5fa 100%)",

  WebkitBackgroundClip: "text",

  WebkitTextFillColor: "transparent",

  color: "#ffffff",

  margin: 0,

  padding: 0,
};


/* =========================================================
   DESCRIPTION
========================================================= */

const description = {
  margin: "22px 0 0",

  maxWidth: "700px",

  fontFamily: "Inter, sans-serif",

  fontSize: "14px",

  lineHeight: "1.7",

  color: "#cbd5e1",
};


/* =========================================================
   CYAN LINE
========================================================= */

const accentLine = {
  width: "54px",

  height: "2px",

  margin: "18px 0 16px",

  background: "#22d3ee",
};


/* =========================================================
   OPTIONS
========================================================= */

const options = {
  display: "flex",

  flexDirection: "column",

  gap: "8px",

  width: "375px",

  maxWidth: "100%",
};


/* =========================================================
   BUTTON
========================================================= */

const option = {
  width: "100%",

  minHeight: "58px",

  display: "flex",

  alignItems: "center",

  padding: "8px 14px",

  borderRadius: "8px",

  border:
    "1px solid rgba(148,163,184,0.18)",

  background:
    "rgba(8,18,38,0.68)",

  backdropFilter: "blur(12px)",

  color: "#fff",

  cursor: "pointer",

  textAlign: "left",

  fontFamily: "Inter, sans-serif",
};


/* =========================================================
   NUMBER
========================================================= */

const number = {
  width: "38px",

  fontSize: "10px",

  fontWeight: "700",

  color: "#22d3ee",

  letterSpacing: "1px",
};


/* =========================================================
   BUTTON TEXT
========================================================= */

const optionText = {
  display: "flex",

  flexDirection: "column",

  gap: "2px",

  flex: 1,
};


/* =========================================================
   ARROW
========================================================= */

const arrow = {
  fontSize: "20px",

  color: "#67e8f9",
};


/* =========================================================
   ERROR MESSAGE
========================================================= */

const message = {
  position: "fixed",

  top: "90px",

  left: "50%",

  transform: "translateX(-50%)",

  zIndex: 100,

  padding: "11px 20px",

  borderRadius: "8px",

  background:
    "rgba(220,38,38,0.95)",

  color: "#fff",

  fontFamily: "Inter, sans-serif",

  fontSize: "13px",

  whiteSpace: "nowrap",
};


export default Home;