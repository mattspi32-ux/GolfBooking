# BRS Golf Tee Time Booking Bot

Auto-books tee times on the BRS Golf system for Newcastle United Golf Club (or any BRS-powered club).

Tee times at popular clubs fill up within minutes of release. This bot authenticates with your BRS account, waits for the exact release time, and books your preferred slot instantly.

## Prerequisites

- Python 3.9+
- Google Chrome (for Selenium tee sheet scraping)
- ChromeDriver (matching your Chrome version)
- A BRS Golf member account

## Setup

1. **Clone the repo:**
   ```bash
   git clone <repo-url>
   cd GolfBooking
   ```

2. **Create a virtual environment and install dependencies:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # Linux/Mac
   # or: venv\Scripts\activate  # Windows
   pip install -r requirements.txt
   ```

3. **Configure your credentials:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your BRS login details:
   - `BRS_USERNAME` - Your BRS membership number / username
   - `BRS_PASSWORD` - Your BRS password
   - `CLUB_NAME` - Your club's BRS identifier (default: `newcastleunited`)
   - `PLAYER_1` - Your BRS player ID (required)
   - `PLAYER_2/3/4` - Playing partners' BRS IDs (optional)
   - `TEE_TIME_PREFERENCES` - Comma-separated preferred times (e.g., `08:00,08:10,08:20`)
   - `BOOKING_WINDOW_DAYS` - How many days ahead bookings open (default: `7`)
   - `BOOKING_RELEASE_TIME` - When bookings are released (default: `07:30:00`)
   - `HOLES` - `18` or `9`

4. **Install ChromeDriver:**
   ```bash
   # Option 1: Via package manager
   sudo apt install chromium-chromedriver  # Debian/Ubuntu

   # Option 2: Via pip
   pip install chromedriver-autoinstaller
   ```

## Usage

### Book immediately for a specific date
```bash
python book.py --date 2026/02/09
```

### Auto-book at release time
Waits until the configured release time, then books the first available preferred slot for the date that just opened:
```bash
python book.py --wait
```

### Override preferred times via CLI
```bash
python book.py --date 2026/02/09 --times 09:00,09:10,09:20,09:30
```

### Dry run (see what's available without booking)
```bash
python book.py --date 2026/02/09 --dry-run
python book.py --wait --dry-run
```

## How It Works

1. **Authenticate** - Collects session cookies from BRS domains, extracts CSRF token, and logs in via POST
2. **Scrape tee sheet** - Uses Selenium (headless Chrome) to render the JavaScript-driven tee sheet and find available slots
3. **Fetch booking tokens** - Each slot has unique hidden tokens required for the booking POST
4. **Book** - Sends the booking POST request with tokens and player IDs, trying each preferred time in order

## Project Structure

```
GolfBooking/
├── book.py              # Main entry point / CLI
├── requirements.txt     # Python dependencies
├── .env.example         # Configuration template
├── .gitignore
└── src/
    ├── __init__.py
    ├── auth.py          # BRS login & session management
    ├── booker.py        # Tee time booking POST logic
    ├── config.py        # Configuration loader
    ├── scheduler.py     # Release time wait logic
    └── tee_sheet.py     # Tee sheet scraping & parsing
```

## Finding Your Player ID

Your BRS player ID is needed for the `PLAYER_1` field. To find it:

1. Log into BRS Golf in your browser
2. Navigate to any booking page
3. Open browser DevTools (F12) > Network tab
4. Start a manual booking and inspect the form data in the POST request
5. Look for `member_booking_form[player_1]` - the value is your player ID

## Troubleshooting

- **Login fails**: Double-check your username/password. Try logging in manually at `https://members.brsgolf.com/{club}/login`
- **No tee times found**: The date may not be open yet, or your preferred times may all be booked
- **Selenium errors**: Ensure Chrome and ChromeDriver versions match. Run `google-chrome --version` and `chromedriver --version`
- **Cloudflare blocking**: BRS uses Cloudflare protection. The bot uses a realistic User-Agent header, but aggressive rate limiting may trigger blocks

## Notes

- This bot is for personal use to book your own legitimate tee times
- Check your club's terms of service regarding automated booking
- Logs are written to `booking.log` for debugging
