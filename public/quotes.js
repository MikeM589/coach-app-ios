// 52 quotes — one for each week of the year, never repeating
const quotes = [
  // Week 1–10
  "Hard work beats talent when talent doesn't work hard.",
  "The more you practice, the luckier you get.",
  "A champion is someone who gets up when they can't.",
  "You miss 100% of the shots you don't take.",
  "It's not whether you get knocked down, it's whether you get up.",
  "The only way to prove you're a good sport is to lose.",
  "Success is no accident. It is hard work, perseverance, learning, and sacrifice.",
  "Dream big, work hard, stay focused.",
  "Teamwork makes the dream work.",
  "Be the hardest worker in the room.",
  // Week 11–20
  "Every expert was once a beginner.",
  "Believe in yourself and all that you are.",
  "Play with your heart, not just your feet.",
  "Good players inspire themselves, great players inspire others.",
  "The best teams are made up of players who put the team first.",
  "Don't practice until you get it right. Practice until you can't get it wrong.",
  "Hustle, hit, and never quit.",
  "Small steps every day lead to big results.",
  "Your attitude determines your direction.",
  "Win or learn — never lose.",
  // Week 21–30
  "Champions keep playing until they get it right.",
  "Be brave. Be bold. Be you.",
  "The harder the battle, the sweeter the victory.",
  "Great things never come from comfort zones.",
  "Play like there's no tomorrow.",
  "Together we are stronger.",
  "Mistakes are proof that you are trying.",
  "You don't have to be perfect, just be better than yesterday.",
  "Give everything, expect nothing, and you'll never be disappointed.",
  "When you feel like quitting, remember why you started.",
  // Week 31–40
  "The secret is to believe in your dreams; in your potential that you can be like your star.",
  "It does not matter how slowly you go as long as you do not stop.",
  "The difference between ordinary and extraordinary is that little extra.",
  "Courage doesn't mean you don't get afraid. Courage means you don't let fear stop you.",
  "Work hard in silence, let your success be your noise.",
  "One ball, one team, one goal.",
  "The pitch is your canvas — go paint a masterpiece.",
  "Talent wins games, but teamwork wins championships.",
  "You are braver than you believe, stronger than you seem, and smarter than you think.",
  "Fall seven times, stand up eight.",
  // Week 41–52
  "If it doesn't challenge you, it doesn't change you.",
  "Your only limit is the one you set for yourself.",
  "The best time to plant a tree was 20 years ago. The second best time is now.",
  "Energy and persistence conquer all things.",
  "It always seems impossible until it's done.",
  "A team above all. Above all, a team.",
  "There may be people that have more talent than you, but there's no excuse for anyone to work harder than you.",
  "Push yourself, because no one else is going to do it for you.",
  "Set your goals high, and don't stop until you get there.",
  "The only place where success comes before work is in the dictionary.",
  "Stay hungry, stay humble, stay focused.",
  "Every game is a chance to write a new story."
];

/**
 * Get the ISO week number (1–53) for a given date.
 */
function getWeekNumber(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d - jan1) / (24 * 60 * 60 * 1000));
  return Math.ceil((days + jan1.getDay() + 1) / 7);
}

/**
 * Get the quote for a specific week. Uses the week number (1-based)
 * mod 52 so each week of the year gets a unique quote.
 */
function getQuoteForWeek(weekStartDate) {
  const weekNum = getWeekNumber(weekStartDate);
  const index = (weekNum - 1) % 52;
  return quotes[index];
}

// Keep the random version available as a fallback
function getRandomQuote() {
  return quotes[Math.floor(Math.random() * quotes.length)];
}

module.exports = { quotes, getQuoteForWeek, getRandomQuote };
