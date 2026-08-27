import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import "./Navbar.css";

function Navbar() {

  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const [email, setEmail] = useState("");

  useEffect(() => {
    const savedEmail = localStorage.getItem("userEmail");
    if (savedEmail) {
      setEmail(savedEmail);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("userEmail");
    localStorage.removeItem("role");
    navigate("/login");
  };

  return (
    <div className="navbar">

      <h2 className="logo" onClick={() => navigate("/")}>
        BlockVerify
      </h2>

      <div className="nav-links">

        <Link to="/">Home</Link>
        <Link to="/about">About</Link>

        {email ? (
          <div className="profile-container">
            <div
              className="profile-circle"
              onClick={() => setOpen(!open)}
            >
              {email[0].toUpperCase()}
            </div>

            {open && (
              <div className="dropdown">
                <p className="email">{email}</p>

                <button className="logout-btn" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link to="/login">Login</Link>
        )}

      </div>
    </div>
  );
}

export default Navbar;