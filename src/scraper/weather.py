"""
Open-Meteo Weather API Client
Fetches weather data for Alicante and Bratislava
"""
import requests
from datetime import datetime
from typing import Dict, Optional
import json
import os

# City coordinates
CITIES = {
    'alicante': {'lat': 38.3452, 'lon': -0.4815, 'name': 'Alicante'},
    'bratislava': {'lat': 48.1486, 'lon': 17.1077, 'name': 'Bratislava'}
}

CACHE_FILE = 'weather_cache.json'
CACHE_DURATION = 600  # 10 minutes in seconds


def get_storage_path() -> str:
    """Get storage path from environment variable."""
    return os.environ.get('OUTPUT_DIR', '/data')


def get_cache_path() -> str:
    """Get cache file path."""
    storage_path = get_storage_path()
    metadata_path = os.path.join(storage_path, 'metadata')
    os.makedirs(metadata_path, exist_ok=True)
    return os.path.join(metadata_path, CACHE_FILE)


def load_cache() -> Dict:
    """Load weather cache from file."""
    cache_path = get_cache_path()
    try:
        if os.path.exists(cache_path):
            with open(cache_path, 'r') as f:
                return json.load(f)
    except (json.JSONDecodeError, IOError):
        pass
    return {}


def save_cache(cache: Dict) -> None:
    """Save weather cache to file."""
    cache_path = get_cache_path()
    try:
        with open(cache_path, 'w') as f:
            json.dump(cache, f)
    except IOError as e:
        print(f"Warning: Could not save cache: {e}")


def is_cache_valid(cache: Dict, city: str) -> bool:
    """Check if cached data is still valid."""
    if city not in cache:
        return False
    cached_time = cache[city].get('timestamp', 0)
    return (datetime.now().timestamp() - cached_time) < CACHE_DURATION


def fetch_weather_data(city: str) -> Optional[Dict]:
    """
    Fetch weather data from Open-Meteo API.

    Returns dict with:
        - temperature: current temperature in Celsius
        - sunrise: sunrise time (HH:MM)
        - sunset: sunset time (HH:MM)
        - day_length: day length in hours and minutes
    """
    if city not in CITIES:
        raise ValueError(f"Unknown city: {city}")

    # Check cache first
    cache = load_cache()
    if is_cache_valid(cache, city):
        return cache[city]['data']

    coords = CITIES[city]
    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={coords['lat']}&longitude={coords['lon']}"
        f"&current=temperature_2m"
        f"&daily=sunrise,sunset"
        f"&timezone=auto"
    )

    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()

        # Parse response
        current_temp = data.get('current', {}).get('temperature_2m', 0)
        daily = data.get('daily', {})

        # Get today's sunrise/sunset
        sunrise_str = daily.get('sunrise', [''])[0]  # Format: "2024-12-16T07:45"
        sunset_str = daily.get('sunset', [''])[0]

        # Parse times
        sunrise_time = datetime.fromisoformat(sunrise_str) if sunrise_str else None
        sunset_time = datetime.fromisoformat(sunset_str) if sunset_str else None

        # Calculate day length
        day_length_str = ""
        if sunrise_time and sunset_time:
            day_length = sunset_time - sunrise_time
            hours = int(day_length.total_seconds() // 3600)
            minutes = int((day_length.total_seconds() % 3600) // 60)
            day_length_str = f"{hours}h {minutes}m"

        result = {
            'city': coords['name'],
            'temperature': round(current_temp, 1),
            'sunrise': sunrise_time.strftime('%H:%M') if sunrise_time else '--:--',
            'sunset': sunset_time.strftime('%H:%M') if sunset_time else '--:--',
            'day_length': day_length_str,
            'sunrise_datetime': sunrise_str,
            'sunset_datetime': sunset_str
        }

        # Update cache
        cache[city] = {
            'timestamp': datetime.now().timestamp(),
            'data': result
        }
        save_cache(cache)

        return result

    except requests.RequestException as e:
        print(f"Error fetching weather data for {city}: {e}")
        # Return cached data if available, even if expired
        if city in cache:
            return cache[city].get('data')
        return None


def get_all_weather() -> Dict[str, Dict]:
    """Fetch weather data for all cities."""
    result = {}
    for city in CITIES:
        data = fetch_weather_data(city)
        if data:
            result[city] = data
    return result


if __name__ == '__main__':
    # Test the weather API
    weather = get_all_weather()
    for city, data in weather.items():
        print(f"\n{city.upper()}:")
        print(f"  Temperature: {data['temperature']}°C")
        print(f"  Sunrise: {data['sunrise']}")
        print(f"  Sunset: {data['sunset']}")
        print(f"  Day Length: {data['day_length']}")
