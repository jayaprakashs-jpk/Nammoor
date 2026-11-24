// Invite tokens are 48 hex characters. People paste whole WhatsApp messages
// or links, so pull the code out of whatever they paste.
export function extractCode(text: string): string | null {
  const m = text.match(/(?:^|[^0-9a-f])([0-9a-f]{48})(?![0-9a-f])/i);
  return m ? m[1].toLowerCase() : null;
}

export function shareMessage(familyName: string, code: string, link: string | null, days: number): string {
  return [
    `Join our family tree "${familyName}" on Nammoor.`,
    `நம்மூர் செயலியில் நம் குடும்ப மரத்தில் சேருங்கள்.`,
    "",
    link ? `Open: ${link}` : null,
    `Invite code: ${code}`,
    `Valid for ${days} day${days === 1 ? "" : "s"}.`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}
