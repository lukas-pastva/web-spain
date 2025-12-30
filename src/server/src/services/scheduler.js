import schedule from 'node-schedule';
import { videoService } from './videoService.js';
import { imageService } from './imageService.js';

export function initScheduler() {
  console.log('Initializing video generation scheduler...');

  // Generate videos for yesterday at 2 AM every day
  // This ensures all images from the previous day are captured
  schedule.scheduleJob('0 2 * * *', async () => {
    console.log('Running scheduled daily video generation...');

    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split('T')[0];

      console.log(`Generating videos for ${dateStr}...`);

      // Queue daily video
      await videoService.queueVideoGeneration('daily', dateStr);

      // Queue daylight video
      await videoService.queueVideoGeneration('daylight', dateStr);
    } catch (error) {
      console.error('Error in scheduled daily video generation:', error);
    }
  });

  // Generate combined 24h video at 4 AM every day (staggered to avoid overload)
  schedule.scheduleJob('0 4 * * *', async () => {
    console.log('Running scheduled combined-24h video generation...');

    try {
      await videoService.queueVideoGeneration('combined-24h');
    } catch (error) {
      console.error('Error in combined-24h video generation:', error);
    }
  });

  // Generate combined daylight video at 5 AM every day (staggered to avoid overload)
  schedule.scheduleJob('0 5 * * *', async () => {
    console.log('Running scheduled combined-daylight video generation...');

    try {
      await videoService.queueVideoGeneration('combined-daylight');
    } catch (error) {
      console.error('Error in combined-daylight video generation:', error);
    }
  });

  console.log('Scheduler initialized. Daily videos at 2 AM, combined-24h at 4 AM, combined-daylight at 5 AM.');
}
