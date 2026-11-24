// End-to-end test of the Phase 1 screens against a REAL Supabase project.
//   SUPABASE_SECRET_KEY=... node scripts/e2e/phase1.cjs
// Serves ./out (run `npm run build` first), drives a phone-sized Chromium,
// creates throwaway users (no emails are sent), then deletes everything it made.
const { chromium, devices } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ROOT = path.resolve(__dirname, "../..");
const { serve, readEnv } = require("./serve.cjs");
const env = readEnv(ROOT);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const SHOTS = process.env.SHOTS_DIR || path.join(ROOT, "e2e-shots");
if (!SECRET) throw new Error("Set SUPABASE_SECRET_KEY (service_role). Never commit it.");
fs.mkdirSync(SHOTS, { recursive: true });

const run = Date.now().toString(36);
const ALICE = `alice-${run}@e2e.nammoor.test`;
const BOB = `bob-${run}@e2e.nammoor.test`;
const FAMILY = `E2E Family ${run}`;

const admin = async (method, p, body) => {
  const r = await fetch(`${URL_}/auth/v1${p}`, {
    method,
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
};
const rest = async (p, init = {}) => {
  const r = await fetch(`${URL_}/rest/v1${p}`, {
    ...init,
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (!r.ok) throw new Error(`${p} -> ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
};
const storage = async (method, p, body) => {
  const r = await fetch(`${URL_}/storage/v1${p}`, {
    method,
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`storage ${p} -> ${r.status} ${await r.text()}`);
  return r.json();
};
async function removePhotos(familyId) {
  const folders = await storage("POST", "/object/list/person-photos", { prefix: `${familyId}/`, limit: 1000 });
  for (const f of folders) {
    const files = await storage("POST", "/object/list/person-photos", { prefix: `${familyId}/${f.name}/`, limit: 1000 });
    const paths = files.filter((x) => x.id).map((x) => `${familyId}/${f.name}/${x.name}`);
    if (paths.length) await storage("DELETE", "/object/person-photos", { prefixes: paths });
  }
}
const otpFor = async (email) => {
  const d = await admin("POST", "/admin/generate_link", { type: "magiclink", email });
  return d.email_otp ?? d.properties?.email_otp;
};

// Tiny real PNG (gradient) for the photo upload test.
function png(w = 200, h = 200) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * (w * 3 + 1) + 1 + x * 3;
    raw[i] = 180; raw[i + 1] = (x * 255) / w; raw[i + 2] = (y * 255) / h;
  }
  const crc = (buf) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const b of buf) r = t[(r ^ b) & 0xff] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

let step = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${String(++step).padStart(2, "0")}-${name}.png`) });

async function login(page, email, name) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "I already have a code" }).click();
  await page.getByLabel("Code").fill(await otpFor(email));
  await page.getByRole("button", { name: "Verify" }).click();
  if (name) {
    await page.getByLabel("Your name").fill(name);
    await page.getByRole("button", { name: "Continue" }).click();
  }
}

