import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import {
Chart as ChartJS,
CategoryScale,
LinearScale,
BarElement,
Title,
Tooltip,
Legend
} from "chart.js";

import { Bar } from "react-chartjs-2";

import "./Dashboard.css";

ChartJS.register(
CategoryScale,
LinearScale,
BarElement,
Title,
Tooltip,
Legend
);

export default function OrganizationDashboard(){

const navigate = useNavigate();

/* DOCUMENTS */

const [docs,setDocs] = useState(
JSON.parse(localStorage.getItem("orgDocs")) || []
);

/* CHART DATA */

const [chartData,setChartData] = useState(null);


/* GENERATE GRAPH */

useEffect(()=>{

const months = [
"Jan","Feb","Mar","Apr","May","Jun",
"Jul","Aug","Sep","Oct","Nov","Dec"
];

const monthlyVerified = new Array(12).fill(0);
const monthlyFake = new Array(12).fill(0);

docs.forEach(doc=>{

if(!doc.date) return;

const date = new Date(doc.date);
const month = date.getMonth();

if(doc.status === "Verified"){
monthlyVerified[month]++;
}else{
monthlyFake[month]++;
}

});

setChartData({

labels: months,

datasets:[

{
label:"Verified Documents",
data: monthlyVerified,
backgroundColor:"#00c6ff",
borderRadius:10
},

{
label:"Fake Documents",
data: monthlyFake,
backgroundColor:"#00ff9c",
borderRadius:10
}

]

});

},[docs]);


/* AUTO UPDATE */

useEffect(()=>{

const interval = setInterval(()=>{

const stored = JSON.parse(localStorage.getItem("orgDocs")) || [];

setDocs(stored);

},2000);

return ()=>clearInterval(interval);

},[]);


const totalDocs = docs.length;

const verifiedDocs = docs.filter(d=>d.status==="Verified").length;

const fakeDocs = docs.filter(d=>d.status==="Fake").length;


return(

<>

{/* VIDEO BACKGROUND */}

<video
autoPlay
muted
loop
playsInline
style={{
position:"fixed",
width:"100%",
height:"100%",
objectFit:"cover",
zIndex:-2
}}
>
<source src="/videos.mp4" type="video/mp4" />
</video>


{/* DARK OVERLAY */}

<div
style={{
position:"fixed",
inset:0,
background:"rgba(0,0,0,0.65)",
zIndex:-1
}}
></div>


<div className="dashboard fade-in">

<h1 className="dash-title">
Organization Dashboard
</h1>


{/* STATS */}

<div className="stats">

<div className="card glow">
<h2>{totalDocs}</h2>
<p>Total Documents</p>
</div>

<div className="card glow">
<h2>{verifiedDocs}</h2>
<p>Verified Records</p>
</div>

<div className="card glow">
<h2>256</h2>
<p>Hash Bits</p>
</div>

<div className="card glow">
<h2>{fakeDocs}</h2>
<p>Fake Documents</p>
</div>

</div>


{/* GRAPH */}

<div className="chart-box">

<h2>Verification Analytics</h2>

{chartData && (

<Bar
data={chartData}
options={{
responsive:true,
maintainAspectRatio:false,
plugins:{
legend:{
labels:{color:"#fff"}
}
},
scales:{
x:{
ticks:{color:"#ccc"},
grid:{color:"rgba(255,255,255,0.05)"}
},
y:{
ticks:{color:"#ccc"},
grid:{color:"rgba(255,255,255,0.05)"}
}
}
}}
height={180}
/>

)}

</div>


{/* PROCESS */}

<div className="process">

<div className="step">📄 Upload Document</div>
<div className="step">🔐 SHA256 Hash</div>
<div className="step">⛓ Blockchain Storage</div>
<div className="step">✔ Instant Verification</div>

</div>


{/* VERIFY BUTTON */}

<div className="verify-section">

<button
className="verify-btn"
onClick={()=>navigate("/verify-record")}
>
Verify Documents
</button>

</div>


{/* TABLE */}

<div className="table-box">

<h2>Recent Verifications</h2>

<table>

<thead>

<tr>
<th>Document Name</th>
<th>Verified Time</th>
<th>Status</th>
</tr>

</thead>

<tbody>

{docs.map((doc,i)=>(

<tr key={i}>

<td>{doc.name}</td>

<td>{new Date(doc.date).toLocaleString()}</td>

<td className={doc.status === "Verified" ? "verified" : "fake"}>
{doc.status}
</td>

</tr>

))}

</tbody>

</table>

</div>


</div>

</>

);

}