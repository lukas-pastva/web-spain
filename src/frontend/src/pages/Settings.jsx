import { useState, useEffect } from 'react';
import './Settings.css';

function Settings() {
  const [settings, setSettings] = useState({
    showChart: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/images/settings');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (key) => {
    const newValue = !settings[key];
    const newSettings = { ...settings, [key]: newValue };
    setSettings(newSettings);
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/images/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newSettings)
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Settings saved!' });
        setTimeout(() => setMessage(null), 2000);
      } else {
        throw new Error('Failed to save');
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save settings' });
      setSettings({ ...settings }); // Revert
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading settings...</div>;
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <div className="settings-container card">
        <div className="settings-section">
          <h2 className="section-title">Image Overlay Options</h2>
          <p className="section-description">
            Configure what information is displayed on the image overlays.
          </p>

          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">24-Hour Temperature Chart</span>
              <span className="setting-description">
                Show a line chart displaying temperature history for both Alicante and Bratislava over the last 24 hours. The chart updates with each new capture, creating an animated effect in videos.
              </span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings.showChart}
                onChange={() => handleToggle('showChart')}
                disabled={saving}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>

        {message && (
          <div className={`message ${message.type}`}>
            {message.text}
          </div>
        )}
      </div>

      <div className="settings-info card">
        <h3>About the Temperature Chart</h3>
        <p>
          When enabled, each image will include a small chart in the bottom-right corner showing temperature trends over the past 24 hours.
        </p>
        <ul>
          <li><span className="color-dot alicante"></span> Orange line: Alicante temperature</li>
          <li><span className="color-dot bratislava"></span> Blue line: Bratislava temperature</li>
        </ul>
        <p>
          Since the chart data changes with each capture, the chart will appear to animate smoothly when images are compiled into videos.
        </p>
      </div>
    </div>
  );
}

export default Settings;
