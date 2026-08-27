import { useState, useContext } from "react";
import { LanguageContext } from "../LanguageContext";

function Developers() {

  const { language } = useContext(LanguageContext);
  const [active, setActive] = useState(null);

const content = {

  en: {
    pageTitle: "Developer Tools",
    subtitle: "Build powerful blockchain-based verification systems using our robust API, smart contracts and SDK ecosystem.",

    1: {
      title: "REST API",
      short: "Integrate verification into your applications.",
      desc: "Our REST API enables seamless document verification integration into any system using secure endpoints and blockchain-backed responses."
    },
    2: {
      title: "Smart Contracts",
      short: "Ethereum-based blockchain support.",
      desc: "Ethereum-based smart contracts store hashes immutably ensuring tamper-proof, decentralized document validation."
    },
    3: {
      title: "SDK Support",
      short: "Developer toolkit for blockchain interaction.",
      desc: "Our SDK provides prebuilt blockchain tools for easy hashing, verification, and validation using simple functions."
    },

    step1: "Step 1",
    step1Desc: "Generate document hash.",
    step2: "Step 2",
    step2Desc: "Store hash on blockchain.",
    step3: "Step 3",
    step3Desc: "Verify authenticity anytime."
  },

  hi: {
    pageTitle: "डेवलपर टूल्स",
    subtitle: "हमारे API, स्मार्ट कॉन्ट्रैक्ट और SDK का उपयोग करके शक्तिशाली ब्लॉकचेन सिस्टम बनाएं।",

    1: {
      title: "REST API",
      short: "अपने एप्लिकेशन में वेरिफिकेशन जोड़ें।",
      desc: "हमारा REST API सुरक्षित एंडपॉइंट्स के माध्यम से दस्तावेज़ सत्यापन की सुविधा देता है।"
    },
    2: {
      title: "स्मार्ट कॉन्ट्रैक्ट",
      short: "Ethereum आधारित ब्लॉकचेन सपोर्ट।",
      desc: "स्मार्ट कॉन्ट्रैक्ट हैश को सुरक्षित और स्थायी रूप से स्टोर करते हैं।"
    },
    3: {
      title: "SDK सपोर्ट",
      short: "ब्लॉकचेन इंटरैक्शन के लिए टूलकिट।",
      desc: "SDK आसान हैशिंग और वेरिफिकेशन के लिए टूल देता है।"
    },

    step1: "चरण 1",
    step1Desc: "दस्तावेज़ हैश बनाएं।",
    step2: "चरण 2",
    step2Desc: "हैश ब्लॉकचेन पर स्टोर करें।",
    step3: "चरण 3",
    step3Desc: "कभी भी सत्यापन करें।"
  },

  es: {
    pageTitle: "Herramientas para Desarrolladores",
    subtitle: "Construya sistemas blockchain usando nuestra API, contratos inteligentes y SDK.",

    1: {
      title: "API REST",
      short: "Integra verificación en tus aplicaciones.",
      desc: "Nuestra API permite integrar la verificación de documentos mediante endpoints seguros respaldados por blockchain."
    },
    2: {
      title: "Contratos Inteligentes",
      short: "Soporte blockchain basado en Ethereum.",
      desc: "Los contratos inteligentes almacenan hashes de forma inmutable garantizando validación descentralizada."
    },
    3: {
      title: "Soporte SDK",
      short: "Kit de herramientas para interacción blockchain.",
      desc: "Nuestro SDK ofrece herramientas listas para hashing y validación de manera sencilla."
    },

    step1: "Paso 1",
    step1Desc: "Generar hash del documento.",
    step2: "Paso 2",
    step2Desc: "Guardar hash en blockchain.",
    step3: "Paso 3",
    step3Desc: "Verificar autenticidad en cualquier momento."
  },

  fr: {
    pageTitle: "Outils Développeur",
    subtitle: "Construisez des systèmes blockchain puissants avec notre API et SDK.",

    1: {
      title: "API REST",
      short: "Intégrez la vérification dans vos applications.",
      desc: "Notre API permet l'intégration sécurisée de la vérification de documents via blockchain."
    },
    2: {
      title: "Smart Contracts",
      short: "Support basé sur Ethereum.",
      desc: "Les smart contracts stockent les hash de manière immuable pour garantir la sécurité."
    },
    3: {
      title: "Support SDK",
      short: "Outils blockchain prêts à l'emploi.",
      desc: "Le SDK fournit des outils simples pour le hashing et la validation."
    },

    step1: "Étape 1",
    step1Desc: "Générer le hash du document.",
    step2: "Étape 2",
    step2Desc: "Stocker le hash sur la blockchain.",
    step3: "Étape 3",
    step3Desc: "Vérifier l'authenticité à tout moment."
  },

  de: {
    pageTitle: "Entwickler Werkzeuge",
    subtitle: "Erstellen Sie leistungsstarke Blockchain-Systeme mit unserer API und SDK.",

    1: {
      title: "REST API",
      short: "Integrieren Sie Verifizierung in Ihre Anwendungen.",
      desc: "Unsere API ermöglicht sichere Dokumentenprüfung über Blockchain-gestützte Endpunkte."
    },
    2: {
      title: "Smart Contracts",
      short: "Ethereum-basierte Unterstützung.",
      desc: "Smart Contracts speichern Hashes unveränderlich und gewährleisten dezentrale Validierung."
    },
    3: {
      title: "SDK Unterstützung",
      short: "Blockchain Toolkit.",
      desc: "Das SDK bietet einfache Funktionen für Hashing und Validierung."
    },

    step1: "Schritt 1",
    step1Desc: "Dokumenten-Hash generieren.",
    step2: "Schritt 2",
    step2Desc: "Hash auf Blockchain speichern.",
    step3: "Schritt 3",
    step3Desc: "Authentizität jederzeit überprüfen."
  }

};

  const data = content[language];

  return (
    <>
      <style>{`
        /* SAME CSS — NOTHING TOUCHED */
        .dev-wrapper { min-height: 100vh; padding: 120px 60px; text-align: center; color: white; position: relative; overflow: hidden; }
        .dev-video { position: fixed; width: 100%; height: 100%; object-fit: cover; z-index: -2; }
        .dev-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: -1; }
        .dev-title { font-size: 52px; margin-bottom: 20px; animation: fadeDown 1s ease; }
        @keyframes fadeDown { from { opacity: 0; transform: translateY(-30px); } to { opacity: 1; } }
        .dev-subtitle { max-width: 700px; margin: auto; color: #94a3b8; margin-bottom: 70px; font-size: 18px; }
        .dev-grid { display: flex; justify-content: center; gap: 60px; flex-wrap: wrap; }
        .dev-card { width: 300px; padding: 35px; border-radius: 20px; background: rgba(255,255,255,0.08); backdrop-filter: blur(15px); transition: 0.5s ease; cursor: pointer; box-shadow: 0 0 30px rgba(0,200,255,0.2); }
        .dev-card:hover { transform: translateY(-15px) scale(1.05); box-shadow: 0 0 50px rgba(0,200,255,0.6); }
        .dev-card img { width: 120px; margin-bottom: 20px; transition: 0.4s ease; }
        .dev-card:hover img { transform: rotate(5deg) scale(1.1); }
        .process-section { margin-top: 120px; display: flex; justify-content: center; gap: 80px; flex-wrap: wrap; }
        .process-box { width: 220px; padding: 25px; border-radius: 18px; background: rgba(255,255,255,0.06); backdrop-filter: blur(10px); transition: 0.4s ease; }
        .process-box:hover { transform: scale(1.05); box-shadow: 0 0 40px rgba(0,255,255,0.4); }
        .circle-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; justify-content: center; align-items: center; animation: fadeIn 0.4s ease; }
        .circle-modal { width: 500px; height: 500px; border-radius: 50%; background: radial-gradient(circle at center, #0ea5e9, #0f172a); display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 60px; position: relative; animation: zoomIn 0.5s ease; box-shadow: 0 0 100px rgba(0,255,255,0.7); }
        @keyframes zoomIn { from { transform: scale(0); } to { transform: scale(1); } }
        .close-btn { position: absolute; top: 35px; right: 60px; font-size: 22px; cursor: pointer; }
      `}</style>

      <video autoPlay muted loop playsInline className="dev-video">
        <source src="/videos.mp4" type="video/mp4" />
      </video>

      <div className="dev-overlay"></div>

      <div className="dev-wrapper">

        <h1 className="dev-title">{data.pageTitle}</h1>
        <p className="dev-subtitle">{data.subtitle}</p>

        <div className="dev-grid">
          <div className="dev-card" onClick={() => setActive(1)}>
            <img src="/image3.png" alt="API"/>
            <h3>{data[1].title}</h3>
            <p>{data[1].short}</p>
          </div>

          <div className="dev-card" onClick={() => setActive(2)}>
            <img src="/image4.png" alt="Smart Contracts"/>
            <h3>{data[2].title}</h3>
            <p>{data[2].short}</p>
          </div>

          <div className="dev-card" onClick={() => setActive(3)}>
            <img src="/image5.png" alt="SDK"/>
            <h3>{data[3].title}</h3>
            <p>{data[3].short}</p>
          </div>
        </div>

        <div className="process-section">
          <div className="process-box">
            <h4>{data.step1}</h4>
            <p>{data.step1Desc}</p>
          </div>
          <div className="process-box">
            <h4>{data.step2}</h4>
            <p>{data.step2Desc}</p>
          </div>
          <div className="process-box">
            <h4>{data.step3}</h4>
            <p>{data.step3Desc}</p>
          </div>
        </div>

      </div>

      {active && (
        <div className="circle-overlay" onClick={() => setActive(null)}>
          <div className="circle-modal" onClick={(e) => e.stopPropagation()}>
            <div className="close-btn" onClick={() => setActive(null)}>✖</div>
            <h2>{data[active].title}</h2>
            <p>{data[active].desc}</p>
          </div>
        </div>
      )}

    </>
  );
}

export default Developers;