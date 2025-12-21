import { useState, useEffect } from 'react';
import './VideoList.css';

function Combined24hVideos() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [queueStatus, setQueueStatus] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    fetchVideos();
    fetchQueueStatus();

    const interval = setInterval(() => {
      fetchQueueStatus();
      if (queueStatus?.isProcessing) {
        fetchVideos();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchVideos = async () => {
    try {
      const response = await fetch('/api/videos/combined-24h');
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

  const regenerate = async () => {
    setGenerating(true);
    try {
      await fetch('/api/videos/generate/combined-24h', { method: 'POST' });
      fetchQueueStatus();
    } catch (err) {
      console.error('Error generating video:', err);
    } finally {
      setGenerating(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const deleteVideo = async (filename) => {
    if (confirmDelete !== filename) {
      setConfirmDelete(filename);
      setTimeout(() => setConfirmDelete(null), 3000);
      return;
    }

    setConfirmDelete(null);
    setDeleting(true);
    try {
      const response = await fetch(`/api/videos/combined-24h/${filename}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchVideos();
      } else {
        console.error('Failed to delete video');
      }
    } catch (err) {
      console.error('Error deleting video:', err);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading videos...</div>;
  }

  return (
    <div className="video-list-page">
      <div className="page-header">
        <h1 className="page-title">Combined 24h Videos</h1>
        <div className="header-actions">
          {queueStatus?.isProcessing && (
            <span className="queue-status">
              Processing: {queueStatus.currentJob?.type}
            </span>
          )}
          <button
            className="btn"
            onClick={regenerate}
            disabled={generating || queueStatus?.isProcessing}
          >
            {generating ? 'Queueing...' : 'Regenerate Combined Video'}
          </button>
        </div>
      </div>

      <p className="page-description">
        All daily videos concatenated into one continuous time-lapse.
      </p>

      {videos.length === 0 ? (
        <div className="empty-state card">
          <p>No combined video generated yet.</p>
          <p>Generate daily videos first, then create the combined video.</p>
          <button className="btn" onClick={regenerate} disabled={generating}>
            Generate Now
          </button>
        </div>
      ) : (
        <div className="video-grid">
          {videos.map((video) => (
            <div key={video.filename} className="video-card card combined-video-card">
              <div className="video-preview">
                <video controls preload="metadata">
                  <source src={video.url} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
                <button
                  className={`video-delete-btn ${confirmDelete === video.filename ? 'confirming' : ''}`}
                  onClick={() => deleteVideo(video.filename)}
                  disabled={deleting}
                  title="Delete video"
                >
                  {confirmDelete === video.filename ? '✓' : '🗑️'}
                </button>
              </div>
              <div className="video-info">
                <h3>All Days Combined</h3>
                <span className="video-size">{formatFileSize(video.size)}</span>
                <a href={video.url} download className="btn btn-small">
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

export default Combined24hVideos;
