import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import imagesRouter from './routes/images.js';
import videosRouter from './routes/videos.js';
import { initScheduler } from './services/scheduler.js';
import { initDatabase } from './utils/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;
const OUTPUT_DIR = process.env.OUTPUT_DIR || '/data';

// Middleware
app.use(cors());
app.use(express.json());

// API routes
app.use('/api/images', imagesRouter);
app.use('/api/videos', videosRouter);

// Serve static video files from storage (images are served from database via API)
app.use('/storage/videos', express.static(path.join(OUTPUT_DIR, 'videos')));

// Serve React frontend in production
const frontendPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));

// SPA fallback
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/') && !req.path.startsWith('/storage/')) {
    res.sendFile(path.join(frontendPath, 'index.html'));
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize database and start server
async function start() {
  try {
    console.log('Initializing database...');
    await initDatabase();
    console.log('Database initialized');

    // Initialize video generation scheduler
    initScheduler();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Output directory: ${OUTPUT_DIR}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
