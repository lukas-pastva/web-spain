import fs from 'fs/promises';
import path from 'path';
import { generateDailyVideo, generateCombinedVideo } from '../utils/ffmpeg.js';
import { imageService } from './imageService.js';

const OUTPUT_DIR = process.env.OUTPUT_DIR || '/data';

class VideoService {
  constructor() {
    this.videosPath = path.join(OUTPUT_DIR, 'videos');
    this.queue = [];
    this.isProcessing = false;
    this.currentJob = null;
  }

  async ensureDirectories() {
    const dirs = ['daily', 'daylight', 'combined-24h', 'combined-daylight'];
    for (const dir of dirs) {
      await fs.mkdir(path.join(this.videosPath, dir), { recursive: true });
    }
  }

  async getVideos(type) {
    await this.ensureDirectories();
    const typePath = path.join(this.videosPath, type);

    try {
      const files = await fs.readdir(typePath);
      const videos = await Promise.all(
        files
          .filter(file => /\.mp4$/i.test(file))
          .map(async file => {
            const filePath = path.join(typePath, file);
            const stats = await fs.stat(filePath);
            return {
              filename: file,
              date: file.replace(/(-daylight)?\.mp4$/i, ''),
              url: `/storage/videos/${type}/${file}`,
              size: stats.size,
              createdAt: stats.birthtime
            };
          })
      );

      return videos.sort((a, b) => b.date.localeCompare(a.date));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  getQueueStatus() {
    return {
      isProcessing: this.isProcessing,
      currentJob: this.currentJob,
      queueLength: this.queue.length,
      queuedJobs: this.queue.map((job, index) => ({
        position: index + 1,
        type: job.type,
        date: job.date
      }))
    };
  }

  async queueVideoGeneration(type, date = null) {
    const jobId = `${type}-${date || 'all'}-${Date.now()}`;
    const job = { id: jobId, type, date, status: 'queued' };

    this.queue.push(job);
    console.log(`Queued video generation: ${jobId}`);

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }

    return jobId;
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift();
      this.currentJob = job;
      console.log(`Processing job: ${job.id}`);

      try {
        await this.generateVideo(job.type, job.date);
        console.log(`Completed job: ${job.id}`);
      } catch (error) {
        console.error(`Error processing job ${job.id}:`, error);
      }
    }

    this.currentJob = null;
    this.isProcessing = false;
  }

  async generateVideo(type, date) {
    await this.ensureDirectories();

    switch (type) {
      case 'daily':
        await this.generateDailyVideo(date);
        break;
      case 'daylight':
        await this.generateDaylightVideo(date);
        break;
      case 'combined-24h':
        await this.generateCombined24hVideo();
        break;
      case 'combined-daylight':
        await this.generateCombinedDaylightVideo();
        break;
      default:
        throw new Error(`Unknown video type: ${type}`);
    }
  }

  async generateDailyVideo(date) {
    const imagePaths = await imageService.getImagePaths(date);
    if (imagePaths.length === 0) {
      console.log(`No images found for ${date}`);
      return;
    }

    const outputPath = path.join(this.videosPath, 'daily', `${date}.mp4`);
    await generateDailyVideo(imagePaths, outputPath);
  }

  async generateDaylightVideo(date) {
    // Get sunrise/sunset times from weather cache
    const metadataPath = path.join(OUTPUT_DIR, 'metadata', 'weather_cache.json');
    let sunriseTime = '06:00';
    let sunsetTime = '20:00';

    try {
      const cache = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
      if (cache.alicante?.data) {
        sunriseTime = cache.alicante.data.sunrise || sunriseTime;
        sunsetTime = cache.alicante.data.sunset || sunsetTime;
      }
    } catch (error) {
      console.log('Using default sunrise/sunset times');
    }

    const imagePaths = await imageService.getDaylightImagePaths(date, sunriseTime, sunsetTime);
    if (imagePaths.length === 0) {
      console.log(`No daylight images found for ${date}`);
      return;
    }

    const outputPath = path.join(this.videosPath, 'daylight', `${date}-daylight.mp4`);
    await generateDailyVideo(imagePaths, outputPath);
  }

  async generateCombined24hVideo() {
    const dailyVideos = await this.getVideos('daily');
    if (dailyVideos.length === 0) {
      console.log('No daily videos to combine');
      return;
    }

    const videoPaths = dailyVideos
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(v => path.join(this.videosPath, 'daily', v.filename));

    const outputPath = path.join(this.videosPath, 'combined-24h', 'combined-all.mp4');
    await generateCombinedVideo(videoPaths, outputPath);
  }

  async generateCombinedDaylightVideo() {
    const daylightVideos = await this.getVideos('daylight');
    if (daylightVideos.length === 0) {
      console.log('No daylight videos to combine');
      return;
    }

    const videoPaths = daylightVideos
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(v => path.join(this.videosPath, 'daylight', v.filename));

    const outputPath = path.join(this.videosPath, 'combined-daylight', 'combined-daylight-all.mp4');
    await generateCombinedVideo(videoPaths, outputPath);
  }

  async generateAllMissing() {
    const days = await imageService.getDays();
    const dailyVideos = await this.getVideos('daily');
    const daylightVideos = await this.getVideos('daylight');

    const existingDaily = new Set(dailyVideos.map(v => v.date));
    const existingDaylight = new Set(daylightVideos.map(v => v.date.replace('-daylight', '')));

    const queued = [];

    // Queue missing daily videos
    for (const day of days) {
      if (!existingDaily.has(day)) {
        await this.queueVideoGeneration('daily', day);
        queued.push({ type: 'daily', date: day });
      }
      if (!existingDaylight.has(day)) {
        await this.queueVideoGeneration('daylight', day);
        queued.push({ type: 'daylight', date: day });
      }
    }

    return { queued, message: `Queued ${queued.length} video generation jobs` };
  }
}

export const videoService = new VideoService();
