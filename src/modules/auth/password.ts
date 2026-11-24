// Password rules, in plain words. The same rules are set on the server (min 8, a letter and a number).

export interface Rule {
  id: "length" | "letter" | "number" | "easy";
  label: string;
  ok: boolean;
}

export const MIN_LENGTH = 8;

const COMMON = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890", "qwerty123", "iloveyou", "11111111", "00000000",
  "abc12345", "welcome1", "welcome123", "admin123", "india123", "chennai123", "tamilnadu", "nammoor123", "123123123", "987654321", "passw0rd", "letmein1", "p@ssw0rd",
]);

export function passwordRules(pw: string, email = ""): Rule[] {
  const lower = pw.toLowerCase();
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  const easy = COMMON.has(lower) || /^(.)\1+$/.test(pw) || (local.length >= 4 && lower.includes(local));
  return [
    { id: "length", label: `At least ${MIN_LENGTH} characters`, ok: pw.length >= MIN_LENGTH },
    { id: "letter", label: "At least one letter", ok: /\p{L}/u.test(pw) },
    { id: "number", label: "At least one number", ok: /\d/.test(pw) },
    { id: "easy", label: "Not an easy one like 12345678 or your email name", ok: pw.length > 0 && !easy },
  ];
}

export const isStrong = (pw: string, email = "") => passwordRules(pw, email).every((r) => r.ok);

/** What to tell someone who tapped Save with a weak password: the first thing to fix. */
export function firstProblem(pw: string, email = ""): string | null {
  const bad = passwordRules(pw, email).find((r) => !r.ok);
  return bad ? bad.label : null;
}
