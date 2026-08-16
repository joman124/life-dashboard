/**
 * lib/health/lenientJson.ts — PURE tolerant JSON parsing for health payloads.
 *
 * Health payloads are typed on a phone keyboard and pasted between apps, and
 * that route damages JSON in ways that are invisible on screen:
 *
 *   - iOS **Smart Punctuation** rewrites " as “ ” and ' as ‘ ’ the moment you
 *     type them, in Shortcuts' Text action and in Safari alike. JSON accepts
 *     only straight quotes.
 *   - Copying from rendered text (a web page, a chat message, a PDF) brings the
 *     same curly quotes along.
 *   - A **non-breaking space** (U+00A0) looks identical to a space but is not
 *     one of the four characters JSON allows as whitespace.
 *   - Pasting from a code block can carry the ``` fence with it.
 *   - A trailing comma before } survives from hand-editing.
 *
 * Every one of these produces "that isn't valid JSON" and no clue which
 * character is at fault — the user re-types the same thing and gets the same
 * error, because the problem is a character they cannot see.
 *
 * The contract here is deliberate: **a strict parse is always tried first**, so
 * well-formed input is returned exactly as-is and can never be altered by a
 * repair. Repairs run only on the failure path, and every repair applied is
 * reported back, so the response can tell the user what was wrong at the source
 * rather than silently accepting a broken Shortcut forever.
 */

export interface LenientParseOk {
  ok: true;
  value: unknown;
  /** Human-readable repairs applied, empty when the input was already valid. */
  repairs: string[];
}

export interface LenientParseErr {
  ok: false;
  /** A message naming the problem, including the offending text when locatable. */
  error: string;
}

export type LenientParse = LenientParseOk | LenientParseErr;

/* --------------------------------------------------------------- repairs */

// Written as explicit escapes, not literal characters: these are invisible or
// near-identical to ASCII on screen, so a literal here would be unreviewable,
// and one bad copy-paste in this file would silently break the repair.

/** Curly/smart quotes -> straight. The single most common cause by far. */
const SMART_DOUBLE_SRC = '[\\u201C\\u201D\\u201E\\u201F\\u2033\\u2036]';
const SMART_SINGLE_SRC = '[\\u2018\\u2019\\u201A\\u201B\\u2032\\u2035]';

/**
 * Unicode spaces JSON does not accept as whitespace. U+00A0 (non-breaking) and
 * U+202F (narrow no-break) are the ones phones actually emit; the rest are here
 * because they cost nothing and are equally invisible.
 */
const EXOTIC_SPACE_SRC = '[\\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u3000\\uFEFF]';

// Global forms for replacing, non-global for testing. Mixing the two roles on a
// single /g regex makes .test() stateful, and therefore intermittently wrong.
const SMART_DOUBLE = new RegExp(SMART_DOUBLE_SRC, 'g');
const SMART_SINGLE = new RegExp(SMART_SINGLE_SRC, 'g');
const EXOTIC_SPACE = new RegExp(EXOTIC_SPACE_SRC, 'g');
const IS_SMART_DOUBLE = new RegExp(SMART_DOUBLE_SRC);
const IS_SMART_SINGLE = new RegExp(SMART_SINGLE_SRC);
const IS_EXOTIC_SPACE = new RegExp(EXOTIC_SPACE_SRC);

/** ```json … ``` or ``` … ``` wrappers picked up when copying a code block. */
const CODE_FENCE = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i;

/** A comma immediately before a closing brace or bracket. */
const TRAILING_COMMA = /,(\s*[}\]])/g;

/**
 * Extract the character offset from a JSON.parse error message, across the
 * different phrasings V8 has used. Returns null when it can't be found.
 */
function errorPosition(message: string): number | null {
  const m = /at position (\d+)/.exec(message);
  return m ? Number(m[1]) : null;
}

/** A short window of the input around `pos`, for pointing at the bad character. */
function excerpt(raw: string, pos: number): string {
  const start = Math.max(0, pos - 12);
  const end = Math.min(raw.length, pos + 12);
  const snippet = raw.slice(start, end).replace(/\s+/g, ' ');
  return `${start > 0 ? '…' : ''}${snippet}${end < raw.length ? '…' : ''}`;
}

/**
 * Name the invisible character at a position, when it is one of the usual
 * suspects. A user cannot act on "unexpected token" when the token is a
 * character that renders identically to the one they meant to type.
 */
function nameCharacter(ch: string | undefined): string | null {
  if (ch === undefined) return null;
  const code = ch.codePointAt(0);
  if (code === undefined) return null;
  if (IS_SMART_DOUBLE.test(ch)) return `a curly double quote (${ch})`;
  if (IS_SMART_SINGLE.test(ch)) return `a curly single quote (${ch})`;
  if (code === 0x00a0) return 'a non-breaking space';
  if (code === 0x202f) return 'a narrow no-break space';
  if (IS_EXOTIC_SPACE.test(ch)) return 'an invisible Unicode space';
  if (ch === '`') return 'a backtick';
  return null;
}

/* ----------------------------------------------------------------- parse */

/**
 * Parse `raw` as JSON, repairing the common phone/paste corruptions if — and
 * only if — a strict parse fails first.
 */
export function parseLenientJson(raw: string): LenientParse {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: false, error: 'Nothing to import — the box is empty.' };
  }

  // 1. Strict first. Valid input is returned untouched, always.
  try {
    return { ok: true, value: JSON.parse(trimmed), repairs: [] };
  } catch {
    /* fall through to repairs */
  }

  // 2. Repair, recording each change so the user can fix the source.
  const repairs: string[] = [];
  let text = trimmed;

  const fenced = CODE_FENCE.exec(text);
  if (fenced) {
    text = fenced[1];
    repairs.push('removed a ``` code fence');
  }

  if (IS_SMART_DOUBLE.test(text)) {
    text = text.replace(SMART_DOUBLE, '"');
    repairs.push('replaced curly double quotes with straight ones');
  }
  if (IS_SMART_SINGLE.test(text)) {
    text = text.replace(SMART_SINGLE, "'");
    repairs.push('replaced curly single quotes with straight ones');
  }
  if (IS_EXOTIC_SPACE.test(text)) {
    text = text.replace(EXOTIC_SPACE, ' ');
    repairs.push('replaced non-breaking spaces with ordinary spaces');
  }

  const withoutTrailingComma = text.replace(TRAILING_COMMA, '$1');
  if (withoutTrailingComma !== text) {
    text = withoutTrailingComma;
    repairs.push('removed a trailing comma');
  }

  // Single-quoted JSON, but only when there is no double quote anywhere — with
  // both present, guessing which is a delimiter and which is an apostrophe is
  // how a repair corrupts data instead of fixing it.
  if (!text.includes('"') && text.includes("'")) {
    text = text.replace(/'/g, '"');
    repairs.push('replaced single quotes with double quotes');
  }

  try {
    return { ok: true, value: JSON.parse(text), repairs };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const pos = errorPosition(message);

    // Point at the original text, not the repaired one — the user is looking at
    // what they pasted, and offsets into an intermediate string mean nothing.
    let detail = '';
    if (pos !== null && pos < trimmed.length) {
      const named = nameCharacter(trimmed[pos]);
      detail =
        ` The problem is around: ${excerpt(trimmed, pos)}` +
        (named ? ` — that looks like ${named}.` : '');
    }
    return {
      ok: false,
      error:
        'That isn’t valid JSON. It should look like {"steps": 9336, "sleep": 7.6} ' +
        'with straight quotes.' +
        detail,
    };
  }
}
