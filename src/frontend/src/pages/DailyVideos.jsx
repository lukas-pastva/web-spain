import { useState, useEffect } from 'react';
import './VideoList.css';

function DailyVideos() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [queueStatus, setQueueStatus] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchVideos();
    fetchQueueStatus();

    const interval = setInterval(fetchQueueStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchVideos = async () => {
    try {
      const response = await fetch('/api/videos/daily');
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

  const generateAll = async () => {
    setGenerating(true);
    try {
      await fetch('/api/videos/generate-all', { method: 'POST' });
      fetchQueueStatus();
    } catch (err) {
      console.error('Error generating videos:', err);
    } finally {
      setGenerating(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const deleteVideo = async (filename) => {
    if (!confirm(`Delete video ${filename}?`)) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/videos/daily/${filename}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchVideos();
      } else {
        const error = await response.json();
        alert(`Failed to delete: ${error.error}`);
      }
    } catch (err) {
      console.error('Error deleting video:', err);
      alert('Failed to delete video');
    } finally {
      setDeleting(false);
    }
  };

  const deleteAllVideos = async () => {
    if (!confirm('Delete ALL daily videos? This cannot be undone!')) return;

    setDeleting(true);
    try {
      const response = await fetch('/api/videos/daily', {
        method: 'DELETE'
      });
      if (response.ok) {
        const result = await response.json();
        alert(`Deleted ${result.deleted} videos`);
        fetchVideos();
      } else {
        const error = await response.json();
        alert(`Failed to delete: ${error.error}`);
      }
    } catch (err) {
      console.error('Error deleting videos:', err);
      alert('Failed to delete videos');
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
        <h1 className="page-title">Daily Time-lapse Videos</h1>
        <div className="header-actions">
          {queueStatus?.isProcessing && (
            <span className="queue-status">
              Processing: {queueStatus.currentJob?.type} ({queueStatus.queueLength} in queue)
            </span>
          )}
          <button
            className="btn"
            onClick={generateAll}
            disabled={generating || queueStatus?.isProcessing}
          >
            {generating ? 'Queueing...' : 'Generate Missing Videos'}
          </button>
          {videos.length > 0 && (
            <button
              className="btn btn-danger"
              onClick={deleteAllVideos}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete All'}
            </button>
          )}
        </div>
      </div>

      {videos.length === 0 ? (
        <div className="empty-state card">
          <p>No videos generated yet.</p>
          <p>Videos are automatically generated daily at 2 AM, or you can generate them manually.</p>
          <button className="btn" onClick={generateAll} disabled={generating}>
            Generate Now
          </button>
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
                <h3>{video.date}</h3>
                <span className="video-size">{formatFileSize(video.size)}</span>
              </div>
              <div className="video-actions">
                <a href={video.url} download className="btn btn-secondary">
                  Download
                </a>
                <button
                  className="btn btn-danger"
                  onClick={() => deleteVideo(video.filename)}
                  disabled={deleting}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DailyVideos;
