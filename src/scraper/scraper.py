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


# Viewport configuration (matching old Puppeteer version)
VIEWPORT_WIDTH = int(os.environ.get('VIEWPORT_WIDTH', '1920'))
VIEWPORT_HEIGHT = int(os.environ.get('VIEWPORT_HEIGHT', '1080'))


def setup_driver() -> webdriver.Chrome:
    """Set up Chrome WebDriver with appropriate options."""
    options = Options()
    options.add_argument('--headless=new')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-gpu')
    # Set window size larger to ensure viewport is exactly VIEWPORT_WIDTH x VIEWPORT_HEIGHT
    options.add_argument(f'--window-size={VIEWPORT_WIDTH},{VIEWPORT_HEIGHT}')
    options.add_argument('--disable-extensions')
    options.add_argument('--disable-infobars')
    options.add_argument('--mute-audio')
    options.add_argument('--autoplay-policy=no-user-gesture-required')
    # Force device scale factor for consistent rendering
    options.add_argument('--force-device-scale-factor=1')
    # Disable scrollbars to get clean screenshots
    options.add_argument('--hide-scrollbars')

    # Use Chromium binary from environment or default path
    chrome_bin = os.environ.get('CHROME_BIN', '/usr/bin/chromium')
    if os.path.exists(chrome_bin):
        options.binary_location = chrome_bin

    # Use chromedriver from environment or default path, fallback to webdriver-manager
    chromedriver_path = os.environ.get('CHROMEDRIVER_PATH', '/usr/bin/chromedriver')
    if os.path.exists(chromedriver_path):
        service = Service(chromedriver_path)
    else:
        # Fallback to webdriver-manager for local development
        service = Service(ChromeDriverManager().install())

    driver = webdriver.Chrome(service=service, options=options)
    driver.set_page_load_timeout(60)

    # Explicitly set window size to ensure exact viewport dimensions
    driver.set_window_size(VIEWPORT_WIDTH, VIEWPORT_HEIGHT)

    return driver


def dismiss_cookie_banner(driver: webdriver.Chrome):
    """Dismiss the cookie notification banner if present (matches old working version)."""
    # Primary selector from old working version
    try:
        dismissed = driver.execute_script("""
            var btn = document.querySelector('#d-notification-bar .notification-dismiss');
            if (btn) { btn.click(); return true; }
            return false;
        """)
        if dismissed:
            print("Dismissed cookie banner via #d-notification-bar .notification-dismiss")
            time.sleep(0.5)
            return True
    except:
        pass

    # Fallback selectors
    cookie_dismiss_selectors = [
        '.notification-dismiss',
        '[aria-label="Dismiss notification"]',
    ]

    for selector in cookie_dismiss_selectors:
        try:
            dismiss_btn = driver.find_element(By.CSS_SELECTOR, selector)
            dismiss_btn.click()
            print(f"Dismissed cookie banner with selector: {selector}")
            time.sleep(0.5)
            return True
        except:
            continue

    print("No cookie banner found or already dismissed")
    return False


def handle_consent_dialog(driver: webdriver.Chrome, timeout: int = 8) -> bool:
    """
    Handle GDPR/cookie consent dialogs (FundingChoices and similar).
    Based on old working version's tryHandleConsent logic.
    """
    deadline = time.time() + timeout
    accepted = False

    # FundingChoices consent selectors (from old version)
    consent_selectors = [
        'button.fc-cta-consent',
        'button.fc-data-preferences-accept-all',
        'button.fc-vendor-preferences-accept-all',
        'button.fc-confirm-choices',
        '.fc-consent-root button.fc-primary-button',
    ]

    # Text patterns for consent buttons (English + Spanish)
    consent_text_patterns = [
        'consent', 'accept', 'accept all', 'agree', 'allow', 'confirm', 'ok',
        'aceptar', 'aceptar todo', 'consentir', 'confirmar', 'permitir', 'de acuerdo'
    ]

    while time.time() < deadline and not accepted:
        # Try CSS selectors first
        for selector in consent_selectors:
            try:
                result = driver.execute_script(f"""
                    var el = document.querySelector('{selector}');
                    if (el && el.offsetParent !== null) {{
                        el.click();
                        return true;
                    }}
                    return false;
                """)
                if result:
                    print(f"Clicked consent button: {selector}")
                    accepted = True
                    break
            except:
                continue

        # Try text-based fallback
        if not accepted:
            try:
                accepted = driver.execute_script("""
                    var patterns = arguments[0];
                    var selectors = 'button, [role="button"], .fc-consent-root button, .fc-consent-root [role="button"]';
                    var elements = document.querySelectorAll(selectors);

                    for (var i = 0; i < elements.length; i++) {
                        var el = elements[i];
                        var text = (el.innerText || el.textContent || '').trim().toLowerCase();
                        if (!text) continue;

                        for (var j = 0; j < patterns.length; j++) {
                            if (text === patterns[j] || text.startsWith(patterns[j] + ' ') || text.startsWith(patterns[j] + '\\n')) {
                                el.click();
                                return true;
                            }
                        }
                    }
                    return false;
                """, consent_text_patterns)
                if accepted:
                    print("Clicked consent button via text match")
            except:
                pass

        # Check if consent dialog is still visible
        if accepted:
            time.sleep(0.2)
            try:
                still_visible = driver.execute_script(
                    "return !!document.querySelector('.fc-consent-root')"
                )
                if not still_visible:
                    break
                # If still visible, we may need to click more buttons
                accepted = False
            except:
                break

        if not accepted:
            time.sleep(0.25)

    if accepted:
        print("[consent] Accepted cookie/consent dialog")
        time.sleep(0.5)
    else:
        print("[consent] No consent dialog found or already dismissed")

    return accepted


