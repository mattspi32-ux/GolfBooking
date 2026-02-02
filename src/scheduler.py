"""Scheduler module for auto-booking tee times at release time.

BRS Golf clubs typically release tee times at a set time (e.g., 7:30 PM)
for a date N days in advance. This module waits until the exact release
moment, then immediately triggers the booking flow to grab preferred slots
before they fill up.
"""

import logging
import time
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


def calculate_booking_date(days_ahead: int) -> str:
    """Calculate the date that will be available for booking.

    Args:
        days_ahead: Number of days in advance bookings open.

    Returns:
        Date string in YYYY/MM/DD format.
    """
    target = datetime.now() + timedelta(days=days_ahead)
    return target.strftime("%Y/%m/%d")


def wait_until_release(release_time_str: str):
    """Block until the booking release time is reached.

    Uses a two-phase approach:
    1. Sleep in 1-second intervals until close to release time.
    2. Busy-wait (tight loop) for the final 2 seconds for precision.

    Args:
        release_time_str: Release time in HH:MM:SS format (24hr).
    """
    now = datetime.now()
    release_parts = release_time_str.split(":")
    release_time = now.replace(
        hour=int(release_parts[0]),
        minute=int(release_parts[1]),
        second=int(release_parts[2]),
        microsecond=0,
    )

    # If release time has already passed today, target tomorrow
    if release_time <= now:
        release_time += timedelta(days=1)

    wait_seconds = (release_time - datetime.now()).total_seconds()
    logger.info(
        "Waiting %.1f seconds until release time %s",
        wait_seconds,
        release_time_str,
    )
    print(f"Booking release at {release_time_str}. Waiting {wait_seconds:.0f}s...")

    # Phase 1: coarse sleep
    while True:
        remaining = (release_time - datetime.now()).total_seconds()
        if remaining <= 2:
            break
        time.sleep(1)

    # Phase 2: busy-wait for precision
    while datetime.now() < release_time:
        pass

    logger.info("Release time reached. Starting booking process.")
    print("Release time reached! Booking now...")
