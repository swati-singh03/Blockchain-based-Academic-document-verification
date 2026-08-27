import { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import SHA256 from "crypto-js/sha256";
import { LanguageContext } from "../LanguageContext";
import "./VerifyPage.css";

export default function VerifyPage(){

const navigate = useNavigate();
const { language } = useContext(LanguageContext);

const text = {

en:{
title:"Select Document Type",
verify:"Verify Document",
back:"Back",
selected:"Selected",
upload:"Choose File"
},

hi:{
title:"दस्तावेज़ प्रकार चुनें",
verify:"दस्तावेज़ सत्यापित करें",
back:"वापस",
selected:"चयनित",
upload:"फ़ाइल चुनें"
},

es:{
title:"Seleccione tipo de documento",
verify:"Verificar documento",
back:"Atrás",
selected:"Seleccionado",
upload:"Elegir archivo"
},

fr:{
title:"Sélectionnez le type de document",
verify:"Vérifier le document",
back:"Retour",
selected:"Sélectionné",
upload:"Choisir le fichier"
},

de:{
title:"Dokumenttyp auswählen",
verify:"Dokument prüfen",
back:"Zurück",
selected:"Ausgewählt",
upload:"Datei wählen"
}

};

const t = text[language] || text.en;

const [file,setFile] = useState(null);
const [selected,setSelected] = useState(null);

const documents = [

"Aadhar Card",
"PAN Card",
"Passport",
"Driving License",
"Marksheet",
"Degree Certificate",
"Birth Certificate",
"Income Certificate"

];

const handleVerify = ()=>{

if(!file){
alert("Upload document first");
return;
}

const reader = new FileReader();

reader.onload = (e)=>{

const hash = SHA256(e.target.result).toString();

navigate("/dashboard",{
state:{
file:{
name:file.name,
type:file.type,
hash:hash
}
}
});

alert("Document verified successfully ✔");

};

reader.readAsBinaryString(file);

};

return(

<div className="verifyPage">

<h1 className="verifyTitle">
{t.title}
</h1>

{/* DOCUMENT BUTTONS */}

<div className="docGrid">

{documents.map((doc,i)=>(

<button
key={i}
className={`docButton ${selected===doc ? "active":""}`}
onClick={()=>setSelected(doc)}
>

{doc}

</button>

))}

</div>

{/* FILE UPLOAD */}

{selected && (

<>

<h2 className="selectedDoc">
{t.selected}: {selected}
</h2>

<div className="uploadBox">

<input
type="file"
accept="application/pdf"
onChange={(e)=>setFile(e.target.files[0])}
/>

<button
className="verifyBtn"
onClick={handleVerify}
>
{t.verify}
</button>

</div>

</>

)}

<button
className="backBtn"
onClick={()=>navigate("/dashboard")}
>
{t.back}
</button>

</div>

)

}