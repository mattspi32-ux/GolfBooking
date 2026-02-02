# Golf Booking Bot

Web-based auto-booking tool for BRS Golf tee times, built with Next.js and deployable on Vercel.

## Features

- **Web UI** with step-by-step booking flow (login, configure, view times, book)
- **Club selection** dropdown with option to enter any BRS Golf club identifier
- **Preferred time priority** - tries your most wanted time first, falls back to alternatives
- **Player management** - book for up to 4 players
- **Vercel-ready** - deploys as a serverless Next.js app
- **Python CLI** also included for command-line usage and scheduled bookings

## How It Works

1. **Login** - Enter your BRS Golf credentials and select your club
2. **Configure** - Pick a date, preferred tee times, holes, and player IDs
3. **View** - See all available tee time slots for your chosen date
4. **Book** - One click to book the best available slot matching your preferences

The app authenticates with BRS Golf's members portal, scrapes the tee sheet, and submits the booking - all server-side via API routes.

## Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) and import the repository
3. Deploy - no environment variables needed (credentials are entered in the UI per-session)

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Python CLI (Alternative)

For command-line usage or scheduled auto-booking at release time:

```bash
pip install -r requirements.txt
cp .env.example .env   # fill in your details
python book.py --wait  # waits for release time, then books
python book.py --date 2026/02/09 --dry-run
```

## Project Structure

```
GolfBooking/
├── app/                        # Next.js web app
│   ├── layout.tsx
│   ├── page.tsx                # Main booking UI
│   ├── globals.css
│   └── api/
│       ├── login/route.ts      # Verify BRS credentials
│       ├── tee-times/route.ts  # Fetch available slots
│       └── book/route.ts       # Book a tee time
├── lib/
│   └── brs-client.ts           # BRS Golf API client (TypeScript)
├── src/                        # Python CLI version
│   ├── auth.py
│   ├── booker.py
│   ├── config.py
│   ├── scheduler.py
│   └── tee_sheet.py
├── book.py                     # Python CLI entry point
├── package.json
├── vercel.json                 # Vercel config (60s timeout)
├── tailwind.config.ts
└── tsconfig.json
```

## Finding Your Player ID

1. Log into BRS Golf in your browser
2. Start a manual booking on any tee time
3. Open DevTools (F12) > Network tab
4. Look at the booking form POST data for `member_booking_form[player_1]`
5. The value is your player ID

## Security

- Credentials are sent directly to BRS Golf servers via Vercel API routes
- Nothing is stored - each session is stateless
- All traffic uses HTTPS
