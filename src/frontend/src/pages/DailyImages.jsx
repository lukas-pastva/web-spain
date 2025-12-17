import { useState, useEffect, useRef } from 'react';
import './DailyImages.css';

function DailyImages() {
  const [days, setDays] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingImages, setLoadingImages] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const touchStartX = useRef(null);

  useEffect(() => {
    fetchDays();
  }, []);

  useEffect(() => {
    if (selectedDay) {
      fetchImages(selectedDay);
    }
  }, [selectedDay]);

  const navigateImage = (direction) => {
    if (!images.length) return;
    let newIndex = selectedIndex + direction;
    if (newIndex < 0) newIndex = images.length - 1;
    if (newIndex >= images.length) newIndex = 0;
    setSelectedIndex(newIndex);
    setSelectedImage(images[newIndex]);
  };

  const openImage = (img, index) => {
    setSelectedImage(img);
    setSelectedIndex(index);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!selectedImage) return;

      switch (e.key) {
        case 'Escape':
          setSelectedImage(null);
          break;
        case 'ArrowLeft':
          navigateImage(-1);
          break;
        case 'ArrowRight':
          navigateImage(1);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedImage, selectedIndex, images]);

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;

    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;

    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        navigateImage(1); // Swipe left = next
      } else {
        navigateImage(-1); // Swipe right = previous
      }
    }
    touchStartX.current = null;
  };

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

  const deleteImage = async (date, filename) => {
    if (!confirm(`Delete image ${filename}?`)) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/images/day/${date}/${filename}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        // Refresh images list
        fetchImages(date);
        setSelectedImage(null);
      } else {
        const error = await response.json();
        alert(`Failed to delete: ${error.error}`);
      }
    } catch (err) {
      console.error('Error deleting image:', err);
      alert('Failed to delete image');
    } finally {
      setDeleting(false);
    }
  };

  const deleteAllImages = async (date) => {
    if (!confirm(`Delete ALL images for ${date}? This cannot be undone!`)) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/images/day/${date}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        const result = await response.json();
        alert(`Deleted ${result.deleted} images`);
        // Refresh days list
        fetchDays();
        setImages([]);
      } else {
        const error = await response.json();
        alert(`Failed to delete: ${error.error}`);
      }
    } catch (err) {
      console.error('Error deleting images:', err);
      alert('Failed to delete images');
    } finally {
      setDeleting(false);
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
        {selectedDay && images.length > 0 && (
          <button
            className="btn btn-danger"
            onClick={() => deleteAllImages(selectedDay)}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete All'}
          </button>
        )}
      </div>

      {loadingImages ? (
        <div className="loading">Loading images...</div>
      ) : images.length === 0 ? (
        <div className="empty-state">No images for this day.</div>
      ) : (
        <div className="image-grid">
          {images.map((img, index) => (
            <div
              key={img.filename}
              className="image-card"
              onClick={() => openImage(img, index)}
            >
              <img
                src={img.url}
                alt={`Capture at ${img.time}`}
                loading="lazy"
              />
              <button
                className="image-delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteImage(selectedDay, img.filename);
                }}
                title="Delete image"
              >
                🗑️
              </button>
              <div className="image-time">{img.time}</div>
            </div>
          ))}
        </div>
      )}

      {selectedImage && (
        <div
          className="lightbox"
          onClick={() => setSelectedImage(null)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <button
            className="lightbox-nav lightbox-prev"
            onClick={(e) => { e.stopPropagation(); navigateImage(-1); }}
          >
            ‹
          </button>
          <button
            className="lightbox-nav lightbox-next"
            onClick={(e) => { e.stopPropagation(); navigateImage(1); }}
          >
            ›
          </button>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="lightbox-close"
              onClick={() => setSelectedImage(null)}
            >
              &times;
            </button>
            <img src={selectedImage.url} alt={`Capture at ${selectedImage.time}`} />
            <div className="lightbox-info">
              <span className="lightbox-counter">{selectedIndex + 1} / {images.length}</span>
              <span>{selectedDay}</span>
              <span>{selectedImage.time}</span>
              <a
                href={selectedImage.url}
                download
                className="btn btn-secondary"
              >
                Download
              </a>
              <button
                className="btn btn-danger"
                onClick={() => deleteImage(selectedDay, selectedImage.filename)}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DailyImages;
