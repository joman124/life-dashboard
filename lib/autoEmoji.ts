// lib/autoEmoji.ts — deterministic keyword → emoji assignment for metric names.
//
// Used by the Track tab's "Add your own" form for the live emoji preview and
// for the stored emoji when the user does not override it.

// Ordered priority list — first match wins. Multi-word keys ("deep work") are
// listed before anything that could shadow their parts, per the spec.
// Matching is case-insensitive and looks anywhere inside the trimmed name,
// so partial stems ("writ", "meditat") cover write/writing, meditate/meditation.
const RULES = [
  [['deep work', 'focus'], '🧠'],
  [['meditat'], '🧘'],
  [['run'], '🏃'],
  [['walk', 'step'], '👟'],
  [['gym'], '🏋️'],
  [['read'], '📚'],
  [['writ'], '✍️'],
  [['water'], '💧'],
  [['sleep'], '😴'],
  // Before 'phone': "screen time" is its own metric, and 📱 reads as time spent
  // where 📵 reads as pickups avoided.
  [['screen'], '📱'],
  [['phone'], '📵'],
  [['pray', 'gratitude'], '🙏'],
  [['cold'], '🧊'],
  [['stretch', 'yoga'], '🤸'],
  [['meal'], '🍽️'],
  [['sun', 'outside'], '☀️'],
  [['family'], '❤️'],
  [['money'], '💰'],
  [['learn'], '🎓'],
  [['music'], '🎵'],
  [['code'], '⚙️'],
  [['sales', 'call'], '📞'],
  [['energy'], '⚡'],
  [['dog'], '🐕'],
  [['alpaca'], '🦙'],
] as const;

// Deterministic fallback rotation when no keyword matches: the same name
// always yields the same emoji.
const FALLBACK = ['🎯', '✨', '📈', '🌱', '🧩', '🔆'] as const;

export function autoEmoji(name: string): string {
  const lower = name.trim().toLowerCase();
  for (const [keywords, emoji] of RULES) {
    if (keywords.some((k) => lower.includes(k))) return emoji;
  }
  let sum = 0;
  for (let i = 0; i < lower.length; i++) sum += lower.charCodeAt(i);
  return FALLBACK[sum % FALLBACK.length] ?? '🎯';
}
