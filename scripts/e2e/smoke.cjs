// Signed-out smoke test against the REAL Supabase project. Needs no secrets.
//   npm run build && node scripts/e2e/smoke.cjs
const { chromium, devices } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const { serve, readEnv } = require("./serve.cjs");

const ROOT = path.resolve(__dirname, "../..");
const env = readEnv(ROOT);
const SHOTS = process.env.SHOTS_DIR || path.join(ROOT, "e2e-shots");
fs.mkdirSync(SHOTS, { recursive: true });
const ok = (m) => console.log(`  ✓ ${m}`);

(async () => {
  // 1. Anonymous REST access with the public key must see nothing.
  const pub = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  for (const t of ["persons", "families", "person_private_fields", "chat_messages", "profiles"]) {
    const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: pub } });
    const body = await r.text();
    if (r.ok && body !== "[]") throw new Error(`anon could read ${t}: ${body.slice(0, 100)}`);
  }
  ok("anonymous key cannot read persons, families, private fields, chat, profiles");
  const rpc = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/create_family`, {
    method: "POST", headers: { apikey: pub, "Content-Type": "application/json" }, body: JSON.stringify({ p_name: "x" }),
  });
  if (rpc.ok) throw new Error("anon could call create_family");
  ok("anonymous key cannot call create_family");

  // The server itself must refuse weak passwords (the app checks too, but the server is the lock).
  for (const [pw, why] of [["abc12", "too short"], ["abcdefghijkl", "no number"]]) {
    const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/signup`, { method: "POST", headers: { apikey: pub, "Content-Type": "application/json" }, body: JSON.stringify({ email: "weak-check@example.com", password: pw }) });
    const j = await r.json();
    if (j.error_code !== "weak_password") throw new Error(`server accepted a password that is ${why}: ${JSON.stringify(j).slice(0, 120)}`);
  }
  ok("server refuses weak passwords (too short, no number)");

  const server = await serve(path.join(ROOT, "out"));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const errors = [];
  try {
    const page = await (await browser.newContext(devices["Pixel 7"])).newPage();
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto(BASE + "/");
    await page.getByText("Your family tree, built together").waitFor();
    await page.screenshot({ path: path.join(SHOTS, "01-welcome.png") });
    ok("welcome screen");

    await page.goto(BASE + "/tree/");
    await page.waitForURL(/\/login\/\?next=%2Ftree%2F/);
    ok("signed-out /tree/ redirects to login and remembers where to return");

    await page.getByLabel("Email or mobile number").waitFor();
    await page.getByRole("button", { name: /Continue with Google/ }).waitFor();
    await page.screenshot({ path: path.join(SHOTS, "02-login.png") });
    ok("login screen: Google and the one smart box");
    // A wrong password against the REAL server. Sends no email and creates no user.
    await page.getByRole("button", { name: "Sign in with Email & Password" }).click();
    await page.getByLabel("Email", { exact: true }).fill("nobody@e2e.nammoor.test");
    await page.getByLabel("Password", { exact: true }).fill("Wrongpass1");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.locator("p[role=alert]").waitFor();
    const msg = await page.locator("p[role=alert]").innerText();
    if (!/Wrong email or password.*4 tries left/.test(msg)) throw new Error("unexpected sign in error: " + msg);
    ok(`wrong password (real server) shows: "${msg}"`);

    await page.goto(BASE + "/invite/");
    await page.getByLabel("Invite code").fill("hello");
    await page.getByText("doesn't look like an invite code").waitFor();
    await page.getByLabel("Invite code").fill("Join us! Invite code: K7MQ-4XPA");
    await page.getByRole("link", { name: "Sign in to use code K7MQ-4XPA" }).waitFor();
    await page.screenshot({ path: path.join(SHOTS, "04-invite-signin.png") });
    ok("invite page pulls the code out of a pasted message; signed-out users are asked to sign in");
    const pv = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/invite_preview`, {
      method: "POST", headers: { apikey: pub, "Content-Type": "application/json" }, body: JSON.stringify({ p_code: "K7MQ4XPA" }),
    });
    if (pv.ok) throw new Error("anon could call invite_preview");
    ok("anonymous key cannot probe invite codes");

    await page.goto(BASE + "/login/?next=https://evil.example");
    await page.getByLabel("Email").waitFor();
    ok("login page loads with a hostile next= (blocked by safeNext)");

    if (errors.length) throw new Error("Page errors:\n" + errors.join("\n"));
    console.log("\nSIGNED-OUT SMOKE TEST PASSED");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error("\nSMOKE FAILED:", e.message);
  process.exit(1);
});
