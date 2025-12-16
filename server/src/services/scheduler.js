import schedule from 'node-schedule';
import { videoService } from './videoService.js';
import { imageService } from './imageService.js';

export function initScheduler() {
  console.log('Initializing video generation scheduler...');

  // Generate videos for yesterday at 2 AM every day
  // This ensures all images from the previous day are captured
  schedule.scheduleJob('0 2 * * *', async () => {
    console.log('Running scheduled video generation...');

    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split('T')[0];

      console.log(`Generating videos for ${dateStr}...`);

      // Queue daily video
      await videoService.queueVideoGeneration('daily', dateStr);

      // Queue daylight video
      await videoService.queueVideoGeneration('daylight', dateStr);

      // Update combined videos once a week (on Sundays)
      if (new Date().getDay() === 0) {
        console.log('Sunday: Regenerating combined videos...');
        await videoService.queueVideoGeneration('combined-24h');
        await videoService.queueVideoGeneration('combined-daylight');
      }
    } catch (error) {
      console.error('Error in scheduled video generation:', error);
    }
  });

  // Regenerate combined videos monthly (on the 1st)
  schedule.scheduleJob('0 3 1 * *', async () => {
    console.log('Monthly combined video regeneration...');

    try {
      await videoService.queueVideoGeneration('combined-24h');
      await videoService.queueVideoGeneration('combined-daylight');
    } catch (error) {
      console.error('Error in monthly video generation:', error);
    }
  });

  console.log('Scheduler initialized. Daily videos will be generated at 2 AM.');
}
