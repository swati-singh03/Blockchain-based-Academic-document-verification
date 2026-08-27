import "./index.css";

import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { DocumentProvider } from "./context/DocumentContext";

import Navbar from "./components/Navbar";

import Home from "./pages/Home";
import Intro from "./pages/intro";
import Dashboard from "./pages/Dashboard";
import AuthorityDashboard from "./pages/AuthorityDashboard";
import OrganizationDashboard from "./pages/OrganizationDashboard";

import Login from "./pages/Login";

import AddRecord from "./pages/AddRecord";
import VerifyRecord from "./pages/VerifyRecord";
import VerifyPage from "./pages/VerifyPage";
import Documentverify from "./pages/Documentverify";

import About from "./pages/About";

function Layout() {
  const location = useLocation();

  return (
    <>
      {/* Navbar hide on intro */}
      {location.pathname !== "/intro" && <Navbar />}

      <Routes>
        {/* MAIN */}
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/intro" element={<Intro />} />

        {/* DASHBOARDS */}
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/authority-dashboard" element={<AuthorityDashboard />} />
        <Route path="/organization-dashboard" element={<OrganizationDashboard />} />

        {/* VERIFICATION */}
        <Route path="/verify" element={<VerifyRecord />} />
        <Route path="/verify-document" element={<VerifyPage />} />
        <Route path="/verify-document/:id" element={<Documentverify />} />
        <Route path="/verify-record" element={<VerifyRecord />} />

        {/* ADD */}
        <Route path="/add" element={<AddRecord />} />

        {/* AUTH */}
        <Route path="/login" element={<Login />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <DocumentProvider>
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </DocumentProvider>
  );
}

export default App;