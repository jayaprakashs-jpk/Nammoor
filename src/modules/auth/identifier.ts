// One box for "email or mobile number". Turns what a person typed into something we can send.

export interface Country {
  /** Calling code without the plus. */
  code: string;
  name: string;
  flag: string;
  /** Digits allowed in the national number. */
  min: number;
  max: number;
}

export const COUNTRIES: Country[] = [
  { code: "91", name: "India", flag: "🇮🇳", min: 10, max: 10 },
  { code: "94", name: "Sri Lanka", flag: "🇱🇰", min: 9, max: 9 },
  { code: "60", name: "Malaysia", flag: "🇲🇾", min: 9, max: 10 },
  { code: "65", name: "Singapore", flag: "🇸🇬", min: 8, max: 8 },
  { code: "971", name: "UAE", flag: "🇦🇪", min: 9, max: 9 },
  { code: "966", name: "Saudi Arabia", flag: "🇸🇦", min: 9, max: 9 },
  { code: "974", name: "Qatar", flag: "🇶🇦", min: 8, max: 8 },
  { code: "965", name: "Kuwait", flag: "🇰🇼", min: 8, max: 8 },
  { code: "968", name: "Oman", flag: "🇴🇲", min: 8, max: 8 },
  { code: "1", name: "USA / Canada", flag: "🇺🇸", min: 10, max: 10 },
  { code: "44", name: "UK", flag: "🇬🇧", min: 10, max: 10 },
  { code: "61", name: "Australia", flag: "🇦🇺", min: 9, max: 9 },
  { code: "64", name: "New Zealand", flag: "🇳🇿", min: 8, max: 10 },
  { code: "230", name: "Mauritius", flag: "🇲🇺", min: 7, max: 8 },
  { code: "27", name: "South Africa", flag: "🇿🇦", min: 9, max: 9 },
];

export const DEFAULT_COUNTRY = COUNTRIES[0]; // India

export type Parsed =
  | { kind: "email"; email: string }
  | { kind: "phone"; e164: string; national: string; country: Country }
  | { kind: "empty" }
  | { kind: "invalid"; message: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Does this look like someone is typing a phone number (so we can show the country picker)? */
export const looksLikePhone = (raw: string) => !raw.includes("@") && /^[+\d]/.test(raw.trim());

export function parseIdentifier(raw: string, country: Country = DEFAULT_COUNTRY): Parsed {
  const text = raw.trim();
  if (!text) return { kind: "empty" };

  if (text.includes("@")) {
    const email = text.toLowerCase();
    return EMAIL.test(email) && email.length <= 254 ? { kind: "email", email } : { kind: "invalid", message: "That email does not look right. Check the spelling." };
  }

  // phone: keep digits and one leading +, drop spaces, dashes, brackets
  if (/[^\d\s+\-()]/.test(text)) return { kind: "invalid", message: "Type an email, or a mobile number with digits only." };
  const digits = text.replace(/\D/g, "");
  if (!digits) return { kind: "invalid", message: "Type an email or a mobile number." };

  let c = country;
  let national = digits;
  if (text.startsWith("+") || text.startsWith("00")) {
    // full international number: find which country it belongs to (longest code first)
    const full = text.startsWith("00") ? digits.slice(2) : digits;
    const hit = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length).find((x) => full.startsWith(x.code));
    if (!hit) return { kind: "invalid", message: "We can only send codes to numbers in the countries listed. Use email instead." };
    c = hit;
    national = full.slice(hit.code.length);
  } else if (c.code === "91") {
    // Indians write 98765 43210, 098765 43210 or 91 98765 43210
    if (national.length === 12 && national.startsWith("91")) national = national.slice(2);
    else if (national.length === 11 && national.startsWith("0")) national = national.slice(1);
  } else if (national.startsWith("0")) {
    national = national.slice(1);
  }

  if (national.length < c.min || national.length > c.max) {
    return { kind: "invalid", message: c.min === c.max ? `A ${c.name} mobile number has ${c.min} digits.` : `A ${c.name} mobile number has ${c.min} to ${c.max} digits.` };
  }
  if (c.code === "91" && !/^[6-9]/.test(national)) return { kind: "invalid", message: "An Indian mobile number starts with 6, 7, 8 or 9." };
  return { kind: "phone", e164: `+${c.code}${national}`, national, country: c };
}

/** "+919876543210" -> "+91 98765 43210". For showing back to the person. */
export function prettyPhone(e164: string): string {
  const d = e164.replace(/\D/g, "");
  const c = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length).find((x) => d.startsWith(x.code));
  if (!c) return e164;
  const n = d.slice(c.code.length);
  return c.code === "91" && n.length === 10 ? `+91 ${n.slice(0, 5)} ${n.slice(5)}` : `+${c.code} ${n}`;
}

/** A stable key for limits: the same person typing differently counts once. */
export const identityKey = (p: Parsed): string | null => (p.kind === "email" ? `e:${p.email}` : p.kind === "phone" ? `p:${p.e164}` : null);
