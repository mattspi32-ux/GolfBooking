"""Booking module for BRS Golf tee times.

Handles the actual POST request to book a tee time after authentication
and tee sheet parsing have been completed.
"""

import logging
from typing import List, Optional, Tuple

import requests

logger = logging.getLogger(__name__)


class TeeTimeBooker:
    """Books tee times on the BRS Golf system."""

    def __init__(
        self,
        club_name: str,
        session: requests.Session,
        holes: str = "18",
    ):
        self.club_name = club_name
        self.session = session
        self.holes = holes

    def book(
        self,
        hrefs: List[str],
        tokens: List[Tuple[str, str]],
        player_1: str,
        player_2: str = "",
        player_3: str = "",
        player_4: str = "",
    ) -> Optional[requests.Response]:
        """Attempt to book a tee time, trying each available slot in order.

        Iterates through available tee times (ordered by preference) and
        attempts to book each one until successful.

        Args:
            hrefs: List of booking href paths (ordered by preference).
            tokens: List of (token, _token) tuples matching the hrefs.
            player_1: BRS player ID for the booker (required).
            player_2: BRS player ID for second player (optional).
            player_3: BRS player ID for third player (optional).
            player_4: BRS player ID for fourth player (optional).

        Returns:
            The successful response, or None if all attempts failed.
        """
        if not hrefs:
            logger.error("No available tee times to book")
            return None

        if len(tokens) < len(hrefs):
            logger.warning(
                "Fewer tokens (%d) than hrefs (%d). "
                "Some slots may not be bookable.",
                len(tokens),
                len(hrefs),
            )

        for i, href in enumerate(hrefs):
            if i >= len(tokens):
                logger.warning("No token available for slot %s", href)
                break

            # Extract date and time from href
            # href format: /{club}/tee-sheet/book/1/{date}/{time}
            parts = href.split("/")
            time_slot = parts[-1]
            date = parts[-2]

            url = (
                f"https://members.brsgolf.com/{self.club_name}"
                f"/bookings/store/1/{date}/{time_slot}"
            )

            payload = {
                "member_booking_form[token]": tokens[i][0],
                "member_booking_form[holes]": self.holes,
                "member_booking_form[player_1]": player_1,
                "member_booking_form[player_2]": player_2,
                "member_booking_form[guest-rate-2]": "",
                "member_booking_form[player_3]": player_3,
                "member_booking_form[guest-rate-3]": "",
                "member_booking_form[player_4]": player_4,
                "member_booking_form[guest-rate-4]": "",
                "member_booking_form[vendor-tx-code]": "",
                "member_booking_form[_token]": tokens[i][1],
            }

            logger.info(
                "Attempting to book tee time: %s on %s (attempt %d/%d)",
                time_slot,
                date,
                i + 1,
                len(hrefs),
            )

            try:
                response = self.session.post(url, data=payload, files=[])
                response.raise_for_status()

                if response.status_code == 200:
                    logger.info(
                        "Booking successful! Tee time: %s on %s",
                        time_slot,
                        date,
                    )
                    return response

            except requests.exceptions.RequestException as e:
                logger.error(
                    "Booking attempt failed for %s on %s: %s",
                    time_slot,
                    date,
                    e,
                )

        logger.error("All booking attempts failed")
        return None
