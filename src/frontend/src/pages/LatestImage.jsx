import { useState, useEffect } from 'react';
import './LatestImage.css';

const CAPTURE_INTERVAL = 600; // 10 minutes in seconds
const CAPTURE_JITTER = 30; // ±30 seconds random jitter

function LatestImage() {
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [countdown, setCountdown] = useState(null);

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

  // Countdown timer
  useEffect(() => {
    if (!image) return;

    const calculateCountdown = () => {
      // Parse image time (format: HH:MM:SS)
      const [hours, minutes, seconds] = image.time.split(':').map(Number);

      // Create date object for the image capture time
      const imageDate = new Date();
      const [year, month, day] = image.date.split('-').map(Number);
      imageDate.setFullYear(year, month - 1, day);
      imageDate.setHours(hours, minutes, seconds, 0);

      const now = new Date();
      const elapsed = (now.getTime() - imageDate.getTime()) / 1000;

      // If elapsed time is negative (image from future?), reset
      if (elapsed < 0) {
        return { min: CAPTURE_INTERVAL - CAPTURE_JITTER, max: CAPTURE_INTERVAL + CAPTURE_JITTER, overdue: false };
      }

      // Calculate which capture cycle we're in
      const cycleNumber = Math.floor(elapsed / CAPTURE_INTERVAL);
      const nextCaptureBase = (cycleNumber + 1) * CAPTURE_INTERVAL;

      const minRemaining = Math.max(0, nextCaptureBase - CAPTURE_JITTER - elapsed);
      const maxRemaining = Math.max(0, nextCaptureBase + CAPTURE_JITTER - elapsed);

      // Check if we're overdue (past max time for this cycle)
      const overdue = elapsed > nextCaptureBase + CAPTURE_JITTER;

      return { min: Math.floor(minRemaining), max: Math.floor(maxRemaining), overdue };
    };

    const updateCountdown = () => {
      const remaining = calculateCountdown();
      setCountdown(remaining);

      // Auto-refresh when max countdown reaches 0
      if (remaining.max === 0) {
        setTimeout(fetchLatest, 5000); // Wait 5 seconds then refresh
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [image]);

  const formatCountdown = (countdown) => {
    if (countdown === null) return '--:--';
    const { min, max, overdue } = countdown;

    const formatTime = (secs) => {
      const mins = Math.floor(secs / 60);
      const s = secs % 60;
      return `${mins}:${s.toString().padStart(2, '0')}`;
    };

    if (overdue) return 'Any moment now...';
    if (min === 0 && max === 0) return 'Any moment now...';
    if (min === 0) return `0:00 - ${formatTime(max)}`;

    return `${formatTime(min)} - ${formatTime(max)}`;
  };

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
          <span className="countdown-badge">
            Next: {formatCountdown(countdown)}
          </span>
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
