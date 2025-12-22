import { useState, useEffect, useRef } from 'react';
import './DailyImages.css';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { DeleteButton, ConfirmButton } from '../components/DeleteButton';
import { DateIndicator } from '../components/DateIndicator';

function DailyImages() {
  const [days, setDays] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingImages, setLoadingImages] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const { requestConfirm, isConfirming } = useConfirmDelete();
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
    if (!requestConfirm(filename)) return;

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
        console.error('Failed to delete image');
      }
    } catch (err) {
      console.error('Error deleting image:', err);
    } finally {
      setDeleting(false);
    }
  };

  const deleteAllImages = async (date) => {
    if (!requestConfirm('all')) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/images/day/${date}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        // Refresh days list
        fetchDays();
        setImages([]);
      } else {
        console.error('Failed to delete images');
      }
    } catch (err) {
      console.error('Error deleting images:', err);
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
          <ConfirmButton
            onClick={() => deleteAllImages(selectedDay)}
            isConfirming={isConfirming('all')}
            disabled={deleting}
          >
            Delete All
          </ConfirmButton>
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
              <div className="image-wrapper">
                <img
                  src={img.url}
                  alt={`Capture at ${img.time}`}
                  loading="lazy"
                />
                <DateIndicator date={selectedDay} />
              </div>
              <DeleteButton
                className="image-delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteImage(selectedDay, img.filename);
                }}
                isConfirming={isConfirming(img.filename)}
                title="Delete image"
              />
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
            <div className="lightbox-image-wrapper">
              <img src={selectedImage.url} alt={`Capture at ${selectedImage.time}`} />
              <DateIndicator date={selectedDay} />
            </div>
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
              <ConfirmButton
                onClick={() => deleteImage(selectedDay, selectedImage.filename)}
                isConfirming={isConfirming(selectedImage.filename)}
                disabled={deleting}
              >
                Delete
              </ConfirmButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DailyImages;
