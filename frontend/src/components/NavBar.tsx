import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function NavBar() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <div className="row">
          <NavLink to="/challenges" className="navbar-brand">
            Linux Incident Trainer
          </NavLink>
          <div className="navbar-links">
            <NavLink to="/challenges" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              Challenges
            </NavLink>
            <NavLink to="/progress" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              Progress
            </NavLink>
          </div>
        </div>
        <div className="row">
          <span className="navbar-user">{user.email}</span>
          <button className="btn btn-sm btn-ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </div>
    </nav>
  );
}
