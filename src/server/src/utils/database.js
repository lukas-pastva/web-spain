/**
 * Database Module
 * Handles MariaDB connection and capture operations
 */
import mysql from 'mysql2/promise';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'webspain',
  user: process.env.DB_USER || 'webspain',
  password: process.env.DB_PASSWORD || '',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool = null;

/**
 * Get database connection pool
 */
export function getPool() {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
}

/**
 * Initialize database schema
 */
export async function initDatabase() {
  const conn = await getPool().getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS captures (
        id INT AUTO_INCREMENT PRIMARY KEY,
        capture_date DATE NOT NULL,
        capture_time TIME NOT NULL,
        captured_at DATETIME NOT NULL,
        image_data LONGBLOB NOT NULL,
        image_format VARCHAR(10) DEFAULT 'jpeg',
        width INT,
        height INT,
        alicante_temp FLOAT,
        alicante_sunrise VARCHAR(10),
        alicante_sunset VARCHAR(10),
        alicante_day_length VARCHAR(20),
        bratislava_temp FLOAT,
        bratislava_sunrise VARCHAR(10),
        bratislava_sunset VARCHAR(10),
        bratislava_day_length VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_capture_date (capture_date),
        INDEX idx_capture_datetime (capture_date, capture_time),
        UNIQUE KEY unique_capture (capture_date, capture_time)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('Database schema initialized');
    return true;
  } catch (error) {
    console.error('Error initializing database:', error);
    return false;
  } finally {
    conn.release();
  }
}

/**
 * Get all capture dates (days)
 */
export async function getDays() {
  const conn = await getPool().getConnection();
  try {
    const [rows] = await conn.execute(`
      SELECT DISTINCT DATE_FORMAT(capture_date, '%Y-%m-%d') as date
      FROM captures
      ORDER BY capture_date DESC
    `);
    return rows.map(row => row.date);
  } catch (error) {
    console.error('Error getting days:', error);
    return [];
  } finally {
    conn.release();
  }
}

/**
 * Get captures for a specific date (metadata only, no image data)
 */
export async function getCapturesForDay(date) {
  const conn = await getPool().getConnection();
  try {
    const [rows] = await conn.execute(`
      SELECT id, capture_date, capture_time, captured_at, width, height,
             alicante_temp, alicante_sunrise, alicante_sunset, alicante_day_length,
             bratislava_temp, bratislava_sunrise, bratislava_sunset, bratislava_day_length
      FROM captures
      WHERE capture_date = ?
      ORDER BY capture_time ASC
    `, [date]);

    return rows.map(row => ({
      id: row.id,
      filename: `${row.id}.jpg`,
      time: row.capture_time.toString().substring(0, 5).replace(/:/g, ':'),
      url: `/api/images/data/${row.id}/overlay`,
      rawUrl: `/api/images/data/${row.id}`,
      date: row.capture_date instanceof Date ? row.capture_date.toISOString().split('T')[0] : row.capture_date,
      width: row.width,
      height: row.height,
      weather: {
        alicante: {
          temperature: row.alicante_temp,
          sunrise: row.alicante_sunrise,
          sunset: row.alicante_sunset,
          day_length: row.alicante_day_length
        },
        bratislava: {
          temperature: row.bratislava_temp,
          sunrise: row.bratislava_sunrise,
          sunset: row.bratislava_sunset,
          day_length: row.bratislava_day_length
        }
      }
    }));
  } catch (error) {
    console.error('Error getting captures for day:', error);
    return [];
  } finally {
    conn.release();
  }
}

/**
 * Get latest capture (metadata only)
 */
export async function getLatestCapture() {
  const conn = await getPool().getConnection();
  try {
    const [rows] = await conn.execute(`
      SELECT id, capture_date, capture_time, captured_at, width, height,
             alicante_temp, alicante_sunrise, alicante_sunset, alicante_day_length,
             bratislava_temp, bratislava_sunrise, bratislava_sunset, bratislava_day_length
      FROM captures
      ORDER BY captured_at DESC
      LIMIT 1
    `);

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      id: row.id,
      filename: `${row.id}.jpg`,
      time: row.capture_time.toString().substring(0, 5),
      url: `/api/images/data/${row.id}/overlay`,
      rawUrl: `/api/images/data/${row.id}`,
      date: row.capture_date instanceof Date ? row.capture_date.toISOString().split('T')[0] : row.capture_date,
      width: row.width,
      height: row.height
    };
  } catch (error) {
    console.error('Error getting latest capture:', error);
    return null;
  } finally {
    conn.release();
  }
}

/**
 * Get image data by capture ID
 */
export async function getImageData(captureId) {
  const conn = await getPool().getConnection();
  try {
    const [rows] = await conn.execute(`
      SELECT image_data, image_format
      FROM captures
      WHERE id = ?
    `, [captureId]);

    if (rows.length === 0) return null;
    return {
      data: rows[0].image_data,
      format: rows[0].image_format || 'jpeg'
    };
  } catch (error) {
    console.error('Error getting image data:', error);
    return null;
  } finally {
    conn.release();
  }
}

