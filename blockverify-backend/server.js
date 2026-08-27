require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use(require("./routes/verifyDocumentAi"));

app.listen(5000, () => console.log("✅ Server running on http://localhost:5000"));