import { NavLink } from 'react-router-dom';
import './Navigation.css';

const navItems = [
  { path: '/latest', label: 'Latest', icon: '📷' },
  { path: '/daily-images', label: 'Daily Images', icon: '🖼️' },
  { path: '/daily-videos', label: 'Daily Videos', icon: '🎬' },
  { path: '/daylight-videos', label: 'Daylight', icon: '☀️' },
  { path: '/combined-24h', label: 'Combined 24h', icon: '📹' },
  { path: '/combined-daylight', label: 'Combined Daylight', icon: '🌅' },
];

function Navigation() {
  return (
    <nav className="navigation">
      <div className="nav-container">
        <div className="nav-brand">
          <span className="brand-icon">🌊</span>
          <span className="brand-text">Web Spain</span>
        </div>
        <ul className="nav-links">
          {navItems.map(({ path, label, icon }) => (
            <li key={path}>
              <NavLink
                to={path}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <span className="nav-icon">{icon}</span>
                <span className="nav-label">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

export default Navigation;
