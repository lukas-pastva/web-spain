"""
Image Overlay Module
Adds weather information and temperature gauges to webcam screenshots
"""
from PIL import Image, ImageDraw, ImageFont
import math
import os
from datetime import datetime, timedelta
from calendar import monthrange
from typing import Dict, Tuple, Optional


def get_font(size: int) -> ImageFont.FreeTypeFont:
    """Get a font for drawing text."""
    # Try to use a system font, fall back to default
    font_paths = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
        '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
        'C:/Windows/Fonts/arial.ttf',
        'C:/Windows/Fonts/arialbd.ttf',
    ]

    for font_path in font_paths:
        if os.path.exists(font_path):
            try:
                return ImageFont.truetype(font_path, size)
            except IOError:
                continue

    # Fall back to default font
    try:
        return ImageFont.truetype("DejaVuSans-Bold.ttf", size)
    except IOError:
        return ImageFont.load_default()


def draw_text_with_shadow(
    draw: ImageDraw.Draw,
    position: Tuple[int, int],
    text: str,
    font: ImageFont.FreeTypeFont,
    text_color: str = 'white',
    shadow_color: str = 'black',
    shadow_offset: int = 2
) -> None:
    """Draw text with a shadow for better visibility."""
    x, y = position
    # Draw shadow
    draw.text((x + shadow_offset, y + shadow_offset), text, font=font, fill=shadow_color)
    # Draw text
    draw.text((x, y), text, font=font, fill=text_color)


def draw_weather_info(
    draw: ImageDraw.Draw,
    position: Tuple[int, int],
    weather: Dict,
    align: str = 'left'
) -> None:
    """
    Draw weather information on the image.

    Args:
        draw: PIL ImageDraw object
        position: (x, y) position for the text
        weather: Weather data dictionary
        align: 'left' or 'right' alignment
    """
    title_font = get_font(28)
    info_font = get_font(22)

    x, y = position
    line_height = 30

    city = weather.get('city', 'Unknown')
    temp = weather.get('temperature', '--')
    sunrise = weather.get('sunrise', '--:--')
    sunset = weather.get('sunset', '--:--')
    day_length = weather.get('day_length', '--')

    lines = [
        (f"{city}", title_font),
        (f"Temp: {temp}°C", info_font),
        (f"Sunrise: {sunrise}", info_font),
        (f"Sunset: {sunset}", info_font),
        (f"Day: {day_length}", info_font),
    ]

    for i, (text, font) in enumerate(lines):
        text_y = y + (i * line_height)

        if align == 'right':
            # Get text width for right alignment
            bbox = draw.textbbox((0, 0), text, font=font)
            text_width = bbox[2] - bbox[0]
            text_x = x - text_width
        else:
            text_x = x

        draw_text_with_shadow(draw, (text_x, text_y), text, font)


