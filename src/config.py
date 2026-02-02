"""Configuration loader for the Golf Booking Bot.

Loads settings from environment variables (via .env file) and provides
them as a structured config object.
"""

import os
import sys
from dataclasses import dataclass, field
from typing import List

from dotenv import load_dotenv


@dataclass
class Config:
    """Application configuration loaded from environment variables."""

    # Credentials
    username: str = ""
    password: str = ""
    club_name: str = ""

    # Players
    player_1: str = ""
    player_2: str = ""
    player_3: str = ""
    player_4: str = ""

    # Booking preferences
    tee_time_preferences: List[str] = field(default_factory=list)
    booking_window_days: int = 7
    booking_release_time: str = "07:30:00"
    holes: str = "18"


def load_config() -> Config:
    """Load configuration from .env file and environment variables.

    Returns:
        Populated Config object.

    Raises:
        SystemExit: If required fields are missing.
    """
    load_dotenv()

    config = Config(
        username=os.getenv("BRS_USERNAME", ""),
        password=os.getenv("BRS_PASSWORD", ""),
        club_name=os.getenv("CLUB_NAME", "newcastleunited"),
        player_1=os.getenv("PLAYER_1", ""),
        player_2=os.getenv("PLAYER_2", ""),
        player_3=os.getenv("PLAYER_3", ""),
        player_4=os.getenv("PLAYER_4", ""),
        tee_time_preferences=_parse_times(
            os.getenv("TEE_TIME_PREFERENCES", "08:00,08:10,08:20")
        ),
        booking_window_days=int(os.getenv("BOOKING_WINDOW_DAYS", "7")),
        booking_release_time=os.getenv("BOOKING_RELEASE_TIME", "07:30:00"),
        holes=os.getenv("HOLES", "18"),
    )

    # Validate required fields
    missing = []
    if not config.username:
        missing.append("BRS_USERNAME")
    if not config.password:
        missing.append("BRS_PASSWORD")
    if not config.player_1:
        missing.append("PLAYER_1")

    if missing:
        print(f"Error: Missing required environment variables: {', '.join(missing)}")
        print("Copy .env.example to .env and fill in your details.")
        sys.exit(1)

    return config


def _parse_times(times_str: str) -> List[str]:
    """Parse comma-separated time preferences into a list."""
    return [t.strip() for t in times_str.split(",") if t.strip()]
