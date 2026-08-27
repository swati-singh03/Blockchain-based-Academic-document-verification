import { useState, useContext } from "react";
import { createClient } from "@supabase/supabase-js";
import { LanguageContext } from "../LanguageContext";
import { useNavigate } from "react-router-dom";

const supabase = createClient(
  "https://hsudlrfytjodhbxageqq.supabase.co",
  "sb_publishable_DppV7TdeKSbPZErXCKSitQ_3TSDwhFE"
);

const UMIT_NAME = "Usha Mittal Institute of Technology";

function Login() {
  const { language } = useContext(LanguageContext);
  const navigate = useNavigate();

  const [mode, setMode] = useState("user");
  const [isSignup, setIsSignup] = useState(false);

  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [authorityType, setAuthorityType] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    if (loading) return;
    setLoading(true);

    try {
      // 🔥 LOAD AUTHORITY DATASET
   // 🔥 LOAD AUTHORITY DATASET
      const res = await fetch("/authorities.json");

      console.log("authorities.json status:", res.status, res.headers.get("content-type"));

      const rawData = await res.json();

      console.log("authorities.json raw data:", rawData);

      const authorities = Array.isArray(rawData)
        ? rawData
        : Array.isArray(rawData?.authorities)
        ? rawData.authorities
        : [];

      if (authorities.length === 0) {
        alert("❌ Authority list could not be loaded. Check authorities.json in /public folder.");
        setLoading(false);
        return;
      }

      const matchedAuthority = authorities.find(
        (auth) => auth.email === email && auth.password === password
      );

      // ================= SIGNUP =================
      if (isSignup) {
        // ❌ BLOCK UNAUTHORIZED / NON-UMIT AUTHORITY SIGNUP
        if (mode === "authority") {
          const exists = authorities.find(
            (auth) => auth.email === email && auth.name === UMIT_NAME
          );

          if (!exists) {
            alert("❌ Only Usha Mittal Institute of Technology (UMIT) is allowed");
            setLoading(false);
            return;
          }
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          alert(error.message);
          setLoading(false);
          return;
        }

        alert("Signup successful. Now login.");
        setIsSignup(false);
        setLoading(false);
        return;
      }

      // ================= LOGIN =================
      else {
        // ❌ BLOCK INVALID / NON-UMIT AUTHORITY LOGIN
        if (mode === "authority") {
          if (!matchedAuthority || matchedAuthority.name !== UMIT_NAME) {
            alert("❌ Only Usha Mittal Institute of Technology (UMIT) authority is allowed");
            setLoading(false);
            return;
          }
        }

        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          alert(error.message);
          setLoading(false);
          return;
        }

        // 🔥 STORE DATA
        localStorage.setItem("currentUser", email);
        localStorage.setItem("role", mode);

        if (mode === "authority") {
          localStorage.setItem("authority", matchedAuthority.name);
        }

        // 🔥 NAVIGATION
        if (mode === "user") {
          navigate("/Dashboard");
        } else if (mode === "authority") {
          navigate("/authority-dashboard");
        } else {
          navigate("/organization-dashboard");
        }
      }
    } catch (err) {
      console.log(err);
      alert("Something went wrong ❌");
    }

    setLoading(false);
  };

  return (
    <div style={wrapperStyle}>
      {/* BACKGROUND */}
      <video autoPlay muted loop playsInline style={videoStyle}>
        <source src="/videos.mp4" type="video/mp4" />
      </video>

      <div style={overlayStyle}></div>

      <div style={cardStyle}>
        <div style={iconBox}>🛡️</div>

        <h2 style={titleStyle}>
          {isSignup ? "Create Account" : "BlockVerify Login"}
        </h2>

        <p style={subtitleStyle}>Join the immutable document network.</p>

        {mode === "authority" && (
          <div style={umitBadge}>🎓 Authority access restricted to UMIT</div>
        )}

        {/* TABS */}
        <div style={tabContainer}>
          <button
            style={mode === "user" ? tabStyleActive : tabStyleInactive}
            onClick={() => setMode("user")}
          >
            User
          </button>

          <button
            style={mode === "authority" ? tabStyleActive : tabStyleInactive}
            onClick={() => setMode("authority")}
          >
            Authority
          </button>

          <button
            style={mode === "org" ? tabStyleActive : tabStyleInactive}
            onClick={() => setMode("org")}
          >
            Organization
          </button>
        </div>

        {/* SIGNUP EXTRA */}
        {isSignup && (
          <>
            <input
              type="text"
              placeholder="Full Name"
              style={inputStyle}
              onChange={(e) => setName(e.target.value)}
            />

            {mode === "authority" && (
              <input
                type="text"
                value={UMIT_NAME}
                disabled
                style={{ ...inputStyle, opacity: 0.7, cursor: "not-allowed" }}
              />
            )}

            {mode === "org" && (
              <input
                type="text"
                placeholder="Organization Name"
                style={inputStyle}
                onChange={(e) => setOrgName(e.target.value)}
              />
            )}
          </>
        )}

        <input
          type="email"
          placeholder="Email Address"
          style={inputStyle}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          style={inputStyle}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button style={buttonStyle} onClick={handleAuth} disabled={loading}>
          {loading ? "Please wait..." : isSignup ? "Create Account" : "Login"}
        </button>

        <p style={switchText}>
          {isSignup ? "Already have account?" : "New user?"}{" "}
          <span style={linkStyle} onClick={() => setIsSignup(!isSignup)}>
            {isSignup ? "Login here" : "Sign up here"}
          </span>
        </p>
      </div>
    </div>
  );
}

