import { useState, useEffect } from 'react';
import './DailyImages.css';

function DailyImages() {
  const [days, setDays] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingImages, setLoadingImages] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    fetchDays();
  }, []);

  useEffect(() => {
    if (selectedDay) {
      fetchImages(selectedDay);
    }
  }, [selectedDay]);

  const fetchDays = async () => {
    try {
      const response = await fetch('/api/images/days');
      const data = await response.json();
      setDays(data);
      if (data.length > 0) {
        setSelectedDay(data[0]);
      }
    } catch (err) {
      console.error('Error fetching days:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchImages = async (date) => {
    setLoadingImages(true);
    try {
      const response = await fetch(`/api/images/day/${date}`);
      const data = await response.json();
      setImages(data);
    } catch (err) {
      console.error('Error fetching images:', err);
    } finally {
      setLoadingImages(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (days.length === 0) {
    return (
      <div className="empty-state">
        <p>No images captured yet.</p>
      </div>
    );
  }

  return (
    <div className="daily-images-page">
      <h1 className="page-title">Daily Images</h1>

      <div className="day-selector card">
        <label htmlFor="day-select">Select Date:</label>
        <select
          id="day-select"
          value={selectedDay || ''}
          onChange={(e) => setSelectedDay(e.target.value)}
          className="day-select"
        >
          {days.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
        <span className="image-count">
          {images.length} images
        </span>
      </div>

      {loadingImages ? (
        <div className="loading">Loading images...</div>
      ) : images.length === 0 ? (
        <div className="empty-state">No images for this day.</div>
      ) : (
        <div className="image-grid">
          {images.map((img) => (
            <div
              key={img.filename}
              className="image-card"
              onClick={() => setSelectedImage(img)}
            >
              <img
                src={img.url}
                alt={`Capture at ${img.time}`}
                loading="lazy"
              />
              <div className="image-time">{img.time}</div>
            </div>
          ))}
        </div>
      )}

      {selectedImage && (
        <div className="lightbox" onClick={() => setSelectedImage(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="lightbox-close"
              onClick={() => setSelectedImage(null)}
            >
              &times;
            </button>
            <img src={selectedImage.url} alt={`Capture at ${selectedImage.time}`} />
            <div className="lightbox-info">
              <span>{selectedDay}</span>
              <span>{selectedImage.time}</span>
              <a
                href={selectedImage.url}
                download
                className="btn btn-secondary"
              >
                Download
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DailyImages;
