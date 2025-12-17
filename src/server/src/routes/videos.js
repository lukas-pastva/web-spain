import express from 'express';
import { videoService } from '../services/videoService.js';

const router = express.Router();

// Get list of daily videos
router.get('/daily', async (req, res) => {
  try {
    const videos = await videoService.getVideos('daily');
    res.json(videos);
  } catch (error) {
    console.error('Error getting daily videos:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get list of daylight videos
router.get('/daylight', async (req, res) => {
  try {
    const videos = await videoService.getVideos('daylight');
    res.json(videos);
  } catch (error) {
    console.error('Error getting daylight videos:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get combined 24h videos
router.get('/combined-24h', async (req, res) => {
  try {
    const videos = await videoService.getVideos('combined-24h');
    res.json(videos);
  } catch (error) {
    console.error('Error getting combined 24h videos:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get combined daylight videos
router.get('/combined-daylight', async (req, res) => {
  try {
    const videos = await videoService.getVideos('combined-daylight');
    res.json(videos);
  } catch (error) {
    console.error('Error getting combined daylight videos:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get video generation queue status
router.get('/queue', async (req, res) => {
  try {
    const status = videoService.getQueueStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting queue status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Trigger video generation
router.post('/generate/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { date } = req.body;

    const validTypes = ['daily', 'daylight', 'combined-24h', 'combined-daylight'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
    }

    // For daily/daylight types, date is required
    if ((type === 'daily' || type === 'daylight') && !date) {
      return res.status(400).json({ error: 'Date is required for daily/daylight video generation' });
    }

    const jobId = await videoService.queueVideoGeneration(type, date);
    res.json({ success: true, jobId, message: 'Video generation queued' });
  } catch (error) {
    console.error('Error queueing video generation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate all missing videos
router.post('/generate-all', async (req, res) => {
  try {
    const result = await videoService.generateAllMissing();
    res.json(result);
  } catch (error) {
    console.error('Error generating all videos:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a single video
router.delete('/:type/:filename', async (req, res) => {
  try {
    const { type, filename } = req.params;
    const validTypes = ['daily', 'daylight', 'combined-24h', 'combined-daylight'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid video type' });
    }
    // Validate filename (prevent path traversal)
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const result = await videoService.deleteVideo(type, filename);
    res.json(result);
  } catch (error) {
    console.error('Error deleting video:', error);
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Video not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete all videos of a type
router.delete('/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const validTypes = ['daily', 'daylight', 'combined-24h', 'combined-daylight'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid video type' });
    }
    const result = await videoService.deleteAllVideos(type);
    res.json(result);
  } catch (error) {
    console.error('Error deleting videos:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
