import { useState, useContext } from "react";
import { LanguageContext } from "../LanguageContext";

function Security() {

  const { language } = useContext(LanguageContext);
  const [active, setActive] = useState(null);

  const content = {

    en: {
      title: "Security Architecture",

      hash: "SHA-256 Hashing",
      hashShort: "Every record converted into secure digital fingerprint.",
      hashFull:
        "SHA-256 generates a unique 256-bit hash value for every document.\n\nEven a single character change produces a completely different hash.\n\nExample: If a certificate name is changed, the hash becomes totally new.\n\nThis ensures tamper detection.\n\nIt protects document integrity and prevents fraud.",

      decentral: "Decentralization",
      decentralShort: "No central authority can modify stored records.",
      decentralFull:
        "Blockchain distributes data across multiple nodes.\n\nNo single authority controls the records.\n\nEven if one server fails, data remains safe.\n\nExample: A university cannot secretly edit a stored certificate.\n\nThis creates transparency and trust.",

      proof: "Cryptographic Proof",
      proofShort: "Ensures authenticity and integrity of documents.",
      proofFull:
        "Cryptographic proof verifies that stored hash matches original file.\n\nIf hashes match, the document is authentic.\n\nIf not, it has been altered.\n\nExample: Employer verifies degree before hiring.\n\nThis guarantees authenticity.",

      encrypt: "256-bit Encryption",
      encryptDesc: "Advanced cryptographic security standard.",

      integrity: "Data Integrity",
      integrityDesc: "Every record remains unaltered and verifiable.",

      tamper: "Tamper Resistant",
      tamperDesc: "Immutable blockchain storage prevents modification."
    },

    hi: {
      title: "सुरक्षा संरचना",

      hash: "SHA-256 हैशिंग",
      hashShort: "हर रिकॉर्ड सुरक्षित डिजिटल फिंगरप्रिंट में बदला जाता है।",
      hashFull:
        "SHA-256 हर दस्तावेज़ के लिए यूनिक 256-बिट हैश बनाता है।\n\nएक अक्षर बदलने पर भी नया हैश बन जाता है।\n\nउदाहरण: यदि प्रमाणपत्र की तारीख बदली जाए तो हैश बदल जाएगा।\n\nइससे छेड़छाड़ तुरंत पकड़ी जाती है।\n\nयह धोखाधड़ी रोकता है।",

      decentral: "विकेंद्रीकरण",
      decentralShort: "कोई केंद्रीय प्राधिकरण रिकॉर्ड बदल नहीं सकता।",
      decentralFull:
        "ब्लॉकचेन डेटा को कई नोड्स में वितरित करता है।\n\nकोई एक संस्था नियंत्रण नहीं कर सकती।\n\nएक सर्वर फेल होने पर भी डेटा सुरक्षित रहता है।\n\nउदाहरण: विश्वविद्यालय रिकॉर्ड गुप्त रूप से नहीं बदल सकता।\n\nयह पारदर्शिता बढ़ाता है।",

      proof: "क्रिप्टोग्राफिक प्रमाण",
      proofShort: "दस्तावेज़ की प्रामाणिकता सुनिश्चित करता है।",
      proofFull:
        "क्रिप्टोग्राफिक सत्यापन हैश को मूल फ़ाइल से मिलाता है।\n\nहैश मेल खाए तो दस्तावेज़ असली है।\n\nमेल न खाए तो बदलाव हुआ है।\n\nउदाहरण: नौकरी से पहले डिग्री सत्यापन।\n\nयह असलियत की गारंटी देता है।",

      encrypt: "256-बिट एन्क्रिप्शन",
      encryptDesc: "उन्नत क्रिप्टोग्राफिक सुरक्षा मानक।",

      integrity: "डेटा अखंडता",
      integrityDesc: "रिकॉर्ड बिना बदलाव सुरक्षित रहते हैं।",

      tamper: "छेड़छाड़ प्रतिरोधी",
      tamperDesc: "ब्लॉकचेन स्टोरेज बदलाव रोकता है।"
    },

    es: {
      title: "Arquitectura de Seguridad",

      hash: "Hash SHA-256",
      hashShort: "Cada registro se convierte en huella digital segura.",
      hashFull:
        "SHA-256 genera un hash único de 256 bits.\n\nUn pequeño cambio crea un hash completamente diferente.\n\nEjemplo: cambiar un nombre cambia el hash.\n\nEsto detecta manipulaciones.\n\nProtege contra fraude.",

      decentral: "Descentralización",
      decentralShort: "Ninguna autoridad central puede modificar registros.",
      decentralFull:
        "Blockchain distribuye datos en múltiples nodos.\n\nNadie tiene control absoluto.\n\nSi un servidor falla, los datos siguen seguros.\n\nEjemplo: universidad no puede editar certificado.\n\nGenera confianza.",

      proof: "Prueba Criptográfica",
      proofShort: "Garantiza autenticidad e integridad.",
      proofFull:
        "La verificación compara el hash con el archivo original.\n\nSi coincide, es auténtico.\n\nSi no, fue alterado.\n\nEjemplo: empresa verifica título.\n\nGarantiza autenticidad.",

      encrypt: "Encriptación 256-bit",
      encryptDesc: "Estándar avanzado de seguridad.",

      integrity: "Integridad de Datos",
      integrityDesc: "Los registros permanecen inalterados.",

      tamper: "Resistente a Manipulación",
      tamperDesc: "Blockchain evita modificaciones."
    },

    fr: {
      title: "Architecture de Sécurité",

      hash: "Hachage SHA-256",
      hashShort: "Chaque document devient une empreinte numérique sécurisée.",
      hashFull:
        "SHA-256 génère un hash unique de 256 bits.\n\nUne petite modification change totalement le hash.\n\nExemple: changer un nom modifie le hash.\n\nCela détecte la falsification.\n\nProtège contre la fraude.",

      decentral: "Décentralisation",
      decentralShort: "Aucune autorité centrale ne peut modifier les données.",
      decentralFull:
        "La blockchain distribue les données sur plusieurs nœuds.\n\nAucune entité unique ne contrôle tout.\n\nMême si un serveur tombe en panne, les données restent.\n\nExemple: université ne peut pas modifier un diplôme.\n\nRenforce la confiance.",

      proof: "Preuve Cryptographique",
      proofShort: "Garantit authenticité et intégrité.",
      proofFull:
        "La vérification compare le hash au fichier original.\n\nSi identique, document authentique.\n\nSinon, il a été modifié.\n\nExemple: entreprise vérifie diplôme.\n\nAssure authenticité.",

      encrypt: "Chiffrement 256-bit",
      encryptDesc: "Norme avancée de sécurité.",

      integrity: "Intégrité des Données",
      integrityDesc: "Les enregistrements restent inchangés.",

      tamper: "Résistant à la Modification",
      tamperDesc: "Blockchain empêche toute modification."
    },

    de: {
      title: "Sicherheitsarchitektur",

      hash: "SHA-256 Hashing",
      hashShort: "Jeder Datensatz wird in einen digitalen Fingerabdruck umgewandelt.",
      hashFull:
        "SHA-256 erzeugt einen einzigartigen 256-Bit-Hash.\n\nEine kleine Änderung erzeugt einen völlig neuen Hash.\n\nBeispiel: Namensänderung verändert Hash.\n\nManipulation wird erkannt.\n\nSchützt vor Betrug.",

      decentral: "Dezentralisierung",
      decentralShort: "Keine zentrale Autorität kann Daten ändern.",
      decentralFull:
        "Blockchain verteilt Daten auf mehrere Knoten.\n\nKeine einzelne Kontrolle.\n\nBei Serverausfall bleiben Daten sicher.\n\nBeispiel: Universität kann Zeugnis nicht ändern.\n\nSchafft Vertrauen.",

      proof: "Kryptografischer Nachweis",
      proofShort: "Gewährleistet Authentizität.",
      proofFull:
        "Hash wird mit Originaldatei verglichen.\n\nWenn identisch, ist Dokument echt.\n\nSonst wurde es verändert.\n\nBeispiel: Arbeitgeber prüft Zertifikat.\n\nGarantiert Echtheit.",

      encrypt: "256-Bit Verschlüsselung",
      encryptDesc: "Fortschrittlicher Sicherheitsstandard.",

      integrity: "Datenintegrität",
      integrityDesc: "Datensätze bleiben unverändert.",

      tamper: "Manipulationssicher",
      tamperDesc: "Blockchain verhindert Änderungen."
    }

  };

  const t = content[language] || content.en;

  return (
    <div className="security-wrapper">

      {/* VIDEO */}
      <video autoPlay muted loop playsInline style={{
        position:"fixed",
        width:"100%",
        height:"100%",
        objectFit:"cover",
        zIndex:-2
      }}>
        <source src="/videos.mp4" type="video/mp4" />
      </video>

      <div style={{
        position:"fixed",
        inset:0,
        background:"rgba(0,0,0,0.6)",
        zIndex:-1
      }}></div>

      <h1 className="security-title">{t.title}</h1>

      <div className="security-grid">

        {[1,2,3].map((num) => {
          const key = num === 1 ? "hash" : num === 2 ? "decentral" : "proof";
          return (
            <div
              key={num}
              className="security-card"
              onClick={() => setActive(active === num ? null : num)}
              style={{cursor:"pointer"}}
            >
              <img src={`image${num}.png`} alt="" className="security-img" />
              <h3>{t[key]}</h3>
              <p style={{whiteSpace:"pre-line"}}>
                {active === num ? t[key+"Full"] : t[key+"Short"]}
              </p>
            </div>
          );
        })}

      </div>

      <div className="trust-section">

        <div className="trust-item">
          <div className="trust-icon">🔐</div>
          <h4>{t.encrypt}</h4>
          <p>{t.encryptDesc}</p>
        </div>

        <div className="trust-item">
          <div className="trust-icon">🛡</div>
          <h4>{t.integrity}</h4>
          <p>{t.integrityDesc}</p>
        </div>

        <div className="trust-item">
          <div className="trust-icon">⚡</div>
          <h4>{t.tamper}</h4>
          <p>{t.tamperDesc}</p>
        </div>

      </div>

    </div>
  );
}

export default Security;