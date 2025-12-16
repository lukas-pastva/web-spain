import { useState, useEffect } from 'react';
import './VideoList.css';

function DaylightVideos() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [queueStatus, setQueueStatus] = useState(null);

  useEffect(() => {
    fetchVideos();
    fetchQueueStatus();

    const interval = setInterval(fetchQueueStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchVideos = async () => {
    try {
      const response = await fetch('/api/videos/daylight');
      const data = await response.json();
      setVideos(data);
    } catch (err) {
      console.error('Error fetching videos:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchQueueStatus = async () => {
    try {
      const response = await fetch('/api/videos/queue');
      const data = await response.json();
      setQueueStatus(data);
    } catch (err) {
      console.error('Error fetching queue status:', err);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return <div className="loading">Loading videos...</div>;
  }

  return (
    <div className="video-list-page">
      <div className="page-header">
        <h1 className="page-title">Daylight Time-lapse Videos</h1>
        {queueStatus?.isProcessing && (
          <span className="queue-status">
            Processing: {queueStatus.currentJob?.type}
          </span>
        )}
      </div>

      <p className="page-description">
        These videos contain only captures between sunrise and sunset in Alicante.
      </p>

      {videos.length === 0 ? (
        <div className="empty-state card">
          <p>No daylight videos generated yet.</p>
          <p>Videos are automatically generated daily at 2 AM.</p>
        </div>
      ) : (
        <div className="video-grid">
          {videos.map((video) => (
            <div key={video.filename} className="video-card card">
              <div className="video-preview">
                <video controls preload="metadata">
                  <source src={video.url} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              </div>
              <div className="video-info">
                <h3>{video.date.replace('-daylight', '')}</h3>
                <span className="video-size">{formatFileSize(video.size)}</span>
              </div>
              <div className="video-actions">
                <a href={video.url} download className="btn btn-secondary">
                  Download
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DaylightVideos;
