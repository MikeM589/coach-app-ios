# Coach's Weekly Email Generator

A simple local web app for youth soccer coaches to generate weekly team emails with schedules, homework, birthday shout-outs, and motivational quotes.

## Setup

1. **Install Node.js** (version 18 or later) from [nodejs.org](https://nodejs.org)

2. **Open Terminal** and navigate to this folder:
   ```
   cd coach-email-app
   ```

3. **Install dependencies:**
   ```
   npm install
   ```

4. **Start the app:**
   ```
   npm start
   ```

5. **Open your browser** to [http://localhost:3000](http://localhost:3000)

## Features

- **Team Management** — Add teams with coach name, iCal calendar URL, and team motto
- **Player Management** — Track players and birthdays per team
- **Weekly Email Generator** — Fill in weekly details and generate a formatted email
- **iCal Integration** — Auto-populate the weekly schedule from a Google Calendar (or any iCal URL)
- **Birthday Detection** — Automatically includes birthday shout-outs for players with birthdays that week
- **Inspirational Quotes** — 35 family-friendly sports quotes randomly selected
- **Copy to Clipboard** — One-click copy of the generated email

## iCal Calendar Setup

To use automatic schedule import:

1. Open your Google Calendar (or other calendar app)
2. Find the calendar's **iCal / .ics URL**
   - In Google Calendar: Settings > your calendar > "Secret address in iCal format"
3. Paste that URL into the team's iCal Calendar URL field
4. The app will fetch events for the selected week when generating emails

Name your calendar events with keywords like "Training", "Practice", "Game", or "Match" so the app categorizes them correctly.

## Data Storage

All data is stored locally in a `coach.db` SQLite file created automatically in this folder. No cloud services or accounts needed.
