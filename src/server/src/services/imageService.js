import fs from 'fs/promises';
import path from 'path';

const OUTPUT_DIR = process.env.OUTPUT_DIR || '/data';

class ImageService {
  constructor() {
    this.imagesPath = path.join(OUTPUT_DIR, 'images');
  }

  async ensureDirectory() {
    try {
      await fs.mkdir(this.imagesPath, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  async getDays() {
    await this.ensureDirectory();
    try {
      const entries = await fs.readdir(this.imagesPath, { withFileTypes: true });
      const days = entries
        .filter(entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
        .map(entry => entry.name)
        .sort()
        .reverse(); // Most recent first
      return days;
    } catch (error) {
      console.error('Error reading days:', error);
      return [];
    }
  }

  async getImagesForDay(date) {
    const dayPath = path.join(this.imagesPath, date);
    try {
      const files = await fs.readdir(dayPath);
      const images = files
        .filter(file => /\.(jpg|jpeg|png)$/i.test(file))
        .sort()
        .reverse()
        .map(file => ({
          filename: file,
          time: file.replace(/\.(jpg|jpeg|png)$/i, '').replace(/-/g, ':'),
          url: `/storage/images/${date}/${file}`
        }));
      return images;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async getLatestImage() {
    const days = await this.getDays();
    if (days.length === 0) return null;

    // Try each day until we find one with images
    for (const day of days) {
      const images = await this.getImagesForDay(day);
      if (images.length > 0) {
        const latest = images[images.length - 1];
        return {
          ...latest,
          date: day
        };
      }
    }
    return null;
  }

  async getImageCounts() {
    const days = await this.getDays();
    const counts = {};

    for (const day of days) {
      const images = await this.getImagesForDay(day);
      counts[day] = images.length;
    }

    return counts;
  }

  async getImagePaths(date) {
    const images = await this.getImagesForDay(date);
    return images.map(img => path.join(this.imagesPath, date, img.filename));
  }

  async getDaylightImagePaths(date, sunriseTime, sunsetTime) {
    const images = await this.getImagesForDay(date);

    // Filter images between sunrise and sunset
    const daylightImages = images.filter(img => {
      const time = img.time;
      return time >= sunriseTime && time <= sunsetTime;
    });

    return daylightImages.map(img => path.join(this.imagesPath, date, img.filename));
  }

  async deleteImage(date, filename) {
    const filePath = path.join(this.imagesPath, date, filename);
    try {
      await fs.unlink(filePath);
      console.log(`Deleted image: ${filePath}`);

      // Check if day folder is now empty and remove it
      const dayPath = path.join(this.imagesPath, date);
      const remaining = await fs.readdir(dayPath);
      const imageFiles = remaining.filter(f => /\.(jpg|jpeg|png)$/i.test(f));
      if (imageFiles.length === 0) {
        await fs.rmdir(dayPath);
        console.log(`Removed empty day folder: ${dayPath}`);
      }

      return { success: true };
    } catch (error) {
      console.error(`Error deleting image ${filePath}:`, error);
      throw error;
    }
  }

  async deleteAllImagesForDay(date) {
    const dayPath = path.join(this.imagesPath, date);
    try {
      const files = await fs.readdir(dayPath);
      const imageFiles = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f));

      let deleted = 0;
      for (const file of imageFiles) {
        try {
          await fs.unlink(path.join(dayPath, file));
          deleted++;
        } catch (err) {
          console.error(`Failed to delete ${file}:`, err);
        }
      }

      // Check if folder is now empty and remove it
      const remaining = await fs.readdir(dayPath);
      if (remaining.length === 0) {
        await fs.rmdir(dayPath);
        console.log(`Removed empty day folder: ${dayPath}`);
      }

      console.log(`Deleted ${deleted} images for ${date}`);
      return { success: true, deleted };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { success: false, error: 'Day folder not found' };
      }
      throw error;
    }
  }
}

export const imageService = new ImageService();
