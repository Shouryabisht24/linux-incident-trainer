import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function NavBar() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <div className="row">
          <NavLink to="/dashboard" className="navbar-brand">
            Linux Incident Trainer
          </NavLink>
          <div className="navbar-links">
            <NavLink to="/dashboard" end className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              Dashboard
            </NavLink>
            <NavLink to="/challenges" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              Challenges
            </NavLink>
            <NavLink to="/progress" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              Progress
            </NavLink>
          </div>
        </div>
        <div className="row">
          <NavLink to="/about" className="nav-link" title="Back to the public homepage">
            About
          </NavLink>
          <NavLink
            to="/profile"
            className={({ isActive }) => `navbar-user${isActive ? " active" : ""}`}
            title="Account settings"
          >
            {user.display_name?.trim() || user.email}
          </NavLink>
          <button className="btn btn-sm btn-ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </div>
    </nav>
  );
}
