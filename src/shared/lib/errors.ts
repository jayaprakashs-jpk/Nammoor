// Turn database errors into short, plain messages people can act on.
/** Sign-in specific messages. Falls back to friendlyError. Never says which half was wrong. */
export function authError(e: unknown): string {
  const code = typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : "";
  const msg = typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  if (code === "invalid_credentials" || /invalid login credentials/i.test(msg)) return "Wrong email or password. Check both and try again.";
  if (code === "otp_expired" || code === "otp_disabled" || /token has expired|otp.*(expired|invalid)|invalid.*(otp|token)/i.test(msg)) return "That code is wrong or has expired. Check it, or ask for a new one.";
  if (code === "email_not_confirmed" || /email not confirmed/i.test(msg)) return "This email is not confirmed yet. Use \"Send me a code\" to confirm it.";
  if (code === "user_already_exists" || /already registered/i.test(msg)) return "An account with this email already exists. Sign in, or use Forgot password.";
  if (code === "same_password" || /different from the old password/i.test(msg)) return "Choose a password you have not used before.";
  if (code === "weak_password" || /password should|weak password/i.test(msg)) return "That password is too easy. Use at least 8 characters with a letter and a number.";
  if (code === "over_sms_send_rate_limit" || code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || /rate limit|too many/i.test(msg)) return "Too many tries. Please wait a few minutes and try again.";
  if (code === "phone_provider_disabled" || /unsupported phone provider/i.test(msg)) return "Mobile number codes are not switched on yet. Please use your email for now.";
  if (code === "sms_send_failed" || /sms|unsupported phone provider|phone.*not (enabled|supported)/i.test(msg)) return "We could not send an SMS right now. Please use your email instead, or try again later.";
  if (code === "phone_exists" || code === "email_exists" || /already (been )?(registered|taken|exists)/i.test(msg)) return "This is already used by another account. Sign in with it instead of adding it here.";
  if (code === "identity_already_exists" || /identity.*already|already linked/i.test(msg)) return "That Google account is already used by another Nammoor account.";
  if (code === "manual_linking_disabled" || /manual linking/i.test(msg)) return "Linking is not switched on yet. Ask the Nammoor admin.";
  if (code === "reauthentication_needed" || /reauthenticat/i.test(msg)) return "For safety, please sign out, sign in again, and then retry.";
  if (code === "session_not_found" || /session.*(missing|not found)|not authenticated/i.test(msg)) return "You are signed out. Please sign in again.";
  return friendlyError(e);
}

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