def draw_temperature_gauge(
    draw: ImageDraw.Draw,
    image: Image.Image,
    center: Tuple[int, int],
    temperature: float,
    city: str,
    size: int = 100
) -> None:
    """
    Draw a circular temperature gauge.

    Args:
        draw: PIL ImageDraw object
        image: PIL Image object (for alpha compositing if needed)
        center: (x, y) center position of the gauge
        temperature: Temperature in Celsius
        city: City name to display
        size: Diameter of the gauge
    """
    cx, cy = center
    radius = size // 2

    # Temperature range: -20°C to 50°C
    min_temp = -20
    max_temp = 50
    temp_range = max_temp - min_temp

    # Clamp temperature
    temp_clamped = max(min_temp, min(max_temp, temperature))
    temp_ratio = (temp_clamped - min_temp) / temp_range

    # Color based on temperature (blue -> green -> yellow -> red)
    if temp_clamped < 0:
        # Blue to cyan
        ratio = (temp_clamped - min_temp) / 20
        r = int(0 + ratio * 0)
        g = int(100 + ratio * 155)
        b = int(255)
    elif temp_clamped < 15:
        # Cyan to green
        ratio = temp_clamped / 15
        r = int(0)
        g = int(200 + ratio * 55)
        b = int(255 - ratio * 255)
    elif temp_clamped < 25:
        # Green to yellow
        ratio = (temp_clamped - 15) / 10
        r = int(ratio * 255)
        g = int(255)
        b = int(0)
    elif temp_clamped < 35:
        # Yellow to orange
        ratio = (temp_clamped - 25) / 10
        r = int(255)
        g = int(255 - ratio * 100)
        b = int(0)
    else:
        # Orange to red
        ratio = (temp_clamped - 35) / 15
        r = int(255)
        g = int(155 - ratio * 155)
        b = int(0)

    temp_color = (r, g, b)

    # Draw outer circle (background)
    draw.ellipse(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        outline='white',
        width=3
    )

    # Draw arc representing temperature
    # Arc goes from -150° to 150° (300° total range)
    start_angle = 150
    end_angle = 150 - (temp_ratio * 300)

    # Draw filled arc
    draw.arc(
        [cx - radius + 5, cy - radius + 5, cx + radius - 5, cy + radius - 5],
        start=end_angle,
        end=start_angle,
        fill=temp_color,
        width=15
    )

    # Draw temperature text in center
    temp_font = get_font(32)
    temp_text = f"{temperature:.0f}°"
    bbox = draw.textbbox((0, 0), temp_text, font=temp_font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    draw_text_with_shadow(
        draw,
        (cx - text_width // 2, cy - text_height // 2 - 10),
        temp_text,
        temp_font
    )

    # Draw city name below gauge
    city_font = get_font(18)
    bbox = draw.textbbox((0, 0), city, font=city_font)
    text_width = bbox[2] - bbox[0]
    draw_text_with_shadow(
        draw,
        (cx - text_width // 2, cy + radius + 10),
        city,
        city_font
    )


def draw_temperature_difference(
    draw: ImageDraw.Draw,
    center: Tuple[int, int],
    alicante_temp: float,
    bratislava_temp: float
) -> None:
    """
    Draw a graphical temperature difference indicator between Alicante and Bratislava.

    Args:
        draw: PIL ImageDraw object
        center: (x, y) center position of the indicator
        alicante_temp: Temperature in Alicante (Celsius)
        bratislava_temp: Temperature in Bratislava (Celsius)
    """
    cx, cy = center
    diff = alicante_temp - bratislava_temp

    # Dimensions
    box_width = 140
    box_height = 70

    # Background rounded rectangle with gradient effect (semi-transparent dark)
    bg_left = cx - box_width // 2
    bg_top = cy - box_height // 2
    bg_right = cx + box_width // 2
    bg_bottom = cy + box_height // 2

    # Draw background with rounded corners
    draw.rounded_rectangle(
        [(bg_left, bg_top), (bg_right, bg_bottom)],
        radius=12,
        fill=(30, 30, 50, 200)
    )

    # Draw border
    border_color = (255, 200, 100) if diff > 0 else (100, 200, 255) if diff < 0 else (200, 200, 200)
    draw.rounded_rectangle(
        [(bg_left, bg_top), (bg_right, bg_bottom)],
        radius=12,
        outline=border_color,
        width=2
    )

    # Title "DIFF" at top
    title_font = get_font(12)
    title_text = "DIFFERENCE"
    bbox = draw.textbbox((0, 0), title_text, font=title_font)
    title_width = bbox[2] - bbox[0]
    draw.text(
        (cx - title_width // 2, bg_top + 6),
        title_text,
        font=title_font,
        fill=(180, 180, 200)
    )

    # Main difference value
    diff_font = get_font(28)
    sign = "+" if diff > 0 else ""
    diff_text = f"{sign}{diff:.1f}°"
    bbox = draw.textbbox((0, 0), diff_text, font=diff_font)
    diff_width = bbox[2] - bbox[0]

    # Color based on difference (warm = orange/red, cold = blue/cyan)
    if diff > 0:
        # Warmer in Alicante - warm colors
        if diff > 15:
            diff_color = (255, 100, 50)  # Hot red-orange
        elif diff > 8:
            diff_color = (255, 165, 0)   # Orange
        else:
            diff_color = (255, 200, 100) # Light orange
    elif diff < 0:
        # Colder in Alicante - cool colors
        if diff < -15:
            diff_color = (50, 150, 255)  # Deep blue
        elif diff < -8:
            diff_color = (100, 200, 255) # Light blue
        else:
            diff_color = (150, 220, 255) # Very light blue
    else:
        diff_color = (200, 200, 200)     # Gray for equal

    draw_text_with_shadow(
        draw,
        (cx - diff_width // 2, cy - 8),
        diff_text,
        diff_font,
        text_color=diff_color
    )

    # Arrow indicator and label at bottom
    arrow_font = get_font(11)
    if diff > 0:
        # Alicante is warmer
        arrow = "▲"
        label = "ALI warmer"
    elif diff < 0:
        # Bratislava is warmer
        arrow = "▼"
        label = "BRA warmer"
    else:
        arrow = "="
        label = "Same temp"

    # Draw arrow
    arrow_y = bg_bottom - 18
    bbox = draw.textbbox((0, 0), arrow, font=arrow_font)
    arrow_width = bbox[2] - bbox[0]
    draw.text(
        (cx - 35 - arrow_width // 2, arrow_y),
        arrow,
        font=arrow_font,
        fill=diff_color
    )

    # Draw label
    draw.text(
        (cx - 25, arrow_y),
        label,
        font=arrow_font,
        fill=(180, 180, 200)
    )


def draw_date_indicator(
    draw: ImageDraw.Draw,
    width: int,
    height: int,
    current_date: datetime
) -> None:
    """
    Draw a date indicator at the bottom of the image showing:
    - 5-month timeline (2 before, current, 2 after)
    - Day marker showing position within the month

    Args:
        draw: PIL ImageDraw object
        width: Image width
        height: Image height
        current_date: Current date
    """
    # Calculate overlay dimensions (responsive to image size) - reduced to half
    overlay_height = max(30, int(height * 0.065))
    bottom_padding = 10
    overlay_y = height - overlay_height - bottom_padding

    # No background - transparent

    # Generate 5 months centered around current month
    months = []
    for i in range(-2, 3):
        target_date = current_date + timedelta(days=i * 30)
        target_date = target_date.replace(day=1)
        months.append({
            'label': target_date.strftime('%Y-%m'),
            'is_active': i == 0
        })

    # Draw month timeline
    month_font_size = max(11, int(overlay_height * 0.18))
    month_font = get_font(month_font_size)
    active_font_size = max(13, int(overlay_height * 0.22))
    active_font = get_font(active_font_size)

    month_y = overlay_y + 10
    month_width = width // 5

    for idx, month_info in enumerate(months):
        font = active_font if month_info['is_active'] else month_font
        color = (255, 255, 255) if month_info['is_active'] else (255, 255, 255, 100)

        # Center the month label
        bbox = draw.textbbox((0, 0), month_info['label'], font=font)
        text_width = bbox[2] - bbox[0]
        month_x = (idx * month_width) + (month_width - text_width) // 2

        draw.text((month_x, month_y), month_info['label'], font=font, fill=color)

    # Calculate day position within month
    day = current_date.day
    days_in_month = monthrange(current_date.year, current_date.month)[1]
    day_position = (day - 1) / (days_in_month - 1) if days_in_month > 1 else 0.5

    # Draw track bar
    track_height = max(4, int(overlay_height * 0.08))
    track_y = overlay_y + int(overlay_height * 0.65)
    track_margin = 40
    track_width = width - (track_margin * 2)
    track_x = track_margin

    # Purple/blue gradient track (simulate with solid color for simplicity)
    draw.rectangle(
        [(track_x, track_y), (track_x + track_width, track_y + track_height)],
        fill=(102, 126, 234)
    )

    # Draw day marker
    marker_x = track_x + int(track_width * day_position)
    marker_height = max(20, int(overlay_height * 0.35))
    marker_width = 3
    marker_y_start = track_y - (marker_height - track_height) // 2

    # Glowing white marker line
    draw.rectangle(
        [(marker_x - marker_width//2, marker_y_start),
         (marker_x + marker_width//2, marker_y_start + marker_height)],
        fill=(255, 255, 255)
    )

    # Day number label above marker
    day_font_size = max(12, int(overlay_height * 0.20))
    day_font = get_font(day_font_size)
    day_text = str(day)
    bbox = draw.textbbox((0, 0), day_text, font=day_font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]

    label_padding = 4
    label_x = marker_x - text_width // 2 - label_padding
    label_y = marker_y_start - text_height - 10
    label_width = text_width + label_padding * 2
    label_height = text_height + label_padding

    # Purple/blue gradient label background
    draw.rounded_rectangle(
        [(label_x, label_y), (label_x + label_width, label_y + label_height)],
        radius=4,
        fill=(102, 126, 234)
    )

    # Day number text
    draw.text(
        (marker_x - text_width // 2, label_y + label_padding // 2),
        day_text,
        font=day_font,
        fill=(255, 255, 255)
    )


def add_overlay(
    image_path: str,
    output_path: str,
    alicante_weather: Optional[Dict],
    bratislava_weather: Optional[Dict],
    capture_time: Optional[str] = None
) -> bool:
    """
    Add weather overlay to an image and save to file.

    Args:
        image_path: Path to the input image
        output_path: Path to save the output image
        alicante_weather: Weather data for Alicante
        bratislava_weather: Weather data for Bratislava
        capture_time: Timestamp string to display (e.g., "14:30:45")

    Returns:
        True if successful, False otherwise
    """
    try:
        result = add_overlay_to_image(image_path, alicante_weather, bratislava_weather, capture_time)
        if result is None:
            return False

        image, _, _ = result
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        image.save(output_path, 'JPEG', quality=90)
        return True

    except Exception as e:
        print(f"Error adding overlay: {e}")
        return False


def add_overlay_to_image(
    image_path: str,
    alicante_weather: Optional[Dict],
    bratislava_weather: Optional[Dict],
    capture_time: Optional[str] = None
) -> Optional[Tuple[Image.Image, int, int]]:
    """
    Add weather overlay to an image and return the PIL Image object.

    Args:
        image_path: Path to the input image
        alicante_weather: Weather data for Alicante
        bratislava_weather: Weather data for Bratislava
        capture_time: Timestamp string to display (e.g., "14:30:45")

    Returns:
        Tuple of (PIL Image, width, height) if successful, None otherwise
    """
    try:
        # Open image
        image = Image.open(image_path)

        # Convert to RGB if necessary
        if image.mode != 'RGB':
            image = image.convert('RGB')

        # Crop positions from environment variables (percentages 0-100)
        # CROP_X1: left edge (default 0)
        # CROP_Y1: top edge (default 0)
        # CROP_X2: right edge (default 100)
        # CROP_Y2: bottom edge (default 100)
        img_width, img_height = image.size

        x1 = float(os.environ.get('CROP_X1', '0')) / 100
        y1 = float(os.environ.get('CROP_Y1', '0')) / 100
        x2 = float(os.environ.get('CROP_X2', '100')) / 100
        y2 = float(os.environ.get('CROP_Y2', '100')) / 100

        left = int(img_width * x1)
        top = int(img_height * y1)
        right = int(img_width * x2)
        bottom = int(img_height * y2)

        # Clamp to image bounds
        left = max(0, left)
        top = max(0, top)
        right = min(right, img_width)
        bottom = min(bottom, img_height)

        if right > left and bottom > top:
            image = image.crop((left, top, right, bottom))

        # Resize to target dimensions from env (default 800x450)
        target_width = int(os.environ.get('OUTPUT_WIDTH', '800'))
        target_height = int(os.environ.get('OUTPUT_HEIGHT', '450'))

        # Resize to exact dimensions
        image = image.resize((target_width, target_height), Image.LANCZOS)

        draw = ImageDraw.Draw(image)
        width, height = image.size

        margin = 20

        # Draw Alicante weather info (top-left)
        if alicante_weather:
            draw_weather_info(
                draw,
                (margin, margin),
                alicante_weather,
                align='left'
            )

        # Draw Bratislava weather info (top-right)
        if bratislava_weather:
            draw_weather_info(
                draw,
                (width - margin, margin),
                bratislava_weather,
                align='right'
            )

        # Draw temperature gauges
        gauge_size = 80
        gauge_y = height - gauge_size // 2 - 50

        # Alicante gauge (bottom-left)
        if alicante_weather:
            draw_temperature_gauge(
                draw,
                image,
                (margin + gauge_size // 2 + 20, gauge_y),
                alicante_weather.get('temperature', 0),
                'Alicante',
                gauge_size
            )

        # Bratislava gauge (bottom-right)
        if bratislava_weather:
            draw_temperature_gauge(
                draw,
                image,
                (width - margin - gauge_size // 2 - 20, gauge_y),
                bratislava_weather.get('temperature', 0),
                'Bratislava',
                gauge_size
            )

        # Draw temperature difference indicator (bottom-center)
        if alicante_weather and bratislava_weather:
            alicante_temp = alicante_weather.get('temperature', 0)
            bratislava_temp = bratislava_weather.get('temperature', 0)
            draw_temperature_difference(
                draw,
                (width // 2, gauge_y),
                alicante_temp,
                bratislava_temp
            )

        # Draw date indicator at bottom
        current_date = datetime.now()
        draw_date_indicator(draw, width, height, current_date)

        return (image, width, height)

    except Exception as e:
        print(f"Error adding overlay: {e}")
        return None


if __name__ == '__main__':
    # Test overlay
    test_weather = {
        'city': 'Test City',
        'temperature': 22.5,
        'sunrise': '07:30',
        'sunset': '17:45',
        'day_length': '10h 15m'
    }

    # Create a test image (16:9 aspect ratio)
    test_image = Image.new('RGB', (800, 450), color='skyblue')
    test_image.save('/tmp/test_input.jpg')

    add_overlay(
        '/tmp/test_input.jpg',
        '/tmp/test_output.jpg',
        test_weather,
        test_weather
    )
    print("Test overlay created at /tmp/test_output.jpg")
