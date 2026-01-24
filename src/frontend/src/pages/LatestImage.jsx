import { useState, useEffect } from 'react';
import './LatestImage.css';

function LatestImage() {
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchLatest = async () => {
    try {
      const response = await fetch('/api/images/latest');
      if (!response.ok) {
        if (response.status === 404) {
          setImage(null);
          setError(null);
        } else {
          throw new Error('Failed to fetch latest image');
        }
      } else {
        const data = await response.json();
        setImage(data);
        setError(null);
      }
      setLastUpdate(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLatest();

    // Refresh every 60 seconds
    const interval = setInterval(fetchLatest, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="loading">Loading latest image...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (!image) {
    return (
      <div className="empty-state">
        <p>No images captured yet.</p>
        <p>The scraper will start capturing images every 10 minutes.</p>
      </div>
    );
  }

  return (
    <div className="latest-image-page">
      <div className="page-header">
        <h1 className="page-title">Latest Capture</h1>
        <div className="meta-info">
          <span className="date-badge">{image.date}</span>
          <span className="time-badge">{image.time}</span>
        </div>
      </div>

      <div className="image-container card">
        <img
          src={image.url}
          alt={`Webcam capture from ${image.date} at ${image.time}`}
          className="latest-img"
        />
      </div>

      <div className="actions">
        <button className="btn" onClick={fetchLatest}>
          Refresh
        </button>
        <a
          href={image.url}
          download={`webcam-${image.date}-${image.time}.jpg`}
          className="btn btn-secondary"
        >
          Download
        </a>
      </div>
    </div>
  );
}

export default LatestImage;
