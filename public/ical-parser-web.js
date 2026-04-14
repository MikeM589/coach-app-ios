// public/ical-parser-web.js
// Browser/Capacitor replacement for ical-parser.js (Node.js).
// Uses Capacitor.CapacitorHttp for native HTTP (bypasses CORS) and ical.js for parsing.
// ical.js is loaded as a script tag and exposes the global ICAL object.

async function getWeekSchedule(url, weekStartStr) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const schedule = {};
  days.forEach(day => { schedule[day] = []; });

  if (!url || url.trim() === '') return schedule;

  const weekStart = new Date(weekStartStr + 'T00:00:00');
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  let icalText;
  try {
    const response = await Capacitor.CapacitorHttp.get({ url, headers: {} });
    icalText = response.data;
  } catch (err) {
    throw new Error('Failed to fetch calendar: ' + err.message);
  }

  let jcalData;
  try {
    jcalData = ICAL.parse(icalText);
  } catch (err) {
    throw new Error('Failed to parse calendar: ' + err.message);
  }

  const comp = new ICAL.Component(jcalData);
  const vevents = comp.getAllSubcomponents('vevent');

  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);
    const eventDates = [];

    if (event.isRecurring()) {
      const expand = event.iterator();
      const rangeStart = ICAL.Time.fromJSDate(new Date(weekStart.getTime() - 86400000));
      const rangeEnd = ICAL.Time.fromJSDate(new Date(weekEnd.getTime() + 86400000));
      let next;
      while ((next = expand.next())) {
        if (next.compare(rangeEnd) > 0) break;
        if (next.compare(rangeStart) >= 0) {
          eventDates.push(next.toJSDate());
        }
      }
    } else {
      eventDates.push(event.startDate.toJSDate());
    }

    for (const eventDate of eventDates) {
      if (eventDate < weekStart || eventDate > weekEnd) continue;

      const dayName = days[eventDate.getDay()];
      const rawSummary = event.summary || '';
      const summary = rawSummary.toLowerCase();

      // Determine event type — mirrors ical-parser.js logic exactly
      let type = rawSummary || 'Training';
      const hasAtOpponent = / @/i.test(rawSummary);
      const hasVs = /\bvs\.?\s/i.test(rawSummary) || /\bv\.\s/i.test(rawSummary);

      if (summary.includes('game') || summary.includes('match') || summary.includes('fixture') || summary.includes('friendly') || hasVs || hasAtOpponent) {
        let opponent = '';
        let isAway = false;
        if (hasAtOpponent) {
          const atParts = rawSummary.split('@');
          opponent = (atParts[atParts.length - 1] || '').trim();
          isAway = true;
        } else if (hasVs) {
          const vsParts = rawSummary.split(/\bvs\.?\s|\bv\.\s/i);
          opponent = (vsParts[vsParts.length - 1] || '').trim();
        }
        type = opponent ? (isAway ? `Game @ ${opponent}` : `Game vs ${opponent}`) : 'Game';
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

      // Format start time
      const hours = eventDate.getHours();
      const minutes = eventDate.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const h = hours % 12 || 12;
      const m = minutes.toString().padStart(2, '0');
      const time = `${h}:${m} ${ampm}`;

      // Format end time (duration from original event applied to this occurrence)
      let endTime = '';
      if (event.endDate && event.startDate) {
        const startMs = event.startDate.toJSDate().getTime();
        const endMs = event.endDate.toJSDate().getTime();
        const durationMs = endMs - startMs;
        const endDate = new Date(eventDate.getTime() + durationMs);
        const eh = endDate.getHours();
        const em = endDate.getMinutes();
        const eampm = eh >= 12 ? 'PM' : 'AM';
        const eh12 = eh % 12 || 12;
        const emm = em.toString().padStart(2, '0');
        endTime = `${eh12}:${emm} ${eampm}`;
      }

      // Clean location — mirrors ical-parser.js logic
      let location = event.location || 'TBD';
      const locParts = location.split(/,|\n|\t|\s{2,}/).map(s => s.trim()).filter(Boolean);
      if (locParts.length > 1) {
        const addressIdx = locParts.findIndex(p => /^\d+\s/.test(p));
        if (addressIdx > 0) {
          location = locParts.slice(0, addressIdx).join(' ');
        } else if (addressIdx === 0) {
          location = locParts.length > 1 ? locParts[1] : locParts[0];
        } else {
          location = locParts[0];
        }
      }
      location = location.toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase());

      schedule[dayName].push({ type, time, endTime, location });
    }
  }

  return schedule;
}

window.getWeekSchedule = getWeekSchedule;
