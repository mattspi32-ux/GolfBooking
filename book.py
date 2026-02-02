#!/usr/bin/env python3
"""BRS Golf Tee Time Booking Bot.

Auto-books tee times on the BRS Golf system for your club.

Usage:
    # Book immediately for a specific date
    python book.py --date 2026/02/09

    # Wait for release time, then auto-book the newly available date
    python book.py --wait

    # Book immediately for a custom date with specific times
    python book.py --date 2026/02/09 --times 09:00,09:10,09:20

    # Dry run - show what would be booked without actually booking
    python book.py --wait --dry-run
"""

import argparse
import logging
import sys
from datetime import datetime

from src.auth import BRSAuth
from src.booker import TeeTimeBooker
from src.config import load_config
from src.scheduler import calculate_booking_date, wait_until_release
from src.tee_sheet import TeeSheet

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("booking.log"),
    ],
)
logger = logging.getLogger(__name__)


def run_booking(config, target_date: str, dry_run: bool = False):
    """Execute the full booking flow.

    Args:
        config: Application configuration.
        target_date: Date to book in YYYY/MM/DD format.
        dry_run: If True, find available times but don't actually book.
    """
    print(f"\n{'='*50}")
    print(f"  BRS Golf Booking Bot - {config.club_name}")
    print(f"  Target date: {target_date}")
    print(f"  Preferred times: {', '.join(config.tee_time_preferences)}")
    print(f"  Holes: {config.holes}")
    print(f"{'='*50}\n")

    # Step 1: Authenticate
    print("[1/4] Logging in...")
    auth = BRSAuth(config.club_name, config.username, config.password)
    session = auth.login()
    print("  Login successful.\n")

    # Step 2: Scrape tee sheet
    print("[2/4] Checking tee sheet for available times...")
    tee_sheet = TeeSheet(config.club_name, session)
    available_hrefs = tee_sheet.find_available_times(
        target_date, config.tee_time_preferences
    )

    if not available_hrefs:
        print("  No available tee times found matching your preferences.")
        print("  Try different times or check back later.")
        return False

    print(f"  Found {len(available_hrefs)} available slot(s):\n")
    for href in available_hrefs:
        parts = href.split("/")
        print(f"    - {parts[-1]} on {parts[-2]}")

    if dry_run:
        print("\n  [DRY RUN] Skipping actual booking.")
        return True

    # Step 3: Get booking tokens
    print("\n[3/4] Fetching booking tokens...")
    tokens = tee_sheet.get_booking_tokens(available_hrefs)

    if not tokens:
        print("  Failed to obtain booking tokens.")
        return False

    print(f"  Obtained {len(tokens)} token(s).\n")

    # Step 4: Book
    print("[4/4] Booking tee time...")
    booker = TeeTimeBooker(config.club_name, session, config.holes)
    response = booker.book(
        available_hrefs,
        tokens,
        player_1=config.player_1,
        player_2=config.player_2,
        player_3=config.player_3,
        player_4=config.player_4,
    )

    if response:
        print("\n  BOOKING CONFIRMED!")
        print(f"  Check your BRS Golf account to verify the booking.")
        return True
    else:
        print("\n  Booking failed. Check booking.log for details.")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="BRS Golf Tee Time Booking Bot",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--date",
        help="Target booking date in YYYY/MM/DD format",
    )
    parser.add_argument(
        "--wait",
        action="store_true",
        help=(
            "Wait until the booking release time, then auto-book "
            "the newly available date"
        ),
    )
    parser.add_argument(
        "--times",
        help="Override preferred times (comma-separated HH:MM values)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Find available times but don't actually book",
    )
    args = parser.parse_args()

    if not args.date and not args.wait:
        parser.print_help()
        print("\nError: Provide either --date or --wait")
        sys.exit(1)

    config = load_config()

    # Override times if provided via CLI
    if args.times:
        config.tee_time_preferences = [
            t.strip() for t in args.times.split(",")
        ]

    if args.wait:
        # Calculate which date will become available
        target_date = calculate_booking_date(config.booking_window_days)
        print(f"Target date (in {config.booking_window_days} days): {target_date}")
        print(f"Booking release time: {config.booking_release_time}")

        # Log in early so we're ready to go
        print("\nPre-authenticating...")
        auth = BRSAuth(config.club_name, config.username, config.password)
        session = auth.login()
        print("Authenticated. Waiting for release time...\n")

        wait_until_release(config.booking_release_time)

        # After release, go straight to tee sheet + booking (reuse session)
        tee_sheet = TeeSheet(config.club_name, session)
        available_hrefs = tee_sheet.find_available_times(
            target_date, config.tee_time_preferences
        )

        if not available_hrefs:
            print("No available tee times found after release.")
            sys.exit(1)

        if args.dry_run:
            print("Available slots found:")
            for href in available_hrefs:
                parts = href.split("/")
                print(f"  - {parts[-1]} on {parts[-2]}")
            print("[DRY RUN] Skipping booking.")
            sys.exit(0)

        tokens = tee_sheet.get_booking_tokens(available_hrefs)
        booker = TeeTimeBooker(config.club_name, session, config.holes)
        response = booker.book(
            available_hrefs,
            tokens,
            player_1=config.player_1,
            player_2=config.player_2,
            player_3=config.player_3,
            player_4=config.player_4,
        )

        if response:
            print("\nBOOKING CONFIRMED!")
        else:
            print("\nBooking failed. Check booking.log for details.")
            sys.exit(1)

    else:
        # Direct booking for a specific date
        success = run_booking(config, args.date, dry_run=args.dry_run)
        sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
