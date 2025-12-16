#!/usr/bin/env python3
"""
Webcam Scraper
Captures screenshots from Algarapictures webcam with weather overlay
"""
import os
import sys
import time
import random
import signal
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, WebDriverException
from webdriver_manager.chrome import ChromeDriverManager

from weather import get_all_weather
from overlay import add_overlay


# Configuration
WEBCAM_URL = os.environ.get('TARGET_URL', 'https://www.algarapictures.com/webcam')
SCREENSHOT_INTERVAL = 600  # 10 minutes in seconds
INTERVAL_JITTER = 30  # ±30 seconds random jitter


def get_storage_path() -> str:
    """Get storage path from environment variable."""
    return os.environ.get('OUTPUT_DIR', '/data')


def get_screenshot_dir() -> str:
    """Get the screenshot directory for today."""
    storage_path = get_storage_path()
    today = datetime.now().strftime('%Y-%m-%d')
    screenshot_dir = os.path.join(storage_path, 'images', today)
    os.makedirs(screenshot_dir, exist_ok=True)
    return screenshot_dir


def get_temp_dir() -> str:
    """Get temporary directory for raw screenshots."""
    temp_dir = '/tmp/webcam-scraper'
    os.makedirs(temp_dir, exist_ok=True)
    return temp_dir


def setup_driver() -> webdriver.Chrome:
    """Set up Chrome WebDriver with appropriate options."""
    options = Options()
    options.add_argument('--headless=new')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-gpu')
    options.add_argument('--window-size=1920,1080')
    options.add_argument('--disable-extensions')
    options.add_argument('--disable-infobars')
    options.add_argument('--mute-audio')
    options.add_argument('--autoplay-policy=no-user-gesture-required')

    # Use webdriver-manager to auto-install chromedriver
    service = Service(ChromeDriverManager().install())

    driver = webdriver.Chrome(service=service, options=options)
    driver.set_page_load_timeout(60)

    return driver


def capture_screenshot(driver: webdriver.Chrome) -> str:
    """
    Navigate to webcam page, maximize video, and capture screenshot.
    Returns the path to the raw screenshot.
    """
    print(f"[{datetime.now()}] Navigating to webcam page...")
    driver.get(WEBCAM_URL)

    # Wait for page to load
    time.sleep(5)

    try:
        # Wait for video element
        print("Waiting for video element...")
        wait = WebDriverWait(driver, 30)

        # Try to find video or iframe containing video
        video_selectors = [
            'video',
            'iframe[src*="youtube"]',
            'iframe[src*="vimeo"]',
            '.video-container video',
            '#player video',
            '.player video'
        ]

        video_element = None
        for selector in video_selectors:
            try:
                video_element = wait.until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, selector))
                )
                print(f"Found video element with selector: {selector}")
                break
            except TimeoutException:
                continue

        if not video_element:
            print("Warning: Could not find video element, taking screenshot anyway")

        # Try to click play button if video is paused
        play_selectors = [
            '.ytp-play-button',
            '.play-button',
            'button[aria-label*="Play"]',
            'button[title*="Play"]',
            '.vp-play-button'
        ]

        for selector in play_selectors:
            try:
                play_btn = driver.find_element(By.CSS_SELECTOR, selector)
                play_btn.click()
                print(f"Clicked play button: {selector}")
                time.sleep(2)
                break
            except:
                continue

        # Try to click fullscreen button
        fullscreen_selectors = [
            '.ytp-fullscreen-button',
            'button[aria-label*="fullscreen"]',
            'button[aria-label*="Fullscreen"]',
            'button[title*="fullscreen"]',
            'button[title*="Fullscreen"]',
            '.vp-fullscreen-button',
            '.fullscreen-button',
            '[class*="fullscreen"]'
        ]

        for selector in fullscreen_selectors:
            try:
                fs_btn = driver.find_element(By.CSS_SELECTOR, selector)
                fs_btn.click()
                print(f"Clicked fullscreen button: {selector}")
                time.sleep(2)
                break
            except:
                continue

        # Wait a moment for any transitions
        time.sleep(3)

        # Take screenshot
        timestamp = datetime.now().strftime('%H-%M-%S')
        temp_path = os.path.join(get_temp_dir(), f'raw_{timestamp}.png')

        driver.save_screenshot(temp_path)
        print(f"Screenshot saved to: {temp_path}")

        return temp_path

    except Exception as e:
        print(f"Error during capture: {e}")
        # Take screenshot anyway
        timestamp = datetime.now().strftime('%H-%M-%S')
        temp_path = os.path.join(get_temp_dir(), f'raw_{timestamp}.png')
        driver.save_screenshot(temp_path)
        return temp_path


def process_screenshot(raw_path: str) -> str:
    """
    Add weather overlay to screenshot and save to final location.
    Returns the final path.
    """
    # Get weather data
    print("Fetching weather data...")
    weather = get_all_weather()

    alicante = weather.get('alicante')
    bratislava = weather.get('bratislava')

    if alicante:
        print(f"Alicante: {alicante['temperature']}°C, sunrise {alicante['sunrise']}, sunset {alicante['sunset']}")
    if bratislava:
        print(f"Bratislava: {bratislava['temperature']}°C, sunrise {bratislava['sunrise']}, sunset {bratislava['sunset']}")

    # Generate output path
    timestamp = datetime.now().strftime('%H-%M-%S')
    output_path = os.path.join(get_screenshot_dir(), f'{timestamp}.jpg')

    # Add overlay
    print("Adding weather overlay...")
    success = add_overlay(raw_path, output_path, alicante, bratislava)

    if success:
        print(f"Final screenshot saved to: {output_path}")
        # Clean up temp file
        try:
            os.remove(raw_path)
        except:
            pass
        return output_path
    else:
        print("Failed to add overlay, keeping raw screenshot")
        return raw_path


def get_next_interval() -> int:
    """Get the next interval with random jitter."""
    jitter = random.randint(-INTERVAL_JITTER, INTERVAL_JITTER)
    interval = SCREENSHOT_INTERVAL + jitter
    return max(60, interval)  # Minimum 1 minute


def run_once():
    """Run a single capture cycle."""
    driver = None
    try:
        driver = setup_driver()
        raw_path = capture_screenshot(driver)
        if raw_path:
            final_path = process_screenshot(raw_path)
            print(f"Capture complete: {final_path}")
    except Exception as e:
        print(f"Error during capture cycle: {e}")
    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass


def run_continuous():
    """Run continuous capture loop."""
    print(f"Starting continuous capture...")
    print(f"Target URL: {WEBCAM_URL}")
    print(f"Output directory: {get_storage_path()}")
    print(f"Interval: {SCREENSHOT_INTERVAL}s ± {INTERVAL_JITTER}s")

    # Handle graceful shutdown
    running = True

    def signal_handler(signum, frame):
        nonlocal running
        print("\nShutting down...")
        running = False

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    while running:
        try:
            run_once()
        except Exception as e:
            print(f"Error in capture cycle: {e}")

        if running:
            next_interval = get_next_interval()
            print(f"Next capture in {next_interval} seconds...")

            # Sleep in small increments to allow graceful shutdown
            for _ in range(next_interval):
                if not running:
                    break
                time.sleep(1)

    print("Scraper stopped.")


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--once':
        run_once()
    else:
        run_continuous()
