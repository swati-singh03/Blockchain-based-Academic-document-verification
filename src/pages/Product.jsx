import { useNavigate } from "react-router-dom";
import { useContext } from "react";
import { LanguageContext } from "../LanguageContext";

function Product() {
  const navigate = useNavigate();
  const { language } = useContext(LanguageContext);

  const content = {

    en: {
      title: "Our Product",
      upload: "Upload Record",
      uploadDesc: "User uploads digital certificate.",
      verify: "Verify Record",
      verifyDesc: "Check document authenticity using blockchain.",
      store: "Store on Blockchain",
      storeDesc: "Data becomes immutable and tamper-proof."
    },

    hi: {
      title: "हमारा प्रोडक्ट",
      upload: "रिकॉर्ड अपलोड करें",
      uploadDesc: "उपयोगकर्ता डिजिटल प्रमाणपत्र अपलोड करता है।",
      verify: "रिकॉर्ड सत्यापित करें",
      verifyDesc: "ब्लॉकचेन द्वारा दस्तावेज़ की प्रामाणिकता जांचें।",
      store: "ब्लॉकचेन पर स्टोर करें",
      storeDesc: "डेटा अपरिवर्तनीय और सुरक्षित बन जाता है।"
    },

    es: {
      title: "Nuestro Producto",
      upload: "Subir Registro",
      uploadDesc: "El usuario sube un certificado digital.",
      verify: "Verificar Registro",
      verifyDesc: "Comprobar autenticidad usando blockchain.",
      store: "Guardar en Blockchain",
      storeDesc: "Los datos se vuelven inmutables y seguros."
    },

    fr: {
      title: "Notre Produit",
      upload: "Télécharger un Document",
      uploadDesc: "L'utilisateur télécharge un certificat numérique.",
      verify: "Vérifier le Document",
      verifyDesc: "Vérifier l'authenticité via la blockchain.",
      store: "Stocker sur la Blockchain",
      storeDesc: "Les données deviennent immuables et sécurisées."
    },

    de: {
      title: "Unser Produkt",
      upload: "Datensatz Hochladen",
      uploadDesc: "Benutzer lädt digitales Zertifikat hoch.",
      verify: "Datensatz Prüfen",
      verifyDesc: "Authentizität mit Blockchain überprüfen.",
      store: "Auf Blockchain Speichern",
      storeDesc: "Daten werden unveränderlich und sicher."
    }

  };

  const t = content[language] || content.en;

  return (
    <>
      {/* VIDEO BACKGROUND */}
      <video
        autoPlay
        muted
        loop
        playsInline
        style={{
          position: "fixed",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          zIndex: -2
        }}
      >
        <source src="/videos.mp4" type="video/mp4" />
      </video>

      {/* DARK OVERLAY */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          zIndex: -1
        }}
      ></div>

      <div className="features">
        <h1>{t.title}</h1>

        <div className="feature-grid">

          <div
            className="feature-card"
            onClick={() => navigate("/add")}
            style={{ cursor: "pointer" }}
          >
            <h3>{t.upload}</h3>
            <p>{t.uploadDesc}</p>
          </div>

          <div
            className="feature-card"
            onClick={() => navigate("/verify")}
            style={{ cursor: "pointer" }}
          >
            <h3>{t.verify}</h3>
            <p>{t.verifyDesc}</p>
          </div>

          <div className="feature-card">
            <h3>{t.store}</h3>
            <p>{t.storeDesc}</p>
          </div>

        </div>
      </div>
    </>
  );
}

export default Product;