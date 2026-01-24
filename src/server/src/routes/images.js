import express from 'express';
import { imageService } from '../services/imageService.js';
import { applyOverlayToBuffer } from '../utils/imageOverlay.js';

const router = express.Router();

// Serve raw image data from database (no overlay)
router.get('/data/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const captureId = parseInt(id, 10);
    if (isNaN(captureId)) {
      return res.status(400).json({ error: 'Invalid capture ID' });
    }

    const imageResult = await imageService.getImageData(captureId);
    if (!imageResult || !imageResult.data) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const mimeType = imageResult.format === 'png' ? 'image/png' : 'image/jpeg';
    res.set('Content-Type', mimeType);
    res.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year (images don't change)
    res.send(imageResult.data);
  } catch (error) {
    console.error('Error getting image data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve image with overlay applied
router.get('/data/:id/overlay', async (req, res) => {
  try {
    const { id } = req.params;
    const captureId = parseInt(id, 10);
    if (isNaN(captureId)) {
      return res.status(400).json({ error: 'Invalid capture ID' });
    }

    const captureData = await imageService.getFullCaptureData(captureId);
    if (!captureData || !captureData.imageData) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Apply overlay to image
    const overlayedImage = await applyOverlayToBuffer(
      captureData.imageData,
      captureData.weather,
      captureData.date
    );

    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.send(overlayedImage);
  } catch (error) {
    console.error('Error getting image with overlay:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get latest image
router.get('/latest', async (req, res) => {
  try {
    const latest = await imageService.getLatestImage();
    if (!latest) {
      return res.status(404).json({ error: 'No images found' });
    }
    res.json(latest);
  } catch (error) {
    console.error('Error getting latest image:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get list of days with images
router.get('/days', async (req, res) => {
  try {
    const days = await imageService.getDays();
    res.json(days);
  } catch (error) {
    console.error('Error getting days:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get images for a specific day
router.get('/day/:date', async (req, res) => {
  try {
    const { date } = req.params;
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }
    const images = await imageService.getImagesForDay(date);
    res.json(images.reverse());
  } catch (error) {
    console.error('Error getting images for day:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get image count per day (for calendar view)
router.get('/counts', async (req, res) => {
  try {
    const counts = await imageService.getImageCounts();
    res.json(counts);
  } catch (error) {
    console.error('Error getting image counts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a single image
router.delete('/day/:date/:filename', async (req, res) => {
  try {
    const { date, filename } = req.params;
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }
    // Validate filename (prevent path traversal)
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const result = await imageService.deleteImage(date, filename);
    res.json(result);
  } catch (error) {
    console.error('Error deleting image:', error);
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Image not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete all images for a day
router.delete('/day/:date', async (req, res) => {
  try {
    const { date } = req.params;
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }
    const result = await imageService.deleteAllImagesForDay(date);
    res.json(result);
  } catch (error) {
    console.error('Error deleting images for day:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
