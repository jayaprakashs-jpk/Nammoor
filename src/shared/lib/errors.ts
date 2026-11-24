// Turn database errors into short, plain messages people can act on.
export function friendlyError(e: unknown): string {
  const msg =
    typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  if (/row-level security|permission denied|42501/i.test(msg)) return "You don't have permission to do that.";
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return "No internet. Check your connection and try again.";
  if (/Token has expired|otp.*(expired|invalid)|invalid.*otp/i.test(msg)) return "That code is wrong or expired. Ask for a new one.";
  if (/rate limit|too many/i.test(msg)) return "Too many tries. Wait a few minutes and try again.";
  if (/not authorized/i.test(msg)) return "Email sending is not set up for this address yet.";
  // Our own SQL errors are already written for people. Keep them.
  return msg.replace(/^.*?ERROR:\s*/i, "").slice(0, 200);
}
