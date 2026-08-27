import "./About.css";

function About() {
  return (
    <div className="about-page">

      {/* =========================
          HERO
      ========================== */}

      <div className="about-hero">
        <h1>BlockVerify</h1>

        <p>
          A blockchain-based document verification system
          designed to bring security, transparency, and trust
          to academic records.
        </p>
      </div>


      {/* =========================
          SYSTEM ROLES
      ========================== */}

      <div className="about-section">

        <h2>System Roles</h2>

        <div className="about-grid">

          {/* USER */}

          <div className="about-card">

            <div className="about-icon">
              👤
            </div>

            <h3>
              User
            </h3>

            <p>
              Uploads academic documents and submits them
              for verification.
            </p>

          </div>


          {/* AUTHORITY */}

          <div className="about-card">

            <div className="about-icon">
              🏫
            </div>

            <h3>
              Authority
            </h3>

            <p>
              Reviews submitted documents using automated
              checks and manual verification.
            </p>

          </div>


          {/* ORGANIZATION */}

          <div className="about-card">

            <div className="about-icon">
              🏢
            </div>

            <h3>
              Organization
            </h3>

            <p>
              Checks verified academic documents before
              accepting them for official use.
            </p>

          </div>


          {/* ADMIN */}

          <div className="about-card">

            <div className="about-icon">
              🛠
            </div>

            <h3>
              Admin
            </h3>

            <p>
              Manages the platform and approves or rejects
              registered authorities.
            </p>

          </div>

        </div>
      </div>


      {/* =========================
          CORE FEATURES
      ========================== */}

      <div className="about-section">

        <h2>Core Features</h2>

        <div className="about-grid">

          {/* HASHING */}

          <div className="about-card">

            <div className="about-icon">
              🔐
            </div>

            <h3>
              SHA-256 Hashing
            </h3>

            <p>
              Each document is converted into a unique
              SHA-256 hash for secure identification.
            </p>

          </div>


          {/* BLOCKCHAIN */}

          <div className="about-card">

            <div className="about-icon">
              ⛓
            </div>

            <h3>
              Blockchain Storage
            </h3>

            <p>
              Document hashes are recorded on blockchain
              for tamper-resistant verification.
            </p>

          </div>


          {/* AI */}

          <div className="about-card">

            <div className="about-icon">
              🤖
            </div>

            <h3>
              AI Verification
            </h3>

            <p>
              OCR and AI-assisted analysis help detect
              suspicious changes in documents.
            </p>

          </div>


          {/* AUDIT */}

          <div className="about-card">

            <div className="about-icon">
              📊
            </div>

            <h3>
              Audit Trail
            </h3>

            <p>
              Keeps track of important verification
              activities and document events.
            </p>

          </div>

        </div>
      </div>


      {/* =========================
          WORKFLOW
      ========================== */}

      <div className="about-section">

        <h2>How It Works</h2>

        <div className="timeline">

          <div
            className="step"
            data-step="01"
          >
            <span>
              Upload
            </span>

            <small>
              Document
            </small>
          </div>


          <div
            className="step"
            data-step="02"
          >
            <span>
              Generate
            </span>

            <small>
              SHA-256 Hash
            </small>
          </div>


          <div
            className="step"
            data-step="03"
          >
            <span>
              Store
            </span>

            <small>
              On Blockchain
            </small>
          </div>


          <div
            className="step"
            data-step="04"
          >
            <span>
              Submit
            </span>

            <small>
              To Authority
            </small>
          </div>


          <div
            className="step"
            data-step="05"
          >
            <span>
              Verify
            </span>

            <small>
              Auto + Manual
            </small>
          </div>

        </div>
      </div>


      {/* =========================
          FINAL INFO
      ========================== */}

      <div className="about-info">

        <h3>
          Built for Trusted Digital Records
        </h3>

        <p>
          BlockVerify combines document analysis,
          cryptographic hashing, and blockchain technology
          to provide a reliable way to verify academic records.
        </p>

      </div>

    </div>
  );
}

export default About;