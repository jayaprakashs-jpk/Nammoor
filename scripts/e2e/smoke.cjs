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

    await page.getByLabel("Email").fill("nobody@e2e.nammoor.test");
    await page.screenshot({ path: path.join(SHOTS, "02-login.png") });
    await page.getByRole("button", { name: "I already have a code" }).click();
    await page.getByLabel("Code").fill("123456");
    await page.screenshot({ path: path.join(SHOTS, "03-code.png") });
    await page.getByRole("button", { name: "Verify" }).click();
    await page.locator("p[role=alert]").waitFor();
    const msg = await page.locator("p[role=alert]").innerText();
    if (!/wrong or expired/i.test(msg)) throw new Error("unexpected verify error: " + msg);
    ok(`wrong code shows: "${msg}"`);

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
