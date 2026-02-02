"""BRS Golf authentication module.

Handles session creation, cookie management, and login to the BRS Golf
members portal.
"""

import logging
import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


class BRSAuth:
    """Manages authentication with the BRS Golf booking system."""

    def __init__(self, club_name: str, username: str, password: str):
        self.club_name = club_name
        self.username = username
        self.password = password
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": (
                "text/html,application/xhtml+xml,application/xml;q=0.9,"
                "image/avif,image/webp,image/apng,*/*;q=0.8,"
                "application/signed-exchange;v=b3;q=0.7"
            ),
            "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
        })

    @property
    def club_url(self) -> str:
        return f"https://brsgolf.com/{self.club_name}"

    @property
    def members_url(self) -> str:
        return "https://members.brsgolf.com/"

    @property
    def login_url(self) -> str:
        return f"https://members.brsgolf.com/{self.club_name}/login"

    def _init_session_cookies(self):
        """Hit the BRS domains to collect required session cookies."""
        logger.info("Fetching PHP session cookie from %s", self.club_url)
        self.session.get(self.club_url)

        logger.info("Fetching additional cookies from %s", self.members_url)
        self.session.get(self.members_url)

    def _get_csrf_token(self) -> str:
        """Load the login page and extract the CSRF token."""
        logger.info("Fetching CSRF token from %s", self.login_url)
        response = self.session.get(self.login_url)
        response.raise_for_status()

        soup = BeautifulSoup(response.content, "html.parser")
        token_input = soup.find("input", {"name": "login_form[_token]"})
        if not token_input:
            raise RuntimeError(
                "Could not find CSRF token on login page. "
                "The BRS site structure may have changed."
            )
        token = token_input["value"]
        logger.debug("CSRF token obtained")
        return token

    def login(self) -> requests.Session:
        """Perform full login flow and return the authenticated session.

        1. Collect session cookies from BRS domains
        2. Extract CSRF token from login form
        3. POST credentials to login endpoint
        """
        self._init_session_cookies()
        csrf_token = self._get_csrf_token()

        payload = {
            "login_form[username]": self.username,
            "login_form[password]": self.password,
            "login_form[login]": "",
            "login_form[_token]": csrf_token,
        }

        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Origin": "https://members.brsgolf.com",
            "Referer": self.login_url,
            "Cache-Control": "max-age=0",
        }

        logger.info("Logging in as %s at %s", self.username, self.club_name)
        response = self.session.post(
            self.login_url, headers=headers, data=payload
        )
        response.raise_for_status()

        if response.status_code == 200 and "login" not in response.url:
            logger.info("Login successful")
        else:
            raise RuntimeError(
                "Login failed. Check your username and password. "
                f"Final URL: {response.url}"
            )

        return self.session
