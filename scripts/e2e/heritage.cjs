// Heritage features end to end, on a phone-sized browser with a pretend Supabase that keeps state:
// voice stories (fake microphone), album + one-tap clean up, AI restore (off / on / limit), polls, recipes,
// PDF poster + story book, duplicate hints + merge requests, and the Android path (simulated bridge).
//   npm run build && NODE_USE_ENV_PROXY=1 node scripts/e2e/heritage.cjs
const { chromium, devices } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");
const { serve, readEnv } = require("./serve.cjs");

const ROOT = path.resolve(__dirname, "../..");
const env = readEnv(ROOT);
const REF = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { throw new Error(m); };
const ME = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: ME, role: "authenticated", exp: 4102444800 })}.sig`;
const user = { id: ME, aud: "authenticated", role: "authenticated", email: "ravi@example.com", phone: "", email_confirmed_at: "2026-01-01T00:00:00Z", identities: [{ provider: "email", id: "e", identity_id: "e", user_id: ME, identity_data: {} }], app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user };

const P = (id, name, g, extra = {}) => ({ id, name, nick: null, g, dob: null, dobp: "unknown", ord: null, alive: true, dod: null, dodp: "unknown", photo: null, uid: null, mgr: null, state: null, np: null, nt: null, ...extra });
const persons = [
  P("p1", "Ravi", "male", { uid: ME, mgr: ME, dob: "1990-05-01", dobp: "exact", np: "Chennai", nt: "ரவி" }),
  P("p2", "Ramasamy Kumar", "male", { dob: "1950-01-01", dobp: "year", np: "Salem", nt: "ராமசாமி குமார்", photo: "fam1/p2/a.webp" }),
  P("p3", "Ramasami Kumar", "male", { dob: "1952-01-01", dobp: "year", np: "Salem" }),
  P("p4", "Lakshmi", "female", { dob: "1955-06-15", dobp: "exact", nt: "லட்சுமி" }),
  P("p5", "Kamala", "female", { dob: "1930-01-01", dobp: "year", alive: false, dod: "1999-03-02", dodp: "exact" }),
];
const graph = { persons, parents: [["p4", "p1", "biological"]], unions: [["p5", "p2", "1948-01-01", null, null, "year"]] };
const histories = { p2: "He farmed near Salem for forty years and never missed a Pongal. ".repeat(6), p5: "Kamala was a teacher." };

const db = { voice_memories: [], person_photos: [], recipes: [], polls: [], poll_options: [], poll_votes: [], person_merge_requests: [],
  chat_messages: [{ id: "m1", room_id: "room-family", sender_id: OTHER, body: "Vanakkam all", created_at: "2026-11-24T07:00:00Z", edited_at: null, deleted_at: null, poll_id: null }],
  chat_room_members: [{ room_id: "room-family", user_id: ME, last_read_at: null, profiles: { display_name: "Ravi" } }, { room_id: "room-family", user_id: OTHER, last_read_at: null, profiles: { display_name: "Divya" } }],
};
const defaults = {
  voice_memories: () => ({ author_id: ME, created_at: new Date().toISOString() }),
  person_photos: () => ({ kind: "photo", source_id: null, created_by: ME, created_at: new Date().toISOString() }),
  recipes: () => ({ created_by: ME, created_at: new Date().toISOString() }),
  person_merge_requests: () => ({ status: "pending", requested_by: ME, created_at: new Date().toISOString(), decided_by: null }),
  chat_messages: () => ({ sender_id: ME, created_at: new Date().toISOString(), edited_at: null, deleted_at: null, poll_id: null }),
};
const log = { uploads: [], removed: [], rpc: [], addRelative: [], fn: [], merges: [] };
const ai = { mode: "off", n: 0 };
let uid = 100;
const newId = () => `00000000-0000-4000-8000-${String(++uid).padStart(12, "0")}`;

// a short, real WAV file so the browser can actually play it
function wav(seconds = 3, rate = 8000) {
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate, 28); buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34); buf.write("data", 36); buf.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) buf[44 + i] = 128 + Math.round(40 * Math.sin((i / rate) * 2 * Math.PI * 440));
  return buf;
}
const WAV = wav();

function matchRow(row, params) {
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
    if (v.startsWith("eq.")) { if (String(row[k]) !== v.slice(3)) return false; }
    else if (v.startsWith("in.(")) { if (!v.slice(4, -1).split(",").map((s) => s.replace(/^"|"$/g, "")).includes(String(row[k]))) return false; }
    else if (v.startsWith("gt.")) { if (!(String(row[k]) > v.slice(3))) return false; }
    else if (v.startsWith("lt.")) { if (!(String(row[k]) < v.slice(3))) return false; }
    else if (v === "is.null") { if (row[k] != null) return false; }
  }
  return true;
}

const personRow = (g) => ({ id: g.id, family_id: "fam1", user_id: g.uid, managed_by: ME, full_name: g.name, initials: null, nickname: null, name_native: g.nt, gender: g.g,
  birth_date: g.dob, birth_precision: g.dobp, birth_time: null, birth_place: null, birth_order: g.ord, is_living: g.alive, death_date: g.dod, death_precision: g.dodp,
  native_place: g.np, current_city: null, state_code: null, country_code: null, photo_path: g.photo, history: histories[g.id] ?? null, created_by: ME, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" });

async function mockSupabase(page) {
  await page.route(/supabase\.co/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
    const H = { "access-control-allow-origin": "*" };
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: H, body: JSON.stringify(body) });
    const none = () => route.fulfill({ status: 204, headers: H });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { ...H, "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    const body = () => { try { return JSON.parse(req.postData() || "null"); } catch { return null; } };

    // ---- auth ----
    if (p.endsWith("/auth/v1/user")) return json(user);
    if (p.endsWith("/auth/v1/logout")) return none();

    // ---- storage ----
    if (p.startsWith("/storage/v1/object/sign/")) {
      const rest = p.slice("/storage/v1/object/sign/".length);
      if (method === "GET") { const bucket = rest.split("/")[0]; return route.fulfill({ status: 200, contentType: bucket === "family-audio" ? "audio/wav" : "image/png", headers: H, body: bucket === "family-audio" ? WAV : PNG }); }
      if (!rest.includes("/")) { const b = body(); return json(b.paths.map((x) => ({ path: x, signedURL: `/object/sign/${rest}/${x}?token=t`, error: null }))); }
      return json({ signedURL: `/object/sign/${rest}?token=t` });
    }
    if (p.startsWith("/storage/v1/object/") && method === "POST") {
      const rest = p.slice("/storage/v1/object/".length);
      const data = req.postDataBuffer() ?? Buffer.alloc(0);
      const ctype = /content-type: ([^\r\n]+)/i.exec(data.toString("latin1").slice(0, 600))?.[1] ?? req.headers()["content-type"];
      log.uploads.push({ bucket: rest.split("/")[0], path: rest.split("/").slice(1).join("/"), type: ctype, size: data.length });
      return json({ Key: rest });
    }
    if (p.startsWith("/storage/v1/object/") && method === "DELETE") { log.removed.push(...(body()?.prefixes ?? [])); return json([]); }
    if (p.startsWith("/storage/")) return json([]);

    // ---- functions ----
    if (p.endsWith("/functions/v1/restore-photo")) {
      const b = body();
      log.fn.push(b);
      if (b.action === "status") return json(ai.mode === "off" ? { available: false } : { available: true, remaining: ai.mode === "limit" ? 1 : 3 });
      if (ai.mode === "limit") return json({ ok: false, reason: "daily_limit", remaining: 0 });
      const src = db.person_photos.find((x) => x.id === b.photo_id);
      const row = { id: newId(), family_id: "fam1", person_id: src.person_id, path: `fam1/${src.person_id}/ai.jpg`, caption: "AI restored", year: null, kind: "ai_restored", source_id: src.id, created_by: ME, created_at: new Date().toISOString() };
      db.person_photos.unshift(row);
      return json({ ok: true, photo_id: row.id, remaining: 2 });
    }

    // ---- rpc ----
    if (p.includes("/rpc/")) {
      const name = p.split("/rpc/")[1];
      const b = body();
      log.rpc.push({ name, ...b });
      if (name === "family_graph") return json(graph);
      if (name === "add_relative") { log.addRelative.push(b); return json(newId()); }
      if (name === "create_poll") {
        const id = newId();
        db.polls.unshift({ id, room_id: b.p_room_id, question: b.p_question, created_by: ME, closes_at: b.p_closes_at ?? null, closed_at: null });
        (b.p_options).forEach((label, i) => db.poll_options.push({ id: newId(), poll_id: id, label, position: i + 1, votes: 0 }));
        db.chat_messages.push({ id: newId(), room_id: b.p_room_id, sender_id: ME, body: "📊 " + b.p_question, created_at: new Date().toISOString(), edited_at: null, deleted_at: null, poll_id: id });
        return json(id);
      }
      if (name === "vote_poll") {
        const prev = db.poll_votes.find((v) => v.poll_id === b.p_poll_id);
        if (prev) { db.poll_options.find((o) => o.id === prev.option_id).votes--; prev.option_id = b.p_option_id; } else db.poll_votes.push({ poll_id: b.p_poll_id, option_id: b.p_option_id, user_id: ME });
        db.poll_options.find((o) => o.id === b.p_option_id).votes++;
        return json(null);
      }
      if (name === "close_poll") { db.polls.find((x) => x.id === b.p_poll_id).closed_at = new Date().toISOString(); return json(null); }
      if (name === "merge_persons") { log.merges.push(b.p_request_id); db.person_merge_requests.find((r) => r.id === b.p_request_id).status = "approved"; return json(newId()); }
      return json(null);
    }

    // ---- tables ----
    const t = p.startsWith("/rest/v1/") ? p.slice("/rest/v1/".length) : null;
    if (t === "family_members") {
      const sel = url.searchParams.get("select") || "";
      if (single) return json({ role: "owner" });
      if (sel.startsWith("user_id")) return json([{ user_id: ME, role: "owner", profiles: { display_name: "Ravi" } }]);
      return json([{ role: "owner", families: { id: "fam1", name: "Pongal Kudumbam", native_place: "Salem" } }]);
    }
    if (t === "profiles") return json(single ? { display_name: "Ravi", relation_style: "tamil" } : [{ display_name: "Ravi", relation_style: "tamil" }]);
    if (t === "families") return json(single ? { name: "Pongal Kudumbam", native_place: "Salem" } : [{ name: "Pongal Kudumbam", native_place: "Salem" }]);
    if (t === "persons") {
      const id = (url.searchParams.get("id") || "").replace("eq.", "");
      if (id) { const g = persons.find((x) => x.id === id); return g ? json(single ? personRow(g) : [personRow(g)]) : json(null, 406); }
      return json(persons.map(personRow));
    }
    if (t === "chat_rooms") return json(single ? { id: "room-family", name: "Pongal Kudumbam", kind: "family" } : [{ id: "room-family", name: "Pongal Kudumbam", kind: "family", last_message_at: null }]);
    if (t && t in db) {
      let rows = db[t].filter((r) => matchRow(r, url.searchParams));
      if (method === "GET") {
        const order = url.searchParams.get("order");
        if (order) { const [col, dir] = order.split("."); rows = rows.slice().sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (dir === "desc" ? -1 : 1)); }
        const lim = Number(url.searchParams.get("limit")); if (lim) rows = rows.slice(0, lim);
        return single ? (rows[0] ? json(rows[0]) : json(null, 406)) : json(rows);
      }
      if (method === "POST") {
        const b = body();
        const made = (Array.isArray(b) ? b : [b]).map((r) => ({ id: newId(), ...(defaults[t]?.() ?? {}), ...r }));
        db[t].push(...made);
        return route.fulfill({ status: 201, contentType: "application/json", headers: H, body: JSON.stringify(single ? made[0] : made) });
      }
      if (method === "PATCH") { rows.forEach((r) => Object.assign(r, body())); return (req.headers()["prefer"] || "").includes("representation") ? json(single ? rows[0] : rows) : none(); }
      if (method === "DELETE") { db[t] = db[t].filter((r) => !rows.includes(r)); return json(rows); }
    }
    return json([]);
  });
}

let PNG;

(async () => {
  const server = await serve(path.join(ROOT, "out"));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  const errors = [];
  const newPhone = async (opts = {}) => {
    const ctx = await browser.newContext({ ...devices["Pixel 7"], permissions: ["microphone"], acceptDownloads: true, ...opts });
    await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, JSON.stringify(v)); localStorage.setItem("nammoor.family", "fam1"); } catch {} }, [`sb-${REF}-auth-token`, session]);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message + " @" + page.url().replace(BASE, "") + " " + String(e.stack).split("\n").slice(1, 3).join(" ")));
    page.on("dialog", (d) => d.accept());
    await mockSupabase(page);
    return { ctx, page };
  };
  try {
    const { ctx, page } = await newPhone();
    // a real PNG to upload and to serve as "photos"
    await page.goto(BASE + "/login/");
    const png64 = await page.evaluate(() => {
      const c = document.createElement("canvas"); c.width = 320; c.height = 220; const x = c.getContext("2d");
      const g = x.createLinearGradient(0, 0, 320, 220); g.addColorStop(0, "#a09080"); g.addColorStop(1, "#c8c0b0"); x.fillStyle = g; x.fillRect(0, 0, 320, 220);
      x.fillStyle = "#706050"; x.fillRect(100, 60, 100, 100);
      return c.toDataURL("image/png").split(",")[1];
    });
    PNG = Buffer.from(png64, "base64");
    const photoFile = { name: "old.png", mimeType: "image/png", buffer: PNG };

    // ================= 1. VOICE STORY ON A PROFILE =================
    await page.goto(BASE + "/person/?id=p1");
    await page.getByRole("heading", { name: "Ravi" }).first().waitFor();
    const profileVoice = page.locator('section[aria-label="Voice stories"]');
    await profileVoice.getByRole("button", { name: /Record a voice story/ }).click();
    await page.getByText(/Recording 0:0\d/).waitFor();
    await page.waitForTimeout(2300);
    await page.getByRole("button", { name: "Stop" }).click();
    await page.getByText(/Listen, then save/).waitFor();
    await page.getByRole("button", { name: "Save story" }).click();
    await page.getByText("Voice story saved ✓").waitFor();
    const memo = db.voice_memories[0];
    if (!memo) fail("no voice memory row saved");
    if (!/^fam1\/p1\/[0-9a-f-]+\.(webm|m4a|ogg)$/.test(memo.audio_path)) fail("audio path is not inside the family folder: " + memo.audio_path);
    if (memo.duration_sec < 1 || memo.duration_sec > 180) fail("bad duration " + memo.duration_sec);
    if (memo.photo_id !== null) fail("profile story should not be tied to a photo");
    const up = log.uploads.find((u) => u.bucket === "family-audio");
    if (!up || !/^audio\/(webm|mp4|ogg)/.test(up.type)) fail("audio upload type: " + JSON.stringify(up));
    ok(`record with a fake microphone, save: file in the family folder (${memo.audio_path.split("/").pop()}), ${memo.duration_sec}s, private bucket`);

    // play / pause bar under the photo
    const play = profileVoice.getByRole("button", { name: "Play voice story" });
    await play.click();
    await profileVoice.getByRole("button", { name: "Pause" }).waitFor();
    await profileVoice.getByText(/0:0[1-9] \/ 0:0\d/).waitFor({ timeout: 4000 });
    await profileVoice.getByRole("button", { name: "Pause" }).click();
    await profileVoice.getByRole("button", { name: "Play voice story" }).waitFor();
    const barAfterPhoto = await page.evaluate(() => {
      const photoBtn = document.querySelector('button[aria-label="Change photo"], button[aria-label="Photo"]');
      const sec = document.querySelector('section[aria-label="Voice stories"]');
      return !!photoBtn && !!sec && !!(photoBtn.compareDocumentPosition(sec) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    if (!barAfterPhoto) fail("the audio bar is not under the profile photo");
    ok("play and pause work, time moves, and the bar sits right under the profile photo");

    await profileVoice.getByRole("button", { name: "Delete" }).click();
    await page.waitForFunction(() => !document.querySelector('button[aria-label="Pause"], button[aria-label="Play voice story"]'));
    if (db.voice_memories.length) fail("memo not deleted");
    if (!log.removed.some((r) => r.includes(memo.audio_path))) fail("audio file not removed from storage");
    ok("delete removes the row and the file");

    // ================= 2. THREE MINUTE LIMIT =================
    const lim = await newPhone();
    await lim.page.clock.install();
    await lim.page.goto(BASE + "/person/?id=p1");
    await lim.page.getByRole("button", { name: /Record a voice story/ }).click();
    await lim.page.getByText(/Recording/).waitFor();
    await new Promise((r) => setTimeout(r, 1500)); // the fake microphone needs a little real audio
    await lim.page.clock.fastForward(181_000);
    // the page's own timers are faked here, so poll from Node with real sleeps
    let reviewed = false;
    for (let i = 0; i < 20 && !reviewed; i++) {
      await new Promise((r) => setTimeout(r, 500));
      reviewed = /Listen, then save \(3:00\)/.test(await lim.page.locator("main").innerText());
    }
    if (!reviewed) fail("the recording did not stop at 3:00. Screen: " + (await lim.page.locator("main").innerText()).slice(0, 300).replace(/\n+/g, " / "));
    ok("a recording that runs to 3 minutes stops itself at 3:00 and goes to review");
    await lim.ctx.close();

    // ================= 3. ALBUM, CLEAN UP, VOICE ON A PHOTO =================
    await page.goto(BASE + "/person/?id=p1");
    await page.getByRole("button", { name: "＋ Add a photo" }).click();
    await page.getByLabel("Choose album photo").setInputFiles(photoFile);
    const addDialog = page.getByRole("dialog", { name: "Add photo" });
    await addDialog.waitFor();
    const sw = addDialog.getByRole("switch");
    await sw.click();
    if ((await sw.getAttribute("aria-checked")) !== "true") fail("clean up did not turn on");
    const srcFixed = await addDialog.locator("img").first().getAttribute("src");
    await sw.click();
    const srcOrig = await addDialog.locator("img").first().getAttribute("src");
    if (srcFixed === srcOrig) fail("clean up changed nothing in the picture");
    await sw.click();
    await addDialog.getByLabel("Caption (optional)").fill("Wedding at Salem");
    await addDialog.getByLabel("Year (optional)").fill("1978");
    await addDialog.getByRole("button", { name: "Save photo" }).click();
    await page.getByText("Photo added ✓").waitFor();
    const photo = db.person_photos[0];
    const pup = log.uploads.find((u) => u.bucket === "family-album");
    if (!photo || photo.caption !== "Wedding at Salem" || photo.year !== 1978) fail("photo row wrong: " + JSON.stringify(photo));
    if (!photo.path.startsWith("fam1/p1/") || !/^image\/(webp|jpeg)/.test(pup.type)) fail("album upload wrong: " + JSON.stringify([photo.path, pup]));
    ok("old photo: one-tap clean up changes the picture, can be undone, and the cleaned copy is saved with caption and year");

    await page.getByRole("button", { name: "Open photo: Wedding at Salem" }).click();
    const viewer = page.getByRole("dialog", { name: "Photo" });
    await viewer.getByRole("button", { name: /Record a voice story/ }).click();
    await page.waitForTimeout(1600);
    await viewer.getByRole("button", { name: "Stop" }).click();
    await viewer.getByLabel("Title (optional)").fill("How we met");
    await viewer.getByRole("button", { name: "Save story" }).click();
    await viewer.getByText("Stories about this photo").waitFor();
    if (db.voice_memories[0]?.photo_id !== photo.id) fail("voice story not tied to the photo");
    const under = await viewer.evaluate((el) => { const img = el.querySelector("img"); const sec = el.querySelector('section[aria-label="Stories about this photo"]'); return !!(img.compareDocumentPosition(sec) & Node.DOCUMENT_POSITION_FOLLOWING); });
    if (!under) fail("photo story bar is not under the photo");
    await viewer.getByRole("button", { name: "Play How we met" }).waitFor();
    ok("voice story linked to one photo, shown right under it with a play button");

    // AI restore: no key -> quiet "Coming soon"
    await viewer.getByText("AI photo restore · Coming soon").waitFor();
    if (await viewer.getByRole("alert").count()) fail("an error shows when AI is not set up");
    ok("AI not set up: shows Coming soon, no error");
    await page.getByRole("button", { name: "Close ✕" }).click();

    ai.mode = "limit";
    await page.getByRole("button", { name: "Open photo: Wedding at Salem" }).click();
    await page.getByRole("button", { name: /Restore with AI/ }).click();
    await page.getByText(/used all 3 AI restores for today/).waitFor();
    ok("AI daily limit reached: a plain message, nothing breaks");
    await page.getByRole("button", { name: "Close ✕" }).click();

    ai.mode = "on";
    await page.getByRole("button", { name: "Open photo: Wedding at Salem" }).click();
    await page.getByRole("button", { name: /Restore with AI/ }).click();
    await page.getByText("Restored photo added ✓").waitFor();
    if (db.person_photos.filter((x) => x.kind === "ai_restored").length !== 1) fail("AI copy not added");
    if (!db.person_photos.some((x) => x.id === photo.id)) fail("original photo was lost");
    ok("AI restore: original kept, restored copy added next to it");
    await page.getByRole("button", { name: "Close ✕" }).click().catch(() => {});

    // ================= 4. POLLS =================
    await page.goto(BASE + "/chat/?family=fam1&room=room-family");
    await page.getByText("Vanakkam all").waitFor();
    await page.getByRole("button", { name: "Make a poll" }).click();
    const form = page.getByRole("form", { name: "New poll" });
    await form.getByLabel("Question").fill("Which day for the temple visit?");
    await form.getByLabel("Choice 1", { exact: true }).fill("Saturday");
    await form.getByLabel("Choice 2", { exact: true }).fill("saturday");
    await form.getByRole("button", { name: "Post poll" }).click();
    await form.getByText("Add at least 2 different choices.").waitFor();
    await form.getByLabel("Choice 2", { exact: true }).fill("Sunday");
    await form.getByRole("button", { name: "+ Add a choice" }).click();
    await form.getByLabel("Choice 3", { exact: true }).fill("Pongal day");
    for (let i = 0; i < 2; i++) await form.getByRole("button", { name: "+ Add a choice" }).click().catch(() => {});
    if ((await form.getByRole("button", { name: "+ Add a choice" }).count()) !== 0) fail("add-choice button still shows at 5 choices");
    await form.getByLabel("Choice 4", { exact: true }).fill("Skip");
    await form.getByLabel("Choice 5", { exact: true }).fill("");
    await form.getByRole("button", { name: "Post poll" }).click();
    const card = page.getByRole("group", { name: "Poll: Which day for the temple visit?" });
    await card.waitFor();
    const sent = log.rpc.find((r) => r.name === "create_poll");
    if (JSON.stringify(sent.p_options) !== JSON.stringify(["Saturday", "Sunday", "Pongal day", "Skip"])) fail("poll choices: " + JSON.stringify(sent.p_options));
    ok("poll form: needs 2 different choices, max 5, blanks dropped; poll card appears in the chat");

    const opt = (name) => card.getByRole("button", { name: new RegExp(name) });
    await opt("Saturday").click();
    await opt("Saturday").getByTestId("poll-count").filter({ hasText: "1 · 100%" }).waitFor();
    await card.getByText("1 vote").waitFor();
    await opt("Sunday").click();
    await opt("Sunday").getByTestId("poll-count").filter({ hasText: "1 · 100%" }).waitFor();
    await opt("Saturday").getByTestId("poll-count").filter({ hasText: "0 · 0%" }).waitFor();
    if (db.poll_votes.length !== 1) fail("one person must have one vote, got " + db.poll_votes.length);
    ok("voting: one vote per person, changing it moves the vote, counts and bars update");

    await card.getByRole("button", { name: "Close poll" }).click();
    await card.getByText(/Closed/).waitFor();
    if (!(await opt("Saturday").isDisabled())) fail("a closed poll still takes votes");
    ok("closing a poll locks the choices");

    // ================= 5. RECIPES =================
    await page.goto(BASE + "/recipes/?family=fam1");
    await page.getByRole("button", { name: "＋ Add a recipe" }).click();
    await page.getByLabel("Dish name (English)").fill("Mutton kuzhambu");
    await page.getByLabel("Dish name (Tamil)").fill("மட்டன் குழம்பு");
    await page.getByLabel("Whose recipe is it?").selectOption({ label: "Kamala" });
    await page.getByLabel("Ingredients").fill("1 kg mutton\n- 2 tsp pepper\n\nsalt");
    await page.getByLabel("Steps").fill("Pressure cook the mutton\nAdd the masala");
    await page.getByLabel("Photo of the dish").setInputFiles(photoFile);
    await page.getByText(/Ready: old.png/).waitFor();
    await page.getByRole("button", { name: "Save recipe" }).click();
    await page.getByText("Recipe saved ✓").waitFor();
    const rec = db.recipes[0];
    if (rec.person_id !== "p5" || !rec.photo_path.startsWith("fam1/recipes/")) fail("recipe wrong: " + JSON.stringify(rec));
    await page.getByRole("heading", { name: "Mutton kuzhambu" }).waitFor();
    if ((await page.locator("ul li").allInnerTexts()).join("|") !== "1 kg mutton|2 tsp pepper|salt") fail("ingredient list wrong");
    await page.getByText("From Kamala").waitFor();
    await page.getByRole("button", { name: /All recipes/ }).click();
    await page.getByLabel("Search recipes").fill("குழம்பு");
    await page.getByRole("button", { name: /Mutton kuzhambu/ }).waitFor();
    await page.getByLabel("Search recipes").fill("payasam");
    await page.getByText(/Nothing matches/).waitFor();
    ok("recipes: English + Tamil name, linked to a family member, photo in the family folder, search finds Tamil words");

    // ================= 6. PDF POSTER + STORY BOOK =================
    await page.goto(BASE + "/print/?family=fam1");
    const preview = page.getByLabel("Poster preview");
    await preview.waitFor();
    const inked = await preview.evaluate((c) => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i] < 200) n++; return n; });
    if (inked < 200) fail("poster preview looks blank");
    const dl1 = page.waitForEvent("download");
    await page.getByRole("button", { name: "Make poster PDF" }).click();
    const d1 = await dl1;
    if (!/^nammoor-tree-.*\.pdf$/.test(d1.suggestedFilename())) fail("poster file name " + d1.suggestedFilename());
    const pdf1 = fs.readFileSync(await d1.path());
    const t1 = pdf1.toString("latin1");
    if (!t1.startsWith("%PDF-1.4") || !t1.trimEnd().endsWith("%%EOF") || !/\/Count 1\b/.test(t1) || !t1.includes("/DCTDecode")) fail("poster is not a good one-page PDF");
    if (!/\/MediaBox \[0 0 (595\.28 841\.89|841\.89 595\.28)\]/.test(t1)) fail("poster is not A4: " + (/MediaBox[^\]]+\]/.exec(t1) || [])[0]);
    if (process.env.KEEP_PDFS) { fs.mkdirSync(process.env.KEEP_PDFS, { recursive: true }); fs.writeFileSync(path.join(process.env.KEEP_PDFS, "poster.pdf"), pdf1); }
    ok(`poster PDF downloads: A4, one page, ${(pdf1.length / 1024).toFixed(0)} KB`);
    await page.getByLabel("Paper").selectOption("A3");
    const dlA3 = page.waitForEvent("download");
    await page.getByRole("button", { name: "Make poster PDF" }).click();
    const a3 = fs.readFileSync(await (await dlA3).path()).toString("latin1");
    if (!/\/MediaBox \[0 0 (841\.89 1190\.55|1190\.55 841\.89)\]/.test(a3)) fail("A3 size wrong");
    ok("A3 poster has A3 page size");

    await page.getByRole("tab", { name: "Story book" }).click();
    const dl2 = page.waitForEvent("download", { timeout: 60000 });
    await page.getByRole("button", { name: "Make story book PDF" }).click();
    const d2 = await dl2;
    const pdf2 = fs.readFileSync(await d2.path());
    const t2 = pdf2.toString("latin1");
    const pages = Number(/\/Count (\d+)/.exec(t2)?.[1] ?? 0);
    if (pages < 3 || !/^nammoor-book-/.test(d2.suggestedFilename())) fail(`story book: ${pages} pages, ${d2.suggestedFilename()}`);
    if ((t2.match(/\/Subtype \/Image/g) || []).length !== pages) fail("every page should hold one picture");
    if (process.env.KEEP_PDFS) fs.writeFileSync(path.join(process.env.KEEP_PDFS, "book.pdf"), pdf2);
    ok(`story book PDF: cover, people, timeline = ${pages} A4 pages, ${(pdf2.length / 1024).toFixed(0)} KB`);

    // ================= 7. DUPLICATE HINTS + MERGE REQUESTS =================
    await page.goto(BASE + "/person/?id=p1");
    await page.getByRole("button", { name: "+ Son · மகன்" }).click();
    const add = page.locator("form").filter({ hasText: "Add son of Ravi" });
    await add.getByLabel("Full name").fill("Ramasamy Kumar");
    await add.getByLabel("Native place (oor)").fill("Salem");
    await add.getByRole("alert").filter({ hasText: "already in your tree" }).waitFor({ timeout: 3000 });
    await add.getByText("Ramasamy Kumar").first().waitFor();
    await add.getByLabel("Full name").fill("Zubin Qureshi");
    await add.getByLabel("Native place (oor)").fill("Delhi");
    await page.waitForFunction(() => !document.body.innerText.includes("Is this person already in your tree?"), null, { timeout: 3000 });
    await add.getByLabel("Native place (oor)").fill("Salem");
    await add.getByLabel("Full name").fill("Kamal Ravi");
    await add.getByRole("button", { name: "Add", exact: true }).click();
    if (log.addRelative.at(-1)?.p_person.native_place !== "Salem") fail("native place not sent: " + JSON.stringify(log.addRelative.at(-1)));
    ok("adding someone: a warning appears for a likely duplicate (name + place), goes away for a different person, native place is saved");

    await page.goto(BASE + "/person/?id=p3");
    const banner = page.getByRole("alert").filter({ hasText: "may be the same person" });
    await banner.waitFor();
    await banner.getByText("Ramasamy Kumar").waitFor();
    await banner.getByRole("button", { name: "Ask admin to merge" }).click();
    await banner.getByRole("button", { name: "Request sent" }).waitFor();
    const mr = db.person_merge_requests[0];
    if (!mr || new Set([mr.keep_person_id, mr.drop_person_id]).size !== 2 || ![mr.keep_person_id, mr.drop_person_id].every((x) => ["p2", "p3"].includes(x))) fail("merge request wrong: " + JSON.stringify(mr));
    if (mr.keep_person_id !== "p2") fail("the fuller card (p2) should be the one kept");
    await page.goto(BASE + "/merge/?family=fam1");
    await page.getByText(/will be merged into/).waitFor();
    await page.getByRole("button", { name: "Approve merge" }).click();
    await page.getByText(/Merged/).first().waitFor();
    if (log.merges[0] !== mr.id) fail("merge_persons not called with the request");
    ok("one tap sends a merge request (fuller card kept); the admin screen approves it through merge_persons");

    // nobody from another family is ever compared: the check uses only this family's graph call
    const graphCalls = log.rpc.filter((r) => r.name === "family_graph");
    if (!graphCalls.length || graphCalls.some((r) => r.p_family_id !== "fam1")) fail("graph asked for another family");
    ok("hints use only your own family's tree");
    await ctx.close();

    // ================= 8. ANDROID PATH (simulated bridge) =================
    const FAKE_ANDROID = () => {
      const m = (name, rtype = "promise") => ({ name, rtype });
      window.Capacitor = { PluginHeaders: [
        { name: "App", methods: [m("addListener", "callback"), m("removeListener"), m("getLaunchUrl"), m("removeAllListeners")] },
        { name: "NativeBiometric", methods: [m("isAvailable"), m("verifyIdentity")] },
        { name: "Browser", methods: [m("open"), m("close")] },
        { name: "CapacitorAudioRecorder", methods: [m("checkPermissions"), m("requestPermissions"), m("startRecording"), m("stopRecording"), m("cancelRecording"), m("getRecordingStatus"), m("addListener", "callback"), m("removeListener")] },
        { name: "Filesystem", methods: [m("writeFile"), m("getUri")] },
        { name: "Share", methods: [m("share"), m("canShare")] },
      ] };
      window.WEBVIEW_SERVER_URL = location.origin;
      window.__calls = [];
      window.androidBridge = { postMessage(str) {
        const c = JSON.parse(str);
        window.__calls.push({ id: c.pluginId, m: c.methodName, o: c.options });
        const reply = (data, error) => setTimeout(() => window.Capacitor.fromNative({ callbackId: c.callbackId, pluginId: c.pluginId, methodName: c.methodName, success: !error, data, error }), 5);
        if (c.pluginId === "App") return reply(c.methodName === "addListener" ? undefined : {});
        if (c.pluginId === "CapacitorAudioRecorder") {
          if (c.methodName === "checkPermissions" || c.methodName === "requestPermissions") return reply({ recordAudio: "granted" });
          if (c.methodName === "stopRecording") return reply({ uri: "file:///data/user/0/in.nammoor/cache/recording-1.aac", duration: 2100 });
          return reply({});
        }
        if (c.pluginId === "Filesystem") return reply(c.methodName === "getUri" ? { uri: "file:///cache/" + c.options.path } : { uri: "file:///cache/" + c.options.path });
        return reply({});
      } };
    };
    const droid = await newPhone();
    await droid.ctx.addInitScript(FAKE_ANDROID);
    await droid.ctx.addInitScript({ content: fs.readFileSync(path.join(ROOT, "node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js"), "utf8") });
    await droid.page.route("**/_capacitor_file_/**", (r) => r.fulfill({ status: 200, contentType: "audio/aac", body: Buffer.from("fake-aac-frames-".repeat(80)) }));
    db.voice_memories.length = 0;
    await droid.page.goto(BASE + "/person/?id=p1");
    await droid.page.getByRole("button", { name: /Record a voice story/ }).click();
    await droid.page.getByText(/Recording/).waitFor();
    await droid.page.waitForTimeout(400);
    await droid.page.getByRole("button", { name: "Stop" }).click();
    await droid.page.getByText(/Listen, then save/).waitFor();
    await droid.page.getByRole("button", { name: "Save story" }).click();
    await droid.page.getByText("Voice story saved ✓").waitFor();
    const calls = await droid.page.evaluate(() => window.__calls);
    const start = calls.find((c) => c.id === "CapacitorAudioRecorder" && c.m === "startRecording");
    if (!start || start.o.format !== "aac") fail("phone recorder must start in crash-safe aac: " + JSON.stringify(start));
    const upA = log.uploads.at(-1);
    if (upA.bucket !== "family-audio" || !upA.path.endsWith(".aac") || !/audio\/aac/.test(upA.type)) fail("native upload wrong " + JSON.stringify(upA));
    if (db.voice_memories[0].duration_sec !== 2) fail("duration from the phone recorder: " + db.voice_memories[0].duration_sec);
    ok("Android: asks mic permission, records with format 'aac' (survives a crash), saves a .aac in the family folder");

    await droid.page.goto(BASE + "/print/?family=fam1");
    await droid.page.getByLabel("Poster preview").waitFor();
    await droid.page.getByRole("button", { name: "Make poster PDF" }).click();
    await droid.page.waitForFunction(() => window.__calls.some((c) => c.id === "Share" && c.m === "share"), null, { timeout: 15000 });
    const calls2 = await droid.page.evaluate(() => window.__calls);
    const w = calls2.find((c) => c.id === "Filesystem" && c.m === "writeFile");
    const sh = calls2.find((c) => c.id === "Share" && c.m === "share");
    if (!/^nammoor-tree-.*\.pdf$/.test(w.o.path) || !Buffer.from(w.o.data, "base64").toString("latin1").startsWith("%PDF-1.4")) fail("the file written to the phone is not a PDF");
    if (!sh.o.files?.[0]?.endsWith(".pdf")) fail("Share sheet not given the PDF: " + JSON.stringify(sh.o));
    ok("Android: the PDF is written to the phone and opened in the Share / Save sheet");
    await droid.ctx.close();

    if (errors.length) fail("page errors: " + errors.slice(0, 3).join(" | "));
    ok("no page errors anywhere");
    console.log("\nHERITAGE E2E PASSED");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error("\nFAILED:", e.message); process.exit(1); });