/* STYLES */

const wrapperStyle = {
  height: "100vh",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  position: "relative",
  overflow: "hidden",
};

const videoStyle = {
  position: "fixed",
  width: "100%",
  height: "100%",
  objectFit: "cover",
  zIndex: -2,
};

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.65)",
  zIndex: -1,
};

const cardStyle = {
  width: "550px",
  padding: "40px",
  borderRadius: "20px",
  background: "rgba(2,6,23,0.9)",
  border: "1px solid rgba(255,255,255,0.1)",
  boxShadow: "0 0 60px rgba(0,255,255,0.15)",
  textAlign: "center",
};

const iconBox = {
  width: "60px",
  height: "60px",
  margin: "0 auto 20px",
  borderRadius: "15px",
  background: "rgba(0,255,255,0.1)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "24px",
  color: "#00ffff",
};

const titleStyle = {
  color: "white",
  marginBottom: "5px",
};

const subtitleStyle = {
  color: "#94a3b8",
  fontSize: "14px",
  marginBottom: "15px",
};

const umitBadge = {
  display: "inline-block",
  background: "rgba(0,255,255,0.1)",
  border: "1px solid rgba(0,255,255,0.4)",
  color: "#00ffff",
  fontSize: "12px",
  fontWeight: 600,
  padding: "6px 14px",
  borderRadius: "20px",
  marginBottom: "15px",
};

const tabContainer = {
  display: "flex",
  gap: "10px",
  marginBottom: "20px",
};

const tabStyleActive = {
  flex: 1,
  padding: "10px",
  borderRadius: "10px",
  border: "1px solid #00ffff",
  background: "rgba(0,255,255,0.1)",
  color: "#00ffff",
  cursor: "pointer",
};

const tabStyleInactive = {
  flex: 1,
  padding: "10px",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "transparent",
  color: "#94a3b8",
  cursor: "pointer",
};

const inputStyle = {
  width: "100%",
  padding: "14px",
  margin: "10px 0",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "#020617",
  color: "white",
  outline: "none",
};

const buttonStyle = {
  width: "100%",
  padding: "14px",
  borderRadius: "10px",
  border: "none",
  background: "linear-gradient(90deg,#00ffff,#06b6d4)",
  color: "black",
  fontWeight: "bold",
  cursor: "pointer",
  marginTop: "10px",
};

const switchText = {
  color: "#94a3b8",
  marginTop: "15px",
};

const linkStyle = {
  color: "#a855f7",
  cursor: "pointer",
};

export default Login;