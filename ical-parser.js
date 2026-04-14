const ical = require('node-ical');

/**
 * Fetch and parse an iCal URL, returning events for a given week.
 * @param {string} url - The iCal calendar URL
 * @param {string} weekStartStr - ISO date string for the Sunday of the week (YYYY-MM-DD)
 * @returns {Promise<Object>} - Schedule object keyed by day name
 */
async function getWeekSchedule(url, weekStartStr) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Initialize schedule with all days as empty arrays
  const schedule = {};
  days.forEach(day => {
    schedule[day] = [];
  });

  if (!url || url.trim() === '') {
    return schedule;
  }

  const weekStart = new Date(weekStartStr + 'T00:00:00');
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  try {
    const data = await ical.async.fromURL(url);

    for (const key in data) {
      const event = data[key];
      if (event.type !== 'VEVENT') continue;

      // Handle recurring events and single events
      const eventDates = [];

      if (event.rrule) {
        // Get occurrences within the week range
        const occurrences = event.rrule.between(
          new Date(weekStart.getTime() - 24 * 60 * 60 * 1000),
          new Date(weekEnd.getTime() + 24 * 60 * 60 * 1000),
          true
        );
        occurrences.forEach(date => {
          // Preserve the original time from the event
          const d = new Date(date);
          if (event.start) {
            d.setHours(event.start.getHours(), event.start.getMinutes(), 0, 0);
          }
          eventDates.push(d);
        });
      } else if (event.start) {
        eventDates.push(new Date(event.start));
      }

      for (const eventDate of eventDates) {
        // Check if event falls within the week
        if (eventDate >= weekStart && eventDate <= weekEnd) {
          // Determine day of week (Sunday=0 ... Saturday=6)
          const dayIndex = eventDate.getDay();
          const dayName = days[dayIndex];
          const rawSummary = event.summary || '';
          const summary = rawSummary.toLowerCase();

          // Determine event type from summary
          let type = rawSummary || 'Training';

          // Check for game indicators: "vs", "v.", or "@" used as opponent separator
          // Pattern: "Team - Team @ Opponent" or "Something vs Something"
          const hasAtOpponent = / @/i.test(rawSummary);
          const hasVs = /\bvs\.?\s/i.test(rawSummary) || /\bv\.\s/i.test(rawSummary);

          if (summary.includes('game') || summary.includes('match') || summary.includes('fixture') || summary.includes('friendly') || hasVs || hasAtOpponent) {
            // Try to extract opponent name
            let opponent = '';
            let isAway = false;
            if (hasAtOpponent) {
              // "@" means away game: "2015B - MM - White @ HV Ur"
              const atParts = rawSummary.split('@');
              opponent = (atParts[atParts.length - 1] || '').trim();
              isAway = true;
            } else if (hasVs) {
              // "vs" means home game: "Team vs Opponent"
              const vsParts = rawSummary.split(/\bvs\.?\s|\bv\.\s/i);
              opponent = (vsParts[vsParts.length - 1] || '').trim();
            }
            if (opponent) {
              type = isAway ? `Game @ ${opponent}` : `Game vs ${opponent}`;
            } else {
              type = 'Game';
            }
          } else if (summary.includes('training') || summary.includes('practice') || summary.includes('session') || summary.includes('drill')) {
            type = 'Training';
          } else if (summary.includes('scrimmage')) {
            type = 'Scrimmage';
          } else if (summary.includes('tournament') || summary.includes('tourney') || summary.includes('cup')) {
            type = 'Tournament';
          } else if (summary.includes('meeting')) {
            type = 'Meeting';
          } else if (summary.includes('party')) {
            type = 'Party';
          }
          // Otherwise keep the original summary text as the type

          // Format start time
          const hours = eventDate.getHours();
          const minutes = eventDate.getMinutes();
          const ampm = hours >= 12 ? 'PM' : 'AM';
          const h = hours % 12 || 12;
          const m = minutes.toString().padStart(2, '0');
          const time = `${h}:${m} ${ampm}`;

          // Format end time (applying event duration to this occurrence's start)
          let endTime = '';
          if (event.end && event.start) {
            const durationMs = event.end.getTime() - event.start.getTime();
            const endDate = new Date(eventDate.getTime() + durationMs);
            const eh = endDate.getHours();
            const em = endDate.getMinutes();
            const eampm = eh >= 12 ? 'PM' : 'AM';
            const eh12 = eh % 12 || 12;
            const emm = em.toString().padStart(2, '0');
            endTime = `${eh12}:${emm} ${eampm}`;
          }

          // Get location — strip street address, keep venue name only
          let location = event.location || 'TBD';

          // Split on comma, newline, tab, or 2+ spaces
          const locParts = location.split(/,|\n|\t|\s{2,}/).map(s => s.trim()).filter(Boolean);

          if (locParts.length > 1) {
            // Find the first part that looks like a street address (starts with digits)
            const addressIdx = locParts.findIndex(p => /^\d+\s/.test(p));
            if (addressIdx > 0) {
              // Keep everything before the address
              location = locParts.slice(0, addressIdx).join(' ');
            } else if (addressIdx === 0) {
              // First part IS the address — try the second part as the name
              // or just drop the address portion
              location = locParts.length > 1 ? locParts[1] : locParts[0];
            } else {
              // No obvious address found, just use the first part
              location = locParts[0];
            }
          }

          // Title Case the location
          location = location
            .toLowerCase()
            .replace(/(?:^|\s)\S/g, c => c.toUpperCase());

          schedule[dayName].push({ type, time, endTime, location });
        }
      }
    }
  } catch (err) {
    console.error('Error fetching/parsing iCal:', err.message);
    // Return schedule with all "Off" days — caller can detect this
    throw new Error('Failed to fetch calendar: ' + err.message);
  }

  return schedule;
}

module.exports = { getWeekSchedule };