/**
 * Get full capture data including image and weather metadata (for overlay)
 */
export async function getFullCaptureData(captureId) {
  const conn = await getPool().getConnection();
  try {
    const [rows] = await conn.execute(`
      SELECT id, capture_date, capture_time, image_data, image_format, width, height,
             alicante_temp, alicante_sunrise, alicante_sunset, alicante_day_length,
             bratislava_temp, bratislava_sunrise, bratislava_sunset, bratislava_day_length
      FROM captures
      WHERE id = ?
    `, [captureId]);

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      id: row.id,
      date: row.capture_date instanceof Date ? row.capture_date.toISOString().split('T')[0] : row.capture_date,
      time: row.capture_time?.toString().substring(0, 5) || '',
      imageData: row.image_data,
      format: row.image_format || 'jpeg',
      width: row.width,
      height: row.height,
      weather: {
        alicante: {
          temp: row.alicante_temp,
          sunrise: row.alicante_sunrise,
          sunset: row.alicante_sunset,
          day_length: row.alicante_day_length
        },
        bratislava: {
          temp: row.bratislava_temp,
          sunrise: row.bratislava_sunrise,
          sunset: row.bratislava_sunset,
          day_length: row.bratislava_day_length
        }
      }
    };
  } catch (error) {
    console.error('Error getting full capture data:', error);
    return null;
  } finally {
    conn.release();
  }
}

/**
 * Get capture IDs for a date (for video generation)
 */
export async function getCaptureIdsForDay(date) {
  const conn = await getPool().getConnection();
  try {
    const [rows] = await conn.execute(`
      SELECT id, capture_time
      FROM captures
      WHERE capture_date = ?
      ORDER BY capture_time ASC
    `, [date]);
    return rows;
  } catch (error) {
    console.error('Error getting capture IDs:', error);
    return [];
  } finally {
    conn.release();
  }
}

/**
 * Get daylight capture IDs for a date (between sunrise and sunset)
 */
export async function getDaylightCaptureIdsForDay(date, sunriseTime, sunsetTime) {
  const conn = await getPool().getConnection();
  try {
    const [rows] = await conn.execute(`
      SELECT id, capture_time
      FROM captures
      WHERE capture_date = ?
        AND capture_time >= ?
        AND capture_time <= ?
      ORDER BY capture_time ASC
    `, [date, sunriseTime, sunsetTime]);
    return rows;
  } catch (error) {
    console.error('Error getting daylight capture IDs:', error);
    return [];
  } finally {
    conn.release();
  }
}

/**
 * Get image count per day
 */
export async function getImageCounts() {
  const conn = await getPool().getConnection();
  try {
    const [rows] = await conn.execute(`
      SELECT DATE_FORMAT(capture_date, '%Y-%m-%d') as date, COUNT(*) as count
      FROM captures
      GROUP BY capture_date
      ORDER BY capture_date DESC
    `);
    const counts = {};
    for (const row of rows) {
      counts[row.date] = row.count;
    }
    return counts;
  } catch (error) {
    console.error('Error getting image counts:', error);
    return {};
  } finally {
    conn.release();
  }
}

/**
 * Delete a capture by ID
 */
export async function deleteCapture(captureId) {
  const conn = await getPool().getConnection();
  try {
    await conn.execute('DELETE FROM captures WHERE id = ?', [captureId]);
    console.log(`Deleted capture: ${captureId}`);
    return { success: true };
  } catch (error) {
    console.error('Error deleting capture:', error);
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * Delete all captures for a date
 */
export async function deleteCapturesForDay(date) {
  const conn = await getPool().getConnection();
  try {
    const [result] = await conn.execute('DELETE FROM captures WHERE capture_date = ?', [date]);
    console.log(`Deleted ${result.affectedRows} captures for ${date}`);
    return { success: true, deleted: result.affectedRows };
  } catch (error) {
    console.error('Error deleting captures:', error);
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * Get sunrise/sunset from latest capture for a date
 */
export async function getSunTimesForDate(date) {
  const conn = await getPool().getConnection();
  try {
    const [rows] = await conn.execute(`
      SELECT alicante_sunrise, alicante_sunset
      FROM captures
      WHERE capture_date = ?
        AND alicante_sunrise IS NOT NULL
      ORDER BY capture_time DESC
      LIMIT 1
    `, [date]);

    if (rows.length === 0) {
      return { sunrise: '06:00', sunset: '20:00' };
    }
    return {
      sunrise: rows[0].alicante_sunrise || '06:00',
      sunset: rows[0].alicante_sunset || '20:00'
    };
  } catch (error) {
    console.error('Error getting sun times:', error);
    return { sunrise: '06:00', sunset: '20:00' };
  } finally {
    conn.release();
  }
}

/**
 * Close database pool
 */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
