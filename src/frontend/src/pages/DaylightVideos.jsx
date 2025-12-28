import { useState, useEffect } from 'react';
import './VideoList.css';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { DeleteButton, ConfirmButton } from '../components/DeleteButton';

function DaylightVideos() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [queueStatus, setQueueStatus] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [missingCount, setMissingCount] = useState(0);
  const { requestConfirm, isConfirming } = useConfirmDelete();

  useEffect(() => {
    fetchVideos();
    fetchQueueStatus();
    fetchMissingCount();

    const interval = setInterval(() => {
      fetchQueueStatus();
      fetchMissingCount();
    }, 5000);
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

  const fetchMissingCount = async () => {
    try {
      const response = await fetch('/api/videos/missing-count');
      const data = await response.json();
      setMissingCount(data.missingDaylight || 0);
    } catch (err) {
      console.error('Error fetching missing count:', err);
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
    if (!requestConfirm(filename)) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/videos/daylight/${filename}`, {
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

  const deleteAllVideos = async () => {
    if (!requestConfirm('all')) return;

    setDeleting(true);
    try {
      const response = await fetch('/api/videos/daylight', {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchVideos();
      } else {
        console.error('Failed to delete videos');
      }
    } catch (err) {
      console.error('Error deleting videos:', err);
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
        <h1 className="page-title">Daylight Time-lapse Videos</h1>
        <div className="header-actions">
          {queueStatus?.isProcessing && (
            <span className="queue-status">
              Processing: {queueStatus.currentJob?.type} ({queueStatus.queueLength} in queue)
            </span>
          )}
          {missingCount > 0 && (
            <button
              className="btn"
              onClick={generateAll}
              disabled={generating || queueStatus?.isProcessing}
            >
              {generating ? 'Queueing...' : `Generate Missing Videos (${missingCount})`}
            </button>
          )}
          {videos.length > 0 && (
            <ConfirmButton
              onClick={deleteAllVideos}
              isConfirming={isConfirming('all')}
              disabled={deleting}
            >
              Delete All
            </ConfirmButton>
          )}
        </div>
      </div>

      <p className="page-description">
        These videos contain only captures between sunrise and sunset in Alicante.
      </p>

      {videos.length === 0 ? (
        <div className="empty-state card">
          <p>No daylight videos generated yet.</p>
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
                {video.sunrise && video.sunset && (
                  <div className="video-time-overlay">
                    {video.sunrise} - {video.sunset}
                  </div>
                )}
                <DeleteButton
                  className="video-delete-btn"
                  onClick={() => deleteVideo(video.filename)}
                  isConfirming={isConfirming(video.filename)}
                  disabled={deleting}
                  title="Delete video"
                />
              </div>
              <div className="video-info">
                <h3>{video.date.replace('-daylight', '')}</h3>
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

export default DaylightVideos;
