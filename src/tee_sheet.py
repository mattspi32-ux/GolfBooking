"""Tee sheet scraping and parsing module.

Uses Selenium to render the JavaScript-driven tee sheet page, then parses
the HTML to find available tee times and their booking URLs.
"""

import logging
from typing import List, Tuple

from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By
import requests

logger = logging.getLogger(__name__)


class TeeSheet:
    """Scrapes and parses the BRS Golf tee sheet for available slots."""

    def __init__(self, club_name: str, session: requests.Session):
        self.club_name = club_name
        self.session = session

    def _build_tee_sheet_url(self, date: str) -> str:
        """Build tee sheet URL for a given date.

        Args:
            date: Date string in YYYY/MM/DD format.
        """
        return f"https://members.brsgolf.com/{self.club_name}/tee-sheet/1/{date}"

    def _get_dynamic_html(self, date: str) -> str:
        """Use Selenium to render the tee sheet page with JavaScript.

        The tee sheet contains dynamically generated booking links that are
        only available after JavaScript execution. A standard requests.get()
        cannot access these.

        Args:
            date: Date string in YYYY/MM/DD format.

        Returns:
            Fully rendered HTML page source.
        """
        url = self._build_tee_sheet_url(date)
        logger.info("Loading tee sheet via Selenium: %s", url)

        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--window-size=1920,1080")

        driver = webdriver.Chrome(options=chrome_options)

        try:
            # Initial load to align cookie domains
            driver.get(url)
            driver.delete_all_cookies()

            # Transfer session cookies from requests to Selenium
            for cookie in self.session.cookies:
                cookie_dict = {
                    "name": cookie.name,
                    "value": cookie.value,
                    "path": cookie.path,
                    "domain": cookie.domain,
                    "secure": cookie.secure,
                }
                if cookie.expires is not None:
                    cookie_dict["expiry"] = cookie.expires
                driver.add_cookie(cookie_dict)

            # Reload with authenticated cookies
            driver.get(url)

            # Wait for tee sheet table to load
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located(
                    (By.CSS_SELECTOR, "tr.bg-white")
                )
            )

            page_source = driver.page_source
            logger.info("Tee sheet page loaded successfully")
            return page_source

        finally:
            driver.quit()

    def find_available_times(
        self, date: str, preferred_times: List[str]
    ) -> List[str]:
        """Find available tee time booking hrefs for the given date.

        Args:
            date: Date string in YYYY/MM/DD format.
            preferred_times: List of preferred times in HH:MM format,
                ordered by priority (first = most preferred).

        Returns:
            List of booking href paths for available tee times,
            ordered by preference.
        """
        dynamic_html = self._get_dynamic_html(date)
        return self._parse_available_times(dynamic_html, preferred_times)

    def _parse_available_times(
        self, html: str, preferred_times: List[str]
    ) -> List[str]:
        """Parse rendered HTML to extract available tee time hrefs.

        A tee time is considered available if no players have booked it yet
        (i.e., the row does not contain 'Holes' text indicating an existing
        booking).

        Args:
            html: Fully rendered HTML page source.
            preferred_times: List of preferred times in HH:MM format.

        Returns:
            List of booking href paths for available matching tee times.
        """
        soup = BeautifulSoup(html, "html.parser")
        rows = soup.find_all("tr", class_="bg-white even:bg-grey-faded")

        available_hrefs = []

        for time in preferred_times:
            for row in rows:
                if time not in row.text:
                    continue

                # Check if any slots are already booked
                is_booked = any(
                    "Holes" in div.text for div in row.find_all("div")
                )

                if not is_booked:
                    anchor = row.find("a")
                    if anchor and "href" in anchor.attrs:
                        href = anchor["href"]
                        available_hrefs.append(href)
                        logger.info(
                            "Found available tee time: %s -> %s", time, href
                        )

        if not available_hrefs:
            logger.warning(
                "No available tee times found for preferred times: %s",
                preferred_times,
            )

        return available_hrefs

    def get_booking_tokens(
        self, hrefs: List[str]
    ) -> List[Tuple[str, str]]:
        """Fetch booking form tokens for each available tee time slot.

        Each booking slot page contains two hidden tokens required for the
        booking POST request.

        Args:
            hrefs: List of booking href paths.

        Returns:
            List of (token, _token) tuples for each href.
        """
        tokens = []

        for href in hrefs:
            url = f"https://members.brsgolf.com{href}"
            logger.info("Fetching booking tokens from %s", url)

            try:
                response = self.session.get(url)
                response.raise_for_status()

                soup = BeautifulSoup(response.content, "html.parser")

                token_input = soup.find(
                    "input", {"name": "member_booking_form[token]"}
                )
                csrf_input = soup.find(
                    "input", {"name": "member_booking_form[_token]"}
                )

                if token_input and csrf_input:
                    token_pair = (token_input["value"], csrf_input["value"])
                    tokens.append(token_pair)
                    logger.debug("Tokens obtained for %s", href)
                else:
                    logger.warning(
                        "Could not find booking tokens at %s", url
                    )

            except requests.exceptions.RequestException as e:
                logger.error("Failed to fetch tokens from %s: %s", url, e)

        return tokens
