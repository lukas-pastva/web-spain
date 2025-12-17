"""
Image Overlay Module
Adds weather information and temperature gauges to webcam screenshots
"""
from PIL import Image, ImageDraw, ImageFont
import math
import os
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


def add_overlay(
    image_path: str,
    output_path: str,
    alicante_weather: Optional[Dict],
    bratislava_weather: Optional[Dict]
) -> bool:
    """
    Add weather overlay to an image.

    Args:
        image_path: Path to the input image
        output_path: Path to save the output image
        alicante_weather: Weather data for Alicante
        bratislava_weather: Weather data for Bratislava

    Returns:
        True if successful, False otherwise
    """
    try:
        # Open image
        image = Image.open(image_path)

        # Convert to RGB if necessary
        if image.mode != 'RGB':
            image = image.convert('RGB')

        # Resize to 800x450 (16:9) if needed
        target_width, target_height = 800, 450
        if image.size != (target_width, target_height):
            # Crop to 16:9 aspect ratio first (from center)
            img_width, img_height = image.size
            target_ratio = target_width / target_height
            img_ratio = img_width / img_height

            if img_ratio > target_ratio:
                # Image is wider, crop width
                new_width = int(img_height * target_ratio)
                left = (img_width - new_width) // 2
                image = image.crop((left, 0, left + new_width, img_height))
            elif img_ratio < target_ratio:
                # Image is taller, crop height
                new_height = int(img_width / target_ratio)
                top = (img_height - new_height) // 2
                image = image.crop((0, top, img_width, top + new_height))

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
        gauge_size = 120
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

        # Save image
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        image.save(output_path, 'JPEG', quality=90)

        return True

    except Exception as e:
        print(f"Error adding overlay: {e}")
        return False


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
