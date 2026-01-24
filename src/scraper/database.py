"""
Database Module
Handles MariaDB connection and capture storage
"""
import os
import mysql.connector
from mysql.connector import Error
from datetime import datetime
from typing import Optional, Dict
import io


def get_db_config() -> Dict:
    """Get database configuration from environment variables."""
    return {
        'host': os.environ.get('DB_HOST', 'localhost'),
        'database': os.environ.get('DB_NAME', 'webspain'),
        'user': os.environ.get('DB_USER', 'webspain'),
        'password': os.environ.get('DB_PASSWORD', ''),
        'charset': 'utf8mb4',
        'collation': 'utf8mb4_unicode_ci'
    }


def get_connection():
    """Create a database connection."""
    config = get_db_config()
    return mysql.connector.connect(**config)


def init_database():
    """Initialize the database schema (create tables if not exist)."""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        # Create captures table
        cursor.execute('''
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
        ''')

        conn.commit()
        print("Database initialized successfully")
        return True

    except Error as e:
        print(f"Error initializing database: {e}")
        return False
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()


def save_capture(
    image_data: bytes,
    alicante_weather: Optional[Dict] = None,
    bratislava_weather: Optional[Dict] = None,
    width: int = None,
    height: int = None
) -> Optional[int]:
    """
    Save a capture to the database.

    Args:
        image_data: JPEG image data as bytes
        alicante_weather: Weather data for Alicante
        bratislava_weather: Weather data for Bratislava
        width: Image width in pixels
        height: Image height in pixels

    Returns:
        The capture ID if successful, None otherwise
    """
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        now = datetime.now()
        capture_date = now.date()
        capture_time = now.time()

        # Extract weather data
        ali_temp = alicante_weather.get('temperature') if alicante_weather else None
        ali_sunrise = alicante_weather.get('sunrise') if alicante_weather else None
        ali_sunset = alicante_weather.get('sunset') if alicante_weather else None
        ali_day_length = alicante_weather.get('day_length') if alicante_weather else None

        bra_temp = bratislava_weather.get('temperature') if bratislava_weather else None
        bra_sunrise = bratislava_weather.get('sunrise') if bratislava_weather else None
        bra_sunset = bratislava_weather.get('sunset') if bratislava_weather else None
        bra_day_length = bratislava_weather.get('day_length') if bratislava_weather else None

        cursor.execute('''
            INSERT INTO captures (
                capture_date, capture_time, captured_at, image_data, image_format,
                width, height,
                alicante_temp, alicante_sunrise, alicante_sunset, alicante_day_length,
                bratislava_temp, bratislava_sunrise, bratislava_sunset, bratislava_day_length
            ) VALUES (
                %s, %s, %s, %s, %s,
                %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s
            )
        ''', (
            capture_date, capture_time, now, image_data, 'jpeg',
            width, height,
            ali_temp, ali_sunrise, ali_sunset, ali_day_length,
            bra_temp, bra_sunrise, bra_sunset, bra_day_length
        ))

        conn.commit()
        capture_id = cursor.lastrowid
        print(f"Saved capture {capture_id} for {capture_date} {capture_time}")
        return capture_id

    except Error as e:
        print(f"Error saving capture: {e}")
        return None
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()


def get_capture_by_id(capture_id: int) -> Optional[Dict]:
    """Get a capture by its ID."""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute('''
            SELECT id, capture_date, capture_time, captured_at, image_data,
                   width, height,
                   alicante_temp, alicante_sunrise, alicante_sunset, alicante_day_length,
                   bratislava_temp, bratislava_sunrise, bratislava_sunset, bratislava_day_length
            FROM captures
            WHERE id = %s
        ''', (capture_id,))

        return cursor.fetchone()

    except Error as e:
        print(f"Error getting capture: {e}")
        return None
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()


if __name__ == '__main__':
    # Test database initialization
    init_database()
