import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import './Navigation.css';

const navItems = [
  { path: '/latest', label: 'Latest', icon: '\u25C9' },
  { path: '/daily-images', label: 'Daily Images', icon: '\u25A6' },
  { path: '/daily-videos', label: 'Daily Videos', icon: '\u25B6' },
  { path: '/daylight-videos', label: 'Daylight', icon: '\u2600' },
  { path: '/combined-24h', label: 'Combined 24h', icon: '\u29BE' },
  { path: '/combined-daylight', label: 'Combined Daylight', icon: '\u25D0' },
  { path: '/settings', label: 'Settings', icon: '\u2699' },
];

const BOTTOM_BAR_VISIBLE = 4;

function Navigation() {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  const bottomItems = navItems.slice(0, BOTTOM_BAR_VISIBLE);
  const overflowItems = navItems.slice(BOTTOM_BAR_VISIBLE);

  return (
    <>
      {/* Desktop / Tablet Sidebar */}
      <nav className="sidebar" aria-label="Main navigation">
        <div className="sidebar-brand">
          <div className="brand-mark">W</div>
          <span className="sidebar-brand-text">Web Spain</span>
        </div>
        <ul className="sidebar-links">
          {navItems.map(({ path, label, icon }) => (
            <li key={path}>
              <NavLink
                to={path}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              >
                <span className="sidebar-icon">{icon}</span>
                <span className="sidebar-label">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Mobile Bottom Bar */}
      <nav className="bottombar" aria-label="Mobile navigation">
        {bottomItems.map(({ path, label, icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) => `bottombar-item ${isActive ? 'active' : ''}`}
          >
            <span className="bottombar-icon">{icon}</span>
            <span className="bottombar-label">{label}</span>
          </NavLink>
        ))}
        <button
          className={`bottombar-item bottombar-more ${moreOpen ? 'active' : ''}`}
          onClick={() => setMoreOpen(!moreOpen)}
          aria-label="More navigation items"
        >
          <span className="bottombar-icon">{'\u22EF'}</span>
          <span className="bottombar-label">More</span>
        </button>

        {moreOpen && (
          <>
            <div className="overflow-backdrop" onClick={() => setMoreOpen(false)} />
            <div className="overflow-menu">
              {overflowItems.map(({ path, label, icon }) => (
                <NavLink
                  key={path}
                  to={path}
                  className={({ isActive }) => `overflow-item ${isActive ? 'active' : ''}`}
                  onClick={() => setMoreOpen(false)}
                >
                  <span className="overflow-icon">{icon}</span>
                  <span className="overflow-label">{label}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}
      </nav>
    </>
  );
}

export default Navigation;
