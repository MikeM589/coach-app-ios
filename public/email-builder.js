// email-builder.js — client-side port of the /api/generate-email route from server.js
// Depends on: window.dbService (db-service.js), window.getQuoteForWeek (quotes.js)

async function buildEmailMessages(payload) {
  const {
    team_id,
    team_ids,
    week_start,
    schedule,
    team_focus,
    homework_items,
    personal_note,
    include_quote,
    include_birthdays,
    reminders
  } = payload;

  const team = await window.dbService.getTeam(team_id);
  if (!team) throw new Error('Team not found');

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Build each section as a separate string
  const sections = [];

  // Schedule section
  const weekSunday = new Date(week_start + 'T00:00:00');
  let scheduleLines = [];
  days.forEach((day, i) => {
    const events = schedule[day] || [];
    // Filter out "Off" or empty events
    const activeEvents = events.filter(e => {
      const t = (e.type || '').trim().toLowerCase();
      return t !== 'off' && t !== '';
    });
    if (activeEvents.length === 0) return;

    const dayDate = new Date(weekSunday);
    dayDate.setDate(dayDate.getDate() + i);
    const mm = String(dayDate.getMonth() + 1).padStart(2, '0');
    const dd = String(dayDate.getDate()).padStart(2, '0');

    scheduleLines.push(`${day} (${mm}/${dd}):`);
    activeEvents.forEach(entry => {
      let timePart = '';
      if (entry.time) {
        timePart = team.show_end_time && entry.endTime ? ` ${entry.time} \u2013 ${entry.endTime}` : ` ${entry.time}`;
      }
      scheduleLines.push(`  \u2022 ${entry.type}${timePart}`);
      if (entry.jersey) {
        scheduleLines.push(`     \u2022 ${entry.jersey}`);
      }
      if (entry.location) {
        scheduleLines.push(`     \u2022 ${entry.location}`);
      }
    });
  });
  let scheduleSection = `\u{1F4C5} Weekly Schedule\n`;
  scheduleSection += scheduleLines.length > 0 ? scheduleLines.join('\n') : 'No events scheduled this week.';
  sections.push(scheduleSection);

  // Birthday section — check all selected teams, deduplicate by player name
  // include_birthdays defaults to true when not sent (backward compat)
  if (include_birthdays !== false) {
    const start = new Date(week_start + 'T00:00:00');
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const allTeamIds = (team_ids && team_ids.length > 0) ? team_ids : [team_id];
    const bdayMap = new Map();
    for (const tid of allTeamIds) {
      const bdays = await window.dbService.getUpcomingBirthdays(tid, start, end);
      bdays.forEach(p => {
        if (!bdayMap.has(p.name)) bdayMap.set(p.name, p);
      });
    }
    const birthdayPlayers = Array.from(bdayMap.values()).sort((a, b) => {
      const dateA = a.birthday ? new Date(a.birthday + 'T00:00:00') : null;
      const dateB = b.birthday ? new Date(b.birthday + 'T00:00:00') : null;
      const dayA = dateA ? dateA.getMonth() * 100 + dateA.getDate() : 9999;
      const dayB = dateB ? dateB.getMonth() * 100 + dateB.getDate() : 9999;
      return dayA - dayB;
    });
    if (birthdayPlayers.length > 0) {
      let bdaySection = `\u{1F382} Happy Birthday\n`;
      birthdayPlayers.forEach(p => {
        if (p.birthday) {
          const bday = new Date(p.birthday + 'T00:00:00');
          const mm = String(bday.getMonth() + 1).padStart(2, '0');
          const dd = String(bday.getDate()).padStart(2, '0');
          bdaySection += `${p.name} (${mm}/${dd})\n`;
        } else {
          bdaySection += `${p.name}\n`;
        }
      });
      sections.push(bdaySection.trimEnd());
    }
  } // end include_birthdays

  // Team Focus
  if (team_focus && team_focus.trim()) {
    sections.push(`\u{1F3AF} Team Focus This Week\n${team_focus.trim()}`);
  }

  // Homework
  const activeHomework = (homework_items || []).filter(h => h.trim());
  if (activeHomework.length > 0) {
    let hwSection = `\u{1F4DD} Homework\nTo support your development outside of training:\n`;
    hwSection += activeHomework.map(h => `\u2022 ${h.trim()}`).join('\n');
    sections.push(hwSection);
  }

  // Reminders
  const activeReminders = (reminders || []).filter(r => r.trim());
  if (activeReminders.length > 0) {
    let remSection = `\u{1F6CE}\u{FE0F} Reminders\n`;
    remSection += activeReminders.map(r => `\u2022 ${r}`).join('\n');
    sections.push(remSection);
  }

  // Build sign-off block (quote appears after motto if included)
  let signoffLines = [];
  if (team.salutation) signoffLines.push(team.salutation.replace(/\\n/g, '\n'));
  signoffLines.push(team.coach_name);
  if (team.phone) signoffLines.push(team.phone);
  if (team.email) signoffLines.push(team.email);
  if (team.motto) signoffLines.push(team.motto);
  if (include_quote) {
    const quote = window.getQuoteForWeek(week_start);
    signoffLines.push(`\u{1F4AC} "${quote}"`);
  }
  const signoff = signoffLines.join('\n');

  // Word-wrap a string into chunks no longer than maxLen, breaking at spaces
  function chunkText(text, maxLen) {
    const chunks = [];
    while (text.length > maxLen) {
      let cut = text.lastIndexOf(' ', maxLen);
      if (cut <= 0) cut = maxLen;
      chunks.push(text.slice(0, cut));
      text = text.slice(cut).trimStart();
    }
    if (text) chunks.push(text);
    return chunks;
  }

  const MAX_CHARS = 999;

  // --- Step 1: split body sections into messages ---
  const messages = [];
  let current = '';
  for (const section of sections) {
    const addition = current ? '\n\n' + section : section;
    if (current && current.length + addition.length > MAX_CHARS) {
      messages.push(current);
      current = section;
    } else {
      current += addition;
    }
  }
  // `current` holds the last (possibly incomplete) body message

  // --- Step 2: build the closing block (personal note + signoff) ---
  const noteText = personal_note && personal_note.trim() ? personal_note.trim() : '';
  const closing = noteText ? noteText + '\n\n' + signoff : signoff;

  // --- Step 3: try to attach closing to the last body message ---
  const closingAddition = current ? '\n\n' + closing : closing;
  if (current.length + closingAddition.length <= MAX_CHARS) {
    // Everything fits together — one message
    current += closingAddition;
    messages.push(current);
  } else {
    // Doesn't fit — push body message as-is, then handle closing separately
    if (current) messages.push(current);

    // Split closing into ≤999-char chunks if needed, signoff always on the last
    if (closing.length <= MAX_CHARS) {
      messages.push(closing);
    } else {
      // Chunk the personal note, append signoff to the final chunk
      const noteChunks = chunkText(noteText, MAX_CHARS);
      noteChunks.forEach((chunk, i) => {
        const isLast = i === noteChunks.length - 1;
        const piece = isLast ? chunk + '\n\n' + signoff : chunk;
        if (piece.length <= MAX_CHARS) {
          messages.push(piece);
        } else {
          // Last chunk + signoff still over limit — push them separately
          messages.push(chunk);
          messages.push(signoff);
        }
      });
    }
  }

  return { messages };
}

window.buildEmailMessages = buildEmailMessages;
