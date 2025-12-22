import express from 'express';
import { imageService } from '../services/imageService.js';
import { processImagesForDay, processMultipleDays } from '../utils/imageOverlay.js';

const router = express.Router();

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

// Process images for a day (add date indicator overlay)
router.post('/process/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const { inPlace = true } = req.body;

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const result = await processImagesForDay(date, inPlace);
    res.json(result);
  } catch (error) {
    console.error('Error processing images:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Process images for multiple days
router.post('/process-multiple', async (req, res) => {
  try {
    const { dates, inPlace = true } = req.body;

    if (!Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ error: 'dates must be a non-empty array' });
    }

    // Validate all dates
    for (const date of dates) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: `Invalid date format: ${date}. Use YYYY-MM-DD` });
      }
    }

    const results = await processMultipleDays(dates, inPlace);
    res.json({ results });
  } catch (error) {
    console.error('Error processing multiple days:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Process all available days
router.post('/process-all', async (req, res) => {
  try {
    const { inPlace = true } = req.body;
    const days = await imageService.getDays();

    if (days.length === 0) {
      return res.json({ message: 'No days to process', results: [] });
    }

    const results = await processMultipleDays(days, inPlace);
    res.json({ results, total: days.length });
  } catch (error) {
    console.error('Error processing all days:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

export default router;