(async () => {
  const server = await serve(path.join(ROOT, "out"));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const errors = [];
  const browser = await chromium.launch();
  const device = devices["Pixel 7"];
  const users = [];
  try {
    users.push(await admin("POST", "/admin/users", { email: ALICE, email_confirm: true }));
    users.push(await admin("POST", "/admin/users", { email: BOB, email_confirm: true }));

    console.log("Alice");
    const actx = await browser.newContext(device);
    const a = await actx.newPage();
    a.on("pageerror", (e) => errors.push(`alice: ${e.message}`));
    await a.goto(BASE + "/");
    await shot(a, "welcome");
    await a.getByRole("link", { name: "Sign in or start a family" }).click();
    await a.getByLabel("Email").fill(ALICE);
    await shot(a, "login");
    await login(a, ALICE, "Alice");
    await a.getByLabel("Family name").fill(FAMILY);
    await a.getByLabel("Native place (oor)").fill("Thanjavur");
    await a.getByLabel("Your full name").fill("Alice Ramasamy");
    await a.getByLabel("You are").selectOption("female");
    await shot(a, "create-family");
    await a.getByRole("button", { name: "Create family tree" }).click();
    await a.getByText("Your tree has just you").waitFor();
    ok("signed in with code, set name, created family");

    await a.getByRole("link", { name: /Open my profile/ }).click();
    await a.getByRole("button", { name: "+ Father · அப்பா" }).click();
    await a.getByLabel("Full name").fill("Ramasamy");
    await a.getByLabel("Date of birth known as").selectOption("year");
    await a.getByLabel("Date of birth", { exact: true }).fill("1950");
    await a.getByRole("button", { name: "Add", exact: true }).click();
    await a.getByRole("link", { name: /Ramasamy/ }).first().waitFor();
    await a.getByRole("button", { name: "+ Mother · அம்மா" }).click();
    await a.getByLabel("Full name").fill("Lakshmi");
    await a.getByRole("button", { name: "Add", exact: true }).click();
    await a.getByRole("link", { name: /Lakshmi/ }).waitFor();
    await a.getByRole("button", { name: "+ Brother" }).click();
    await a.getByLabel("Full name").fill("Bob Kumar");
    await a.getByLabel(/Birth order/).fill("2");
    await a.getByRole("button", { name: "Add", exact: true }).click();
    await a.getByRole("link", { name: /Bob Kumar/ }).waitFor();
    ok("added father (year only DOB), mother, brother via add_relative");
    await shot(a, "profile-relatives");

    await a.getByRole("button", { name: "Edit" }).click();
    await a.getByLabel("Date of birth known as").selectOption("exact");
    await a.getByLabel("Date of birth", { exact: true }).fill("1992-03-15");
    await a.getByLabel("Birth order").fill("1");
    await a.getByLabel("Name in Tamil").fill("ஆலிஸ்");
    await a.getByLabel("Country").selectOption("IN");
    await a.getByLabel("State").selectOption("IN-TN");
    await a.getByLabel("Lives in (city)").fill("Chennai");
    await shot(a, "profile-edit");
    await a.getByRole("button", { name: "Save", exact: true }).click();
    await a.getByText(/34 yrs/).first().waitFor();
    await a.getByText("Chennai, Tamil Nadu").waitFor();
    ok("edited DOB, Tamil name, place; age shows 34 yrs");

    await a.locator('input[type="file"]').setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png() });
    await a.locator('button[aria-label="Change photo"] img').waitFor({ timeout: 20000 });
    ok("photo compressed, uploaded, shown via signed URL");

    await a.getByLabel("Income").fill("900000");
    await a.getByRole("button", { name: "Save private details" }).click();
    await a.getByText("Invite relatives to be able to share with them.").waitFor();
    ok("saved private income");

    await a.getByRole("link", { name: "Back" }).click();
    await a.getByText("Parents' generation").waitFor();
    await shot(a, "tree");
    const parentsGen = await a.locator("section", { hasText: "Parents' generation" }).innerText();
    const myGen = await a.locator("section", { hasText: "Your generation" }).innerText();
    if (!/Ramasamy/.test(parentsGen) || !/Lakshmi/.test(parentsGen)) throw new Error("parents not in parents' generation");
    if (!/Alice Ramasamy/.test(myGen) || !/Bob Kumar/.test(myGen)) throw new Error("siblings not in my generation");
    if (myGen.indexOf("Alice") > myGen.indexOf("Bob Kumar")) throw new Error("birth order sort wrong");
    ok("tree groups by generation, elder first");

    await a.getByRole("link", { name: /Bob Kumar/ }).click();
    await a.getByRole("link", { name: /Invite Bob to manage this profile/ }).click();
    await a.getByRole("button", { name: "Create invite" }).click();
    const code = (await a.locator("code").innerText()).trim();
    if (!/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code)) throw new Error("bad invite code " + code);
    await shot(a, "invite-ready");
    ok("created claim invite for Bob");

    console.log("Bob");
    const bctx = await browser.newContext(device);
    const b = await bctx.newPage();
    b.on("pageerror", (e) => errors.push(`bob: ${e.message}`));
    await b.goto(`${BASE}/invite/?t=${code}`);
    await b.getByRole("link", { name: /Sign in to use code/ }).click();
    await login(b, BOB, "Bob");
    await b.getByText(FAMILY).first().waitFor();
    await b.getByText("You will be added as").waitFor();
    await b.getByRole("button", { name: `Join ${FAMILY}` }).click();
    await b.getByText("Your generation").waitFor();
    const bobRow = await b.locator("li", { hasText: "Bob Kumar" }).innerText();
    if (!/You/.test(bobRow)) throw new Error("Bob did not claim his node");
    ok("Bob signed in, joined, and claimed his node");

    await b.getByRole("link", { name: /Alice Ramasamy/ }).click();
    await b.getByText("Chennai, Tamil Nadu").waitFor();
    if (await b.getByText(/Income|Private/).count()) throw new Error("Bob can see Alice's private section");
    if (await b.getByRole("button", { name: "Edit" }).count()) throw new Error("Bob can edit Alice");
    ok("Bob cannot see Alice's income or edit her");

    await b.getByRole("link", { name: "Back" }).click();
    await b.getByRole("link", { name: /Bob Kumar/ }).click();
    await b.getByLabel("Income").fill("500000");
    await b.getByRole("button", { name: "Save private details" }).click();
    await b.getByRole("button", { name: "Income", pressed: false }).click();
    await b.getByRole("button", { name: "Income", pressed: true }).waitFor();
    await shot(b, "private-share");
    ok("Bob saved income and shared it with Alice only");

    await a.goto(`${BASE}/tree/`);
    await a.getByRole("link", { name: /Bob Kumar/ }).click();
    await a.getByText("Shared with you privately").waitFor();
    await a.getByText(/INR 5,00,000 per year/).waitFor();
    if (await a.getByRole("button", { name: "Save private details" }).count()) throw new Error("Alice sees Bob's private editor");
    ok("Alice sees only what Bob shared");

    if (errors.length) throw new Error("Page errors:\n" + errors.join("\n"));
    console.log("\nALL PHASE 1 E2E CHECKS PASSED");
  } finally {
    await browser.close();
    server.close();
    // Clean up everything this run created.
    try {
      const fams = await rest(`/families?select=id&name=eq.${encodeURIComponent(FAMILY)}`);
      for (const { id } of fams) await removePhotos(id);
      await rest(`/families?name=eq.${encodeURIComponent(FAMILY)}`, { method: "DELETE" });
    } catch (e) {
      console.error("cleanup families", e.message);
    }
    for (const u of users) await admin("DELETE", `/admin/users/${u.id}`).catch((e) => console.error("cleanup user", e.message));
  }
})().catch((e) => {
  console.error("\nE2E FAILED:", e.message);
  process.exit(1);
});