def click_center_of_iframe(driver: webdriver.Chrome):
    """
    Click the exact center of the current frame/viewport.
    The big play button is typically in the center of the video player.
    """
    from selenium.webdriver.common.action_chains import ActionChains

    try:
        # Get viewport dimensions
        dims = driver.execute_script("""
            return {
                width: window.innerWidth || document.documentElement.clientWidth,
                height: window.innerHeight || document.documentElement.clientHeight
            };
        """)
        width = dims.get('width', 1920)
        height = dims.get('height', 1080)

        center_x = width // 2
        center_y = height // 2

        # Use ActionChains to click at the center coordinates
        actions = ActionChains(driver)
        # Move to body first, then offset to center
        body = driver.find_element(By.TAG_NAME, 'body')
        actions.move_to_element_with_offset(body, center_x - body.size['width']//2, center_y - body.size['height']//2)
        actions.click()
        actions.perform()

        print(f"Clicked center of iframe at ({center_x}, {center_y})")
        return True
    except Exception as e:
        print(f"Failed to click center: {e}")
        # Fallback: try clicking via JavaScript at center
        try:
            driver.execute_script("""
                var w = window.innerWidth || document.documentElement.clientWidth;
                var h = window.innerHeight || document.documentElement.clientHeight;
                var el = document.elementFromPoint(w/2, h/2);
                if (el) { el.click(); return true; }
                return false;
            """)
            print("Clicked center via JS elementFromPoint")
            return True
        except:
            pass
    return False


def handle_player_in_iframe(driver: webdriver.Chrome):
    """
    Handle play button and start video in ipcamlive iframe.
    Based on the old working version's tryClickPlayerPlay logic.
    """
    # First click on body to generate user gesture (as per old version)
    try:
        body = driver.find_element(By.TAG_NAME, 'body')
        body.click()
        print("Clicked body to generate user gesture")
        time.sleep(0.3)
    except:
        pass

    # Click the center of the iframe where the big play button is
    print("Clicking center of iframe for play button...")
    click_center_of_iframe(driver)
    time.sleep(1)

    # Try JavaScript-based click with case-insensitive matching (like old Puppeteer version)
    try:
        clicked = driver.execute_script("""
            // Play button selectors - case insensitive matching via JS
            var selectors = [
                '.vjs-big-play-button',
                '.jw-icon-playback',
                '.jw-icon-play',
                '.fp-play',
                'button[aria-label*="play" i]',
                'button[title*="play" i]',
                'button[aria-label*="reproducir" i]',
                'button[title*="reproducir" i]',
                'button[class*="play" i]',
                '[class*="big-play" i]',
            ];

            // Try direct selectors first
            for (var i = 0; i < selectors.length; i++) {
                try {
                    var el = document.querySelector(selectors[i]);
                    if (el && el.offsetParent !== null) {
                        el.click();
                        return 'clicked: ' + selectors[i];
                    }
                } catch(e) {}
            }

            // Try aria-label/title containing play (case insensitive)
            var buttons = document.querySelectorAll('button, [role="button"]');
            for (var i = 0; i < buttons.length; i++) {
                var btn = buttons[i];
                var label = (btn.getAttribute('aria-label') || '').toLowerCase();
                var title = (btn.getAttribute('title') || '').toLowerCase();
                var cls = (btn.className || '').toLowerCase();

                if (label.includes('play') || label.includes('reproducir') ||
                    title.includes('play') || title.includes('reproducir') ||
                    cls.includes('play')) {
                    if (btn.offsetParent !== null) {
                        btn.click();
                        return 'clicked button with play attribute';
                    }
                }
            }

            // Try clicking any element with play in class
            var playEls = document.querySelectorAll('[class*="play"], [class*="Play"]');
            for (var i = 0; i < playEls.length; i++) {
                var el = playEls[i];
                if (el.offsetParent !== null) {
                    el.click();
                    return 'clicked element with play class';
                }
            }

            return null;
        """)
        if clicked:
            print(f"Play button via JS: {clicked}")
            time.sleep(1)
            return True
    except Exception as e:
        print(f"JS play button click failed: {e}")

    # As a last resort, programmatically start playback (from old version)
    try:
        played = driver.execute_script("""
            var v = document.querySelector('video');
            if (!v) return false;
            try { v.muted = true; } catch(e) {}
            try { v.play(); return true; } catch(e) { return false; }
        """)
        if played:
            print("Started video playback programmatically")
            time.sleep(1)
            return True
    except:
        pass

    print("No play button found or video already playing")
    return False


def hover_video_bottom_right(driver: webdriver.Chrome):
    """
    Hover over the bottom-right of the video to reveal control bar.
    Based on old version's hoverVideoBottomRight function.
    """
    from selenium.webdriver.common.action_chains import ActionChains

    try:
        # Find video or player element
        video = driver.execute_script("""
            var el = document.querySelector('video, .vjs-tech, .jw-video, canvas, .player, [class*="player" i]');
            if (el) {
                var rect = el.getBoundingClientRect();
                return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
            }
            return null;
        """)

        if video:
            # Move to bottom-right corner to reveal controls
            x = int(video['x'] + video['width'] - 10)
            y = int(video['y'] + video['height'] - 10)

            actions = ActionChains(driver)
            actions.move_by_offset(x, y)
            actions.perform()

            print(f"Hovered at bottom-right ({x}, {y}) to reveal controls")
            time.sleep(0.3)
            return True
    except Exception as e:
        print(f"Hover failed: {e}")

    # Fallback: just hover over body
    try:
        body = driver.find_element(By.TAG_NAME, 'body')
        ActionChains(driver).move_to_element(body).perform()
        time.sleep(0.2)
    except:
        pass

    return False


def handle_fullscreen_in_iframe(driver: webdriver.Chrome):
    """
    Click fullscreen/maximize button inside the player iframe.
    Based on old version's tryClickPlayerFullscreen logic.
    """
    # Hover to reveal controls first
    hover_video_bottom_right(driver)

    # Fullscreen button selectors from old version
    fullscreen_selectors = [
        'button[aria-label*="Full" i]',
        'button[title*="Full" i]',
        'button[aria-label*="pantalla" i]',
        'button[title*="pantalla" i]',
        '.vjs-fullscreen-control',
        '.jw-icon-fullscreen',
        'button[class*="full" i]',
        '[class*="fullscreen" i]',
        'a[title*="full" i]',
    ]

    try:
        clicked = driver.execute_script("""
            var selectors = arguments[0];

            for (var i = 0; i < selectors.length; i++) {
                try {
                    var el = document.querySelector(selectors[i]);
                    if (el && el.offsetParent !== null) {
                        el.click();
                        return 'clicked: ' + selectors[i];
                    }
                } catch(e) {}
            }

            // Try any button/element with fullscreen in aria-label or title
            var buttons = document.querySelectorAll('button, [role="button"], a');
            for (var i = 0; i < buttons.length; i++) {
                var btn = buttons[i];
                var label = (btn.getAttribute('aria-label') || '').toLowerCase();
                var title = (btn.getAttribute('title') || '').toLowerCase();
                var cls = (btn.className || '').toLowerCase();

                if (label.includes('full') || label.includes('pantalla') ||
                    title.includes('full') || title.includes('pantalla') ||
                    cls.includes('fullscreen')) {
                    if (btn.offsetParent !== null) {
                        btn.click();
                        return 'clicked fullscreen button';
                    }
                }
            }

            return null;
        """, fullscreen_selectors)

        if clicked:
            print(f"Fullscreen button: {clicked}")
            time.sleep(0.5)
            return True
    except Exception as e:
        print(f"Fullscreen click failed: {e}")

    # Try programmatic fullscreen as last resort
    try:
        result = driver.execute_script("""
            var el = document.querySelector('video, canvas, .player, #player, [class*="player"]');
            var target = el || document.documentElement;
            if (target && target.requestFullscreen) {
                try { target.requestFullscreen(); return true; } catch(e) {}
            }
            return false;
        """)
        if result:
            print("Entered fullscreen programmatically")
            time.sleep(0.5)
            return True
    except:
        pass

    print("No fullscreen button found")
    return False


def wait_for_video_playing(driver: webdriver.Chrome, timeout: int = 10) -> bool:
    """Wait for video to be playing."""
    end_time = time.time() + timeout
    while time.time() < end_time:
        try:
            is_playing = driver.execute_script("""
                var v = document.querySelector('video');
                if (v && !v.paused && v.readyState >= 2) return true;
                return false;
            """)
            if is_playing:
                print("Video is playing")
                return True
        except:
            pass
        time.sleep(0.5)
    print("Video playback check timed out")
    return False


def find_player_iframe(driver: webdriver.Chrome) -> bool:
    """
    Find and switch to the ipcamlive player iframe.
    Based on old version: finds frame where URL includes 'ipcamlive.com'.
    Returns True if switched successfully.
    """
    try:
        iframes = driver.find_elements(By.TAG_NAME, 'iframe')
        print(f"Found {len(iframes)} iframes on page")

        for i, iframe in enumerate(iframes):
            src = iframe.get_attribute('src') or ''
            print(f"  Iframe {i}: {src[:80]}...")

            # Match ipcamlive.com as per old version's PLAYER_FRAME_URL_MATCH
            if 'ipcamlive.com' in src:
                driver.switch_to.frame(iframe)
                print(f"Switched to ipcamlive iframe (index {i})")
                return True

        print("No ipcamlive iframe found")
        return False
    except Exception as e:
        print(f"Error finding player iframe: {e}")
        return False


def capture_screenshot(driver: webdriver.Chrome) -> str:
    """
    Navigate to webcam page, start video playback, and capture screenshot.
    Based on old working version's captureOnce logic.
    """
    print(f"[{datetime.now()}] Navigating to webcam page...")
    driver.get(WEBCAM_URL)

    # Wait for page to load (POST_NAV_WAIT_MS in old version)
    time.sleep(5)

    try:
        # Step 1: Dismiss cookie/notification banner on main page
        print("Checking for cookie banner...")
        dismiss_cookie_banner(driver)
        time.sleep(0.5)

        # Step 2: Handle GDPR/consent dialog (FundingChoices etc.)
        print("Checking for consent dialog...")
        handle_consent_dialog(driver)
        time.sleep(0.5)

        # Step 3: Find and switch to the player iframe
        print("Looking for player iframe...")
        iframe_found = find_player_iframe(driver)

        if iframe_found:
            # Wait for iframe content to load
            time.sleep(2)

            # Step 4: Handle play button inside iframe (click center first)
            print("Attempting to start video playback...")
            handle_player_in_iframe(driver)

            # Step 5: Wait for video to actually be playing
            wait_for_video_playing(driver, timeout=10)

            # Step 6: Click fullscreen/maximize button
            print("Attempting to enter fullscreen...")
            handle_fullscreen_in_iframe(driver)

            # Give video a moment to render in fullscreen
            time.sleep(2)

            # Switch back to main content for screenshot
            driver.switch_to.default_content()

        # Wait a moment for any final rendering
        time.sleep(1)

        # Take screenshot
        timestamp = datetime.now().strftime('%H-%M-%S')
        temp_path = os.path.join(get_temp_dir(), f'raw_{timestamp}.png')

        # Try to screenshot just the iframe element for cleaner 16:9 video capture
        screenshot_taken = False
        if iframe_found:
            try:
                # Find the iframe element and screenshot it directly
                iframes = driver.find_elements(By.TAG_NAME, 'iframe')
                for iframe in iframes:
                    src = iframe.get_attribute('src') or ''
                    if 'ipcamlive.com' in src:
                        # Screenshot just the iframe element
                        iframe.screenshot(temp_path)
                        print(f"Screenshot of iframe saved to: {temp_path}")
                        screenshot_taken = True
                        break
            except Exception as e:
                print(f"Failed to screenshot iframe element: {e}")

        if not screenshot_taken:
            # Fallback to full page screenshot
            driver.save_screenshot(temp_path)
            print(f"Full page screenshot saved to: {temp_path}")

        return temp_path

    except Exception as e:
        print(f"Error during capture: {e}")
        # Make sure we're back to main content
        try:
            driver.switch_to.default_content()
        except:
            pass
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
