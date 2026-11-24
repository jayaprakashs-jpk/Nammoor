// Invite codes are 8 characters from a 32 symbol alphabet (no I, no O),
// shown as ABCD-EFGH. People type them, or paste a whole WhatsApp message.

const SYMBOL = "[A-HJ-NP-Z2-9]";
const BARE = new RegExp(`^${SYMBOL}{8}$`, "i");

/** The normal form: 8 upper case characters, or null if there is no code. */
export function extractCode(text: string): string | null {
  // 1. a link: ...?t=ABCD-EFGH
  const link = text.match(/[?&]t=([A-Za-z0-9-]{8,9})/);
  if (link) {
    const c = link[1].replace(/-/g, "");
    if (BARE.test(c)) return c.toUpperCase();
  }
  // 2. the whole box is just the code (any spacing or case)
  const bare = text.replace(/[\s-]/g, "");
  if (BARE.test(bare)) return bare.toUpperCase();
  // 3. a message: only trust the hyphenated form, so words like "RELATIVE" never match
  const m = text.match(new RegExp(`(?<![A-Za-z0-9])(${SYMBOL}{4})-(${SYMBOL}{4})(?![A-Za-z0-9])`, "i"));
  if (m) return (m[1] + m[2]).toUpperCase();
  return null;
}

export const prettyCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

export function shareMessage(familyName: string, code: string, link: string | null, hours: number): string {
  return [
    `Join our family tree "${familyName}" on Nammoor.`,
    `நம்மூர் செயலியில் நம் குடும்ப மரத்தில் சேருங்கள்.`,
    "",
    link ? `Open: ${link}` : null,
    `Invite code: ${prettyCode(code)}`,
    `Valid for ${hours} hours.`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}
