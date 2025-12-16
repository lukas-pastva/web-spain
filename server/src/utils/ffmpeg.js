import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const FRAME_RATE = 30;

/**
 * Execute an FFmpeg command
 */
function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    console.log(`Running: ffmpeg ${args.join(' ')}`);

    const ffmpeg = spawn('ffmpeg', args);

    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
      }
    });

    ffmpeg.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Generate a video from a list of image paths
 */
export async function generateDailyVideo(imagePaths, outputPath) {
  if (imagePaths.length === 0) {
    throw new Error('No images provided');
  }

  // Create temporary file list for FFmpeg concat
  const tempDir = os.tmpdir();
  const listPath = path.join(tempDir, `ffmpeg-list-${Date.now()}.txt`);

  try {
    // Create file list
    const fileList = imagePaths
      .map(p => `file '${p.replace(/'/g, "'\\''")}'`)
      .join('\n');

    await fs.writeFile(listPath, fileList);

    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Remove existing output file if it exists
    try {
      await fs.unlink(outputPath);
    } catch (e) {
      // File doesn't exist, that's fine
    }

    // Generate video
    const args = [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listPath,
      '-framerate', String(FRAME_RATE),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'medium',
      '-crf', '23',
      outputPath
    ];

    await runFFmpeg(args);
    console.log(`Generated video: ${outputPath}`);

  } finally {
    // Clean up temp file
    try {
      await fs.unlink(listPath);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Concatenate multiple videos into one
 */
export async function generateCombinedVideo(videoPaths, outputPath) {
  if (videoPaths.length === 0) {
    throw new Error('No videos provided');
  }

  // Create temporary file list for FFmpeg concat
  const tempDir = os.tmpdir();
  const listPath = path.join(tempDir, `ffmpeg-concat-${Date.now()}.txt`);

  try {
    // Create file list
    const fileList = videoPaths
      .map(p => `file '${p.replace(/'/g, "'\\''")}'`)
      .join('\n');

    await fs.writeFile(listPath, fileList);

    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Remove existing output file if it exists
    try {
      await fs.unlink(outputPath);
    } catch (e) {
      // File doesn't exist, that's fine
    }

    // Concatenate videos
    const args = [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listPath,
      '-c', 'copy',
      outputPath
    ];

    await runFFmpeg(args);
    console.log(`Generated combined video: ${outputPath}`);

  } finally {
    // Clean up temp file
    try {
      await fs.unlink(listPath);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}
