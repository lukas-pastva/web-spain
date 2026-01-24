import fs from 'fs/promises';
import path from 'path';
import * as db from '../utils/database.js';

const OUTPUT_DIR = process.env.OUTPUT_DIR || '/data';

class ImageService {
  constructor() {
    this.tempPath = path.join(OUTPUT_DIR, 'temp');
  }

  async ensureTempDirectory() {
    try {
      await fs.mkdir(this.tempPath, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  async getDays() {
    return await db.getDays();
  }

  async getImagesForDay(date) {
    return await db.getCapturesForDay(date);
  }

  async getLatestImage() {
    return await db.getLatestCapture();
  }

  async getImageCounts() {
    return await db.getImageCounts();
  }

  async getImageData(captureId) {
    return await db.getImageData(captureId);
  }

  /**
   * Get image paths for video generation.
   * Extracts images from database to temp files and returns paths.
   */
  async getImagePaths(date) {
    await this.ensureTempDirectory();
    const captures = await db.getCaptureIdsForDay(date);
    if (captures.length === 0) return [];

    const tempDir = path.join(this.tempPath, `video-${date}-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    const paths = [];
    for (const capture of captures) {
      const imageResult = await db.getImageData(capture.id);
      if (imageResult && imageResult.data) {
        const filePath = path.join(tempDir, `${capture.id}.jpg`);
        await fs.writeFile(filePath, imageResult.data);
        paths.push(filePath);
      }
    }

    return paths;
  }

  /**
   * Get daylight image paths for video generation.
   * Extracts images from database to temp files and returns paths.
   */
  async getDaylightImagePaths(date, sunriseTime, sunsetTime) {
    await this.ensureTempDirectory();
    const captures = await db.getDaylightCaptureIdsForDay(date, sunriseTime, sunsetTime);
    if (captures.length === 0) return [];

    const tempDir = path.join(this.tempPath, `daylight-${date}-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    const paths = [];
    for (const capture of captures) {
      const imageResult = await db.getImageData(capture.id);
      if (imageResult && imageResult.data) {
        const filePath = path.join(tempDir, `${capture.id}.jpg`);
        await fs.writeFile(filePath, imageResult.data);
        paths.push(filePath);
      }
    }

    return paths;
  }

  /**
   * Clean up temporary image files after video generation
   */
  async cleanupTempImages(imagePaths) {
    if (!imagePaths || imagePaths.length === 0) return;

    // Get the temp directory from the first path
    const tempDir = path.dirname(imagePaths[0]);
    if (!tempDir.includes('temp')) return; // Safety check

    try {
      // Delete all files
      for (const filePath of imagePaths) {
        try {
          await fs.unlink(filePath);
        } catch (e) {
          // Ignore individual file errors
        }
      }
      // Remove the temp directory
      await fs.rmdir(tempDir);
    } catch (error) {
      console.error('Error cleaning up temp images:', error);
    }
  }

  async deleteImage(date, filename) {
    // Extract capture ID from filename (assuming format: id.jpg)
    const captureId = parseInt(filename.replace('.jpg', ''), 10);
    if (isNaN(captureId)) {
      throw new Error('Invalid filename format');
    }
    return await db.deleteCapture(captureId);
  }

  async deleteAllImagesForDay(date) {
    return await db.deleteCapturesForDay(date);
  }

  /**
   * Get sun times for a specific date from database
   */
  async getSunTimesForDate(date) {
    return await db.getSunTimesForDate(date);
  }
}

export const imageService = new ImageService();
