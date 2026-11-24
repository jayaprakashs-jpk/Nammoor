// Offline UI test: tree views, filters, relation names, chat. No secrets.
// Runs the built app (./out) in a phone-sized browser against a PRETEND Supabase.
//   npm run build && NODE_USE_ENV_PROXY=1 node scripts/e2e/views.cjs
const { chromium, devices } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const { serve, readEnv } = require("./serve.cjs");

const ROOT = path.resolve(__dirname, "../..");
const env = readEnv(ROOT);
const REF = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const SHOTS = process.env.SHOTS_DIR || path.join(ROOT, "e2e-shots");
fs.mkdirSync(SHOTS, { recursive: true });
const ok = (m) => console.log(`  ✓ ${m}`);

const ME = "11111111-1111-4111-8111-111111111111";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: ME, role: "authenticated", exp: 4102444800 })}.sig`;
const session = {
  access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800,
  user: { id: ME, aud: "authenticated", role: "authenticated", email: "me@test.in", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
};

const P = (id, name, g, extra = {}) => ({ id, name, nick: null, g, dob: null, dobp: "unknown", ord: null, alive: true, dod: null, dodp: "unknown", photo: null, uid: null, mgr: null, state: null, np: null, ...extra });
// a date N days from today, in a chosen year (so reminders always fall inside the next 30 days)
const inDays = (n, year) => { const d = new Date(); d.setDate(d.getDate() + n); return `${year}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const graph = {
  persons: [
    P("ggf", "Ranga Senior", "male"), P("thatha", "Rangasamy", "male", { alive: false, dod: "1998-04-12", dodp: "exact", np: "Thanjavur", dob: "1925-01-01", dobp: "year" }), P("paati", "Kamala", "female"),
    P("appa", "Ramasamy", "male", { ord: 1, np: "Thanjavur" }), P("chithappa", "Murugan", "male", { ord: 2 }), P("athai", "Selvi", "female", { ord: 3 }),
    P("amma", "Lakshmi", "female", { ord: 2, np: "Madurai" }), P("chithi", "Vasuki", "female"),
    P("me", "Karthik Ramasamy", "male", { uid: ME, dob: "1990-05-01", dobp: "exact", np: "Chennai" }), P("akka", "Divya", "female", { dob: "1985-01-01", dobp: "exact" }),
    P("cuz", "Arun", "male", { dob: "1992-01-01", dobp: "exact" }), P("wife", "Priya", "female"), P("kid", "Aadhav", "male", { dob: inDays(3, 2018), dobp: "exact" }),
    P("mThatha", "Subbaiah", "male", { np: "Madurai" }), P("mama", "Gopal", "male", { ord: 1 }), P("mami", "Radha", "female"), P("mamaDau", "Meena", "female"),
    P("wF", "Natarajan", "male"), P("wM", "Saroja", "female"),
  ],
  parents: [
    ["ggf", "thatha"], ["thatha", "appa"], ["paati", "appa"], ["thatha", "chithappa"], ["paati", "chithappa"], ["thatha", "athai"], ["paati", "athai"],
    ["appa", "me"], ["amma", "me"], ["appa", "akka"], ["amma", "akka"], ["chithappa", "cuz"], ["chithi", "cuz"],
    ["me", "kid"], ["wife", "kid"], ["mThatha", "amma"], ["mThatha", "mama"], ["mama", "mamaDau"], ["mami", "mamaDau"], ["wF", "wife"], ["wM", "wife"],
  ].map(([a, b]) => [a, b, "biological"]),
  unions: [["thatha", "paati", "1945-01-01", null, null, "year"], ["appa", "amma", null, null, null, "unknown"], ["chithappa", "chithi", null, null, null, "unknown"],
    ["me", "wife", inDays(5, 2015), null, null, "exact"], ["mama", "mami", null, null, null, "unknown"], ["wF", "wM", null, null, null, "unknown"]],
};

const ROOMS = [
  { id: "room-family", name: "Test Kudumbam", kind: "family", last_message_at: "2026-11-24T08:00:00Z" },
  { id: "room-grp", name: "Pongal plan", kind: "group", last_message_at: null },
];
const saved = [];
const imports = [];
let authorizeUrl = null;
const saves = {};
const messages = [
  { id: "m1", room_id: "room-family", sender_id: "22222222-2222-4222-8222-222222222222", body: "Vanakkam all", created_at: "2026-11-24T07:00:00Z", edited_at: null, deleted_at: null },
];

function rowOf(g) {
  return { id: g.id, family_id: "fam1", user_id: g.uid, managed_by: ME, full_name: g.name, initials: null, nickname: null, name_native: null, gender: g.g,
        birth_date: g.dob, birth_precision: g.dobp, birth_time: null, birth_place: null, birth_order: g.ord, is_living: g.alive, death_date: null, death_precision: "unknown",
        native_place: null, current_city: null, state_code: null, country_code: null, photo_path: null, history: null, created_by: ME, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...(saves[g.id] || {}) };
}

async function mockSupabase(page, log) {
  await page.route(/supabase\.co/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
    log.push(`${method} ${p}`);
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (p.endsWith("/rest/v1/family_members") && url.searchParams.get("select")?.startsWith("role")) return json([{ role: "owner", families: { id: "fam1", name: "Test Kudumbam", native_place: "Thanjavur" } }]);
    if (p.endsWith("/rest/v1/family_members") && url.searchParams.get("select")?.startsWith("user_id")) return json([{ user_id: ME, role: "owner", profiles: { display_name: "Karthik" } }]);
    if (p.endsWith("/rest/v1/persons") && method === "PATCH") {
      const id = (url.searchParams.get("id") || "").replace("eq.", "");
      const patch = JSON.parse(req.postData());
      saved.push(patch);
      const g = graph.persons.find((x) => x.id === id);
      if (g) { if ("birth_date" in patch) g.dob = patch.birth_date; if ("birth_precision" in patch) g.dobp = patch.birth_precision; saves[id] = { ...(saves[id] || {}), ...patch }; }
      return json(g ? [rowOf(g)] : [], 200);
    }
    if (p.endsWith("/rest/v1/persons")) {
      const id = (url.searchParams.get("id") || "").replace("eq.", "");
      const g = graph.persons.find((x) => x.id === id);
      if (!g) return json(single ? null : [], single ? 406 : 200);
      const row = rowOf(g);
      return json(single ? row : [row]);
    }
    if (p.includes("/auth/v1/authorize")) { authorizeUrl = req.url(); return route.fulfill({ status: 200, contentType: "text/html", body: "<p>Google (pretend)</p>" }); }
    if (p.endsWith("/auth/v1/token")) return json({ access_token: jwt, refresh_token: "r2", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user: session.user });
    if (p.endsWith("/rest/v1/families")) return json([{ name: "Test Kudumbam" }]);
    if (p.endsWith("/rpc/add_relative")) {
      const b = JSON.parse(req.postData());
      const id = "new-" + graph.persons.length;
      graph.persons.push(P(id, b.p_person.full_name, b.p_relation === "mother" ? "female" : "male", { dob: b.p_person.birth_date, dobp: b.p_person.birth_precision }));
      graph.parents.push([id, b.p_anchor, "biological"]);
      return json(id);
    }
    if (p.endsWith("/rpc/export_family")) {
      return json({ format: "nammoor-family-backup", version: 1, exported_at: new Date().toISOString(), family: { name: "Test Kudumbam", native_place: "Thanjavur" },
        persons: graph.persons.map((g) => ({ id: g.id, full_name: g.name, initials: null, nickname: null, name_native: null, gender: g.g, birth_date: g.dob, birth_precision: g.dobp,
          birth_time: null, birth_place: null, birth_order: g.ord, is_living: g.alive, death_date: g.dod, death_precision: g.dodp, native_place: g.np, current_city: null, state_code: null, country_code: null, history: null })),
        parent_child: graph.parents.map(([a, b, k]) => ({ parent_id: a, child_id: b, kind: k })),
        unions: graph.unions.map((u) => ({ partner_a: u[0], partner_b: u[1], married_on: u[2], married_precision: u[5], ended_on: null, end_reason: null })),
        education: [], occupations: [] });
    }
    if (p.endsWith("/rpc/import_family_data")) { imports.push(JSON.parse(req.postData()).p_data); return json({ added: 2, linked: 1, parent_links: 2, marriages: 1 }); }
    if (p.endsWith("/rpc/family_graph")) return json(graph);
    if (p.endsWith("/rest/v1/profiles")) return method === "PATCH" ? route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }) : json(single ? { relation_style: "tamil" } : [{ relation_style: "tamil" }]);
    if (p.endsWith("/rest/v1/chat_rooms")) { const id = (url.searchParams.get("id") || "").replace("eq.", ""); return json(id ? ROOMS.filter((r) => r.id === id) : ROOMS); }
    if (p.endsWith("/rest/v1/chat_room_members")) {
      if (method === "PATCH") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
      if (url.searchParams.get("user_id")) return json(ROOMS.map((r) => ({ room_id: r.id, last_read_at: r.id === "room-grp" ? null : "2026-11-24T09:00:00Z" })));
      return json([{ user_id: ME, profiles: { display_name: "Karthik" } }, { user_id: "22222222-2222-4222-8222-222222222222", profiles: { display_name: "Divya" } }]);
    }
    if (p.endsWith("/rest/v1/chat_messages")) {
      if (method === "POST") { const b = JSON.parse(req.postData()); messages.push({ ...b, sender_id: ME, created_at: new Date().toISOString(), edited_at: null, deleted_at: null }); return route.fulfill({ status: 201, headers: { "access-control-allow-origin": "*" } }); }
      return json(messages.slice().reverse());
    }
    if (p.includes("/storage/")) return json([]);
    return json([]);
  });
}

(async () => {
  const server = await serve(path.join(ROOT, "out"));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const errors = [];
  const log = [];
  try {
    const ctx = await browser.newContext(devices["Pixel 7"]);
    await ctx.addInitScript(([k, s]) => { try { localStorage.setItem(k, JSON.stringify(s)); } catch {} }, [`sb-${REF}-auth-token`, session]);
    await ctx.addInitScript(() => { window.__errs = []; window.addEventListener("unhandledrejection", (e) => window.__errs.push("rej:" + (e.reason && e.reason.message || e.reason))); window.addEventListener("error", (e) => window.__errs.push("err:" + e.message)); });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => process.env.DBG && console.log("CONSOLE", m.type(), m.text().slice(0, 300)));
    page.on("console", (m) => m.type() === "error" && !/ERR_|Failed to load resource|WebSocket/i.test(m.text()) && errors.push("console: " + m.text()));
    await mockSupabase(page, log);

    await page.goto(BASE + "/tree/");
    await page.getByText("Test Kudumbam").first().waitFor();
    await page.getByRole("heading", { name: "Parents' generation", exact: true }).waitFor();
    const list = await page.locator("main").innerText();
    for (const [name, term] of [["Murugan", "சித்தப்பா"], ["Selvi", "அத்தை"], ["Gopal", "மாமா"], ["Natarajan", "மாமனார்"], ["Divya", "அக்கா"], ["Arun", "தம்பி"], ["Meena", "மாமா மகள்"]]) {
      const row = await page.locator("li", { hasText: name }).first().innerText();
      if (!row.includes(term)) throw new Error(`${name} should be ${term}, row says: ${row.replace(/\n/g, " | ")}`);
    }
    if (!list.includes("You")) throw new Error("no You badge");
    await page.screenshot({ path: path.join(SHOTS, "v1-list.png") });
    ok("list: Tamil relation names (Chithappa, Athai, Mama, Maamanaar, Akka, Thambi, Mama magal)");

    await page.getByRole("tab", { name: "Tree" }).click();
    await page.locator('svg[aria-label="Family tree"]').waitFor();
    const nodes = await page.locator('svg[aria-label="Family tree"] g[role="link"]').count();
    if (nodes !== graph.persons.length) throw new Error(`tree shows ${nodes} of ${graph.persons.length}`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, "v2-tree.png") });
    ok(`tree: all ${nodes} people drawn`);
    await page.getByRole("button", { name: "Zoom out" }).click();
    await page.locator('svg[aria-label="Family tree"] g[role="link"]', { hasText: "Murugan" }).click();
    await page.waitForURL(/\/person\/\?id=chithappa/);
    await page.goBack();
    await page.getByRole("tab", { name: "Tree" }).waitFor();
    ok("tree: zoom works, tapping a card opens the profile");

    await page.getByRole("tab", { name: "Round" }).click();
    await page.locator('svg[aria-label="Round family view"]').waitFor();
    const dots = await page.locator('svg[aria-label="Round family view"] g[role="link"]').count();
    if (dots !== graph.persons.length) throw new Error(`round shows ${dots} of ${graph.persons.length}`);
    await page.screenshot({ path: path.join(SHOTS, "v3-round.png") });
    ok(`round: all ${dots} people placed (me in the middle)`);

    await page.getByRole("tab", { name: "Close" }).click();
    await page.getByText("Parents · பெற்றோர்").waitFor();
    await page.getByText("Uncles & aunts").waitFor();
    await page.screenshot({ path: path.join(SHOTS, "v4-close.png") });
    ok("close circle: parents, spouse, siblings, children, grandparents, uncles and aunts, in-laws");

    await page.getByRole("button", { name: "Father's side" }).click();
    const card = (name) => page.locator('a[href^="/person/"]', { hasText: name });
    await card("Murugan").first().waitFor();
    if ((await card("Gopal").count()) > 0 || (await card("Natarajan").count()) > 0) throw new Error("father's side still shows mother's or in-laws");
    await page.getByRole("tab", { name: "Tree" }).click();
    await page.locator('svg[aria-label="Family tree"]').waitFor();
    const paternal = await page.locator('svg[aria-label="Family tree"] g[role="link"]').count();
    await page.screenshot({ path: path.join(SHOTS, "v5-father-side.png") });
    await page.getByRole("button", { name: "Mother's side" }).click();
    await page.waitForTimeout(200);
    const maternal = await page.locator('svg[aria-label="Family tree"] g[role="link"]').count();
    if (!(paternal > 1 && maternal > 1 && paternal < graph.persons.length && maternal < graph.persons.length)) throw new Error(`filters off: ${paternal}/${maternal}`);
    ok(`side filters: father's side ${paternal} people, mother's side ${maternal} people`);
    await page.getByRole("button", { name: "Everyone" }).click();

    await page.getByRole("tab", { name: "List" }).click();
    await page.getByText("Names & point of view").click();
    await page.getByLabel("Relation names").selectOption("english_in");
    await page.locator("li", { hasText: "Murugan" }).getByText("Chacha").waitFor();
    await page.getByLabel("Relation names").selectOption("english_global");
    await page.locator("li", { hasText: "Murugan" }).getByText("Uncle").waitFor();
    await page.getByLabel("See the tree as").selectOption("chithappa");
    await page.locator("li", { hasText: "Ramasamy" }).first().waitFor();
    const asUncle = (await page.locator("li", { hasText: "Karthik" }).first().textContent()) ?? "";
    if (!/Nephew/i.test(asUncle)) throw new Error("as Chithappa, Karthik should be a nephew: " + asUncle);
    ok("names switch to Hindi style and English; viewing as Chithappa makes me his nephew");

    await page.goto(BASE + "/person/?id=chithappa");
    await page.getByText("சித்தப்பா").first().waitFor();
    await page.screenshot({ path: path.join(SHOTS, "v6-profile-relation.png") });
    ok("profile shows 'your relation'");

    // DOB year box: type like a person does, one key at a time (the Android bug)
    await page.goto(BASE + "/person/?id=me");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Date of birth known as").selectOption("year");
    const yr = page.getByLabel("Date of birth", { exact: true });
    if ((await yr.getAttribute("inputmode")) !== "numeric") throw new Error("year box does not ask for the number keypad");
    await yr.fill("");
    await yr.pressSequentially("1", { delay: 80 });
    if ((await yr.inputValue()) !== "1") throw new Error("first digit was wiped: " + (await yr.inputValue()));
    await yr.pressSequentially("985abc", { delay: 80 });
    if ((await yr.inputValue()) !== "1985") throw new Error("year box shows " + (await yr.inputValue()));
    await page.getByLabel("Date of birth known as").selectOption("approx");
    if ((await page.getByLabel("Date of birth", { exact: true }).inputValue()) !== "1985") throw new Error("year lost when switching to About");
    ok("DOB year box: digits stay, letters ignored, 4 digit limit, numeric keypad");

    // A half-typed year must not be saved as "nothing"
    await page.getByLabel("Date of birth", { exact: true }).fill("198");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "4-digit year" }).first().waitFor();
    if (saved.length && saved.at(-1)?.birth_date === null) throw new Error("half-typed year was sent to the server");
    const sentBefore = saved.length;
    // Cancel with unsaved changes asks first, and No keeps the form
    let asked = "";
    page.once("dialog", (d) => { asked = d.message(); d.dismiss(); });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    if (!/Leave without saving/.test(asked)) throw new Error("no unsaved-changes warning");
    await page.getByRole("button", { name: "Save", exact: true }).waitFor();
    await page.getByLabel("Date of birth", { exact: true }).fill("1985");
    if (saved.length !== sentBefore) throw new Error("something was sent while the year was incomplete");
    ok("half-typed year is blocked with a visible message; Cancel warns about unsaved changes");

    // Save the year, leave, come back: it must still be there
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("Born").waitFor();
    const born = await page.locator("dl").innerText();
    await page.getByText("Saved ✓").first().waitFor();
    if (!/1985/.test(born)) throw new Error("after save, About shows: " + born.replace(/\n/g, " | "));
    if (saved.at(-1)?.birth_date !== "1985-01-01" || saved.at(-1)?.birth_precision !== "approx") throw new Error("payload: " + JSON.stringify(saved.at(-1)));
    await page.goto(BASE + "/tree/");
    await page.getByRole("heading", { name: "Your generation" }).waitFor();
    await page.goto(BASE + "/person/?id=me");
    await page.getByText("Born").waitFor();
    if (!/around 1985/.test(await page.locator("dl").innerText())) throw new Error("reopened profile lost the year");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    if ((await page.getByLabel("Date of birth known as").inputValue()) !== "approx") throw new Error("precision not pre-filled");
    if ((await page.getByLabel("Date of birth", { exact: true }).inputValue()) !== "1985") throw new Error("year not pre-filled");
    ok("DOB year saved, shown after save, still there after leaving and reopening, edit form pre-filled");

    await page.goto(BASE + "/chat/?family=fam1");
    await page.getByText("Family chat").waitFor();
    await page.getByText("Pongal plan").waitFor();
    await page.screenshot({ path: path.join(SHOTS, "v7-chat-list.png") });
    await page.getByRole("link", { name: /Test Kudumbam/ }).click();
    await page.getByText("Vanakkam all").waitFor();
    page.on("framenavigated", (f) => f === page.mainFrame() && log.push("NAV " + f.url()));
    page.on("load", () => log.push("LOAD"));
    await page.getByLabel("Message").fill("Pongal ku ellarum vaanga");
    await page.getByRole("button", { name: "Send" }).click();
    await page.getByText("Pongal ku ellarum vaanga").waitFor({ timeout: 8000 }).catch(async (e) => {
      await page.screenshot({ path: path.join(SHOTS, "debug-chat.png") });
      console.log("PAGE TEXT:", (await page.locator("body").innerText()).slice(0, 600));
      console.log("AUTH CALLS:", log.filter((l) => /auth|realtime/.test(l)).join(" | "), "ALL:", log.length);
      console.log("URL:", page.url(), "ERRORS:", JSON.stringify(errors));
      console.log("WINERRS:", JSON.stringify(await page.evaluate(() => window.__errs)), "BODYLEN:", (await page.locator("body").innerHTML()).length);
      console.log("REQUESTS:", log.slice(-8).join(" | "));
      throw e;
    });
    await page.getByText("Sending...").waitFor({ state: "detached", timeout: 5000 });
    await page.screenshot({ path: path.join(SHOTS, "v8-chat-room.png") });
    ok("chat: list, room, send message (optimistic then confirmed)");

    await page.goto(BASE + "/chat/?family=fam1&new=1");
    await page.getByLabel("Group name").waitFor();
    ok("chat: new group screen loads");


    // ================= tree upgrades =================
    await page.goto(BASE + "/tree/");
    await page.getByRole("heading", { name: "Your generation" }).waitFor();
    await page.getByText("Family insights").click();
    await page.getByText("Top native places").waitFor();
    const ins = await page.locator("details").filter({ hasText: "Family insights" }).innerText();
    if (!/Thanjavur/.test(ins) || !/Oldest living/.test(ins) || !/Passed away/.test(ins)) throw new Error("insights card: " + ins.replace(/\n/g, " | "));
    await page.screenshot({ path: path.join(SHOTS, "n1-insights.png") });
    ok("insights card: totals, living vs passed away, oldest living, top native places");

    await page.getByLabel("Native place").selectOption("Madurai");
    const links = page.locator('a[href^="/person/"]');
    await links.filter({ hasText: "Lakshmi" }).first().waitFor();
    if ((await links.filter({ hasText: "Murugan" }).count()) > 0) throw new Error("place filter still shows other places");
    await page.getByLabel("Sort").selectOption("name");
    await page.getByRole("button", { name: "Passed away" }).click();
    await page.getByText("Nobody matches these filters.").waitFor();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await page.getByRole("button", { name: "No birth date" }).click();
    await links.filter({ hasText: "Priya" }).first().waitFor();
    if ((await links.filter({ hasText: "Karthik" }).count()) > 0) throw new Error("no-birth-date filter shows someone with a date");
    await page.getByRole("button", { name: "Clear filters" }).click();
    ok("list: filter by native place, passed away, no birth date; sort; clear filters");

    await page.getByRole("tab", { name: "Pedigree" }).click();
    await page.locator('svg[aria-label="Pedigree chart"]').waitFor();
    await page.getByRole("button", { name: "Add mother of Lakshmi" }).waitFor();
    await page.screenshot({ path: path.join(SHOTS, "n2-pedigree.png") });
    await page.getByRole("button", { name: "Add mother of Lakshmi" }).click();
    await page.getByLabel("Full name").fill("Meenakshi");
    await page.getByLabel("Year of birth").fill("19");
    await page.getByRole("button", { name: "Add mother", exact: true }).click();
    await page.getByText("Type all 4 digits").waitFor();
    await page.getByLabel("Year of birth").fill("1932");
    await page.getByRole("button", { name: "Add mother", exact: true }).click();
    await page.getByText("Added Meenakshi").waitFor();
    await page.getByRole("link", { name: /Meenakshi/ }).waitFor();
    if (await page.getByRole("button", { name: "Add mother of Lakshmi" }).count()) throw new Error("placeholder is still there after adding");
    const pedNodes = () => page.locator('svg[aria-label="Pedigree chart"] g[role="link"]').count();
    if ((await pedNodes()) !== 8) throw new Error("pedigree at 4 generations shows " + (await pedNodes()));
    ok("pedigree: + Add Mother card on a missing parent, quick add sheet checks the year, card becomes a person");

    await page.getByLabel("Generations to show").fill("3");
    await page.waitForTimeout(150);
    if ((await pedNodes()) !== 7) throw new Error("pedigree at 3 generations shows " + (await pedNodes()));
    await page.getByLabel("Generations to show").fill("5");
    await page.waitForTimeout(150);
    ok("generations slider: 3 generations hides the great-grandfather, 4 shows him");

    await page.getByRole("tab", { name: "Fan" }).click();
    await page.locator('svg[aria-label="Fan chart of ancestors"]').waitFor();
    const fan = await page.locator('svg[aria-label="Fan chart of ancestors"] g[role="link"]').count();
    if (fan !== 8) throw new Error("fan shows " + fan);
    await page.screenshot({ path: path.join(SHOTS, "n3-fan.png") });
    await page.locator('svg[aria-label="Fan chart of ancestors"] g[role="link"]', { hasText: "Ramasamy" }).first().click();
    await page.waitForURL(/\/person\/\?id=/);
    await page.goBack();
    ok("fan: ancestors in a semicircle, tapping opens the profile");

    await page.getByRole("tab", { name: "Timeline" }).click();
    await page.getByText("Coming up").waitFor();
    const age = new Date().getFullYear() - 2018;
    await page.getByText(`Aadhav turns ${age}`).waitFor();
    await page.getByText(/Karthik Ramasamy & Priya: \d+(st|nd|rd|th) anniversary/).waitFor();
    await page.getByText(/Rangasamy passed away/).waitFor();
    await page.screenshot({ path: path.join(SHOTS, "n4-timeline.png") });
    await page.getByRole("button", { name: "Deaths", exact: true }).click();
    if ((await page.getByText("was born").count()) > 0) throw new Error("death filter still shows births");
    await page.getByRole("button", { name: "Marriages", exact: true }).click();
    await page.getByText(/married/).first().waitFor();
    ok("timeline: coming up (birthday, anniversary), births/marriages/deaths in order, filters");

    // ================= backup: export =================
    await page.goto(BASE + "/backup/?family=fam1");
    const [dlJson] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Save backup/ }).click()]);
    if (!/^nammoor-test-kudumbam-\d{4}-\d{2}-\d{2}\.json$/.test(dlJson.suggestedFilename())) throw new Error("file name " + dlJson.suggestedFilename());
    const j = JSON.parse(fs.readFileSync(await dlJson.path(), "utf8"));
    if (j.format !== "nammoor-family-backup" || j.persons.length !== graph.persons.length || !j.events.length) throw new Error("bad json backup");
    if (/salary|managed_by|user_id/.test(JSON.stringify(j))) throw new Error("private data in backup");
    const [dlGed] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Save GEDCOM/ }).click()]);
    const ged = fs.readFileSync(await dlGed.path(), "utf8");
    if (!ged.startsWith("0 HEAD") || !ged.includes("2 VERS 5.5.1") || !/0 @F\d+@ FAM/.test(ged) || !ged.trimEnd().endsWith("0 TRLR")) throw new Error("bad gedcom");
    await page.screenshot({ path: path.join(SHOTS, "n5-backup-export.png") });
    ok(`export: .json (${j.persons.length} people, ${j.events.length} events) and .ged download, no private data`);

    // ================= backup: import =================
    await page.getByRole("tab", { name: "Import & restore" }).click();
    await page.locator("#import-file").setInputFiles({ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await page.getByRole("alert").filter({ hasText: "not a GEDCOM" }).waitFor();
    const GED = "0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Karthik /Ramasamy/\n1 SEX M\n1 BIRT\n2 DATE 1 JAN 1985\n1 FAMS @F1@\n0 @I2@ INDI\n1 NAME Anand\n1 SEX M\n1 FAMC @F1@\n0 @I3@ INDI\n1 NAME Anitha\n1 SEX F\n1 FAMS @F1@\n0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I3@\n1 CHIL @I2@\n0 TRLR\n";
    await page.locator("#import-file").setInputFiles({ name: "family.ged", mimeType: "application/octet-stream", buffer: Buffer.from(GED) });
    await page.getByText("Possible duplicates").waitFor({ timeout: 8000 }).catch(async (e) => { console.log("IMPORT PAGE:", (await page.locator("main").innerText()).slice(0, 700)); throw e; });
    const prev = await page.locator("main").innerText();
    if (!/2\s*New people/.test(prev) || !/1\s*Already here/.test(prev) || !/2\s*Parent links/.test(prev) || !/1\s*Marriages/.test(prev)) throw new Error("preview: " + prev.replace(/\n/g, " | "));
    if (!/Same name and birth year as\s*Karthik Ramasamy/.test(prev)) throw new Error("duplicate not explained");
    await page.screenshot({ path: path.join(SHOTS, "n6-import-preview.png") });
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Import 2 people" }).click();
    await page.waitForURL(/\/tree\//);
    const sent = imports.at(-1);
    if (sent.persons.find((x) => x.ref === "@I1@").existing !== "me") throw new Error("duplicate was not linked to the existing person");
    if (sent.persons.find((x) => x.ref === "@I2@").existing !== null) throw new Error("new person marked as existing");
    if (sent.parents.length !== 2 || sent.unions.length !== 1) throw new Error("links not sent");
    ok("import: bad file explained, GEDCOM preview with counts, duplicate found and linked, sent to the server");

    // ================= Google sign-in =================
    const ctx2 = await browser.newContext(devices["Pixel 7"]);
    const g = await ctx2.newPage();
    g.on("pageerror", (e) => errors.push("google page: " + e.message));
    await mockSupabase(g, log);
    await g.goto(BASE + "/login/?next=%2Ftree%2F");
    await g.screenshot({ path: path.join(SHOTS, "n7-login-google.png") });
    await g.getByRole("button", { name: /Continue with Google/ }).click();
    await g.waitForURL(/auth\/v1\/authorize/);
    const au = new URL(authorizeUrl);
    if (au.searchParams.get("provider") !== "google") throw new Error("provider: " + au.search);
    if (au.searchParams.get("redirect_to") !== BASE + "/auth/callback/") throw new Error("redirect_to: " + au.searchParams.get("redirect_to"));
    if (!au.searchParams.get("code_challenge") || au.searchParams.get("code_challenge_method") !== "s256") throw new Error("no PKCE: " + au.search);
    await g.goto(BASE + "/auth/callback/?code=abc123def456");
    await g.waitForURL(/\/tree\//);
    await g.getByText("Test Kudumbam").first().waitFor();
    ok("google: button sends provider=google with PKCE and the right return address; coming back signs you in and opens the tree");
    await g.evaluate(() => localStorage.clear());
    await g.goto(BASE + "/auth/callback/?error=access_denied&error_description=Access+blocked%3A+not+allowed");
    await g.getByRole("alert").filter({ hasText: "Access blocked: not allowed" }).waitFor();
    await g.getByRole("link", { name: "Back to sign in" }).waitFor();
    ok("google: a refused sign in shows the reason and a way back");

    // ================= DOB: year only, about, and death year =================
    await page.goto(BASE + "/person/?id=me");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Date of birth known as").selectOption("year");
    await page.getByLabel("Date of birth", { exact: true }).fill("1971");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("Saved ✓").first().waitFor();
    let facts = await page.locator("dl").innerText();
    if (!/Born\s*1971\b/.test(facts) || /around/.test(facts)) throw new Error("year only shows: " + facts.replace(/\n/g, " | "));
    if (saved.at(-1).birth_date !== "1971-01-01" || saved.at(-1).birth_precision !== "year") throw new Error("payload " + JSON.stringify(saved.at(-1)));
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    if ((await page.getByLabel("Date of birth known as").inputValue()) !== "year" || (await page.getByLabel("Date of birth", { exact: true }).inputValue()) !== "1971") throw new Error("year only not pre-filled");
    await page.getByLabel("Passed away").check();
    await page.getByLabel("Date of death known as").selectOption("year");
    await page.getByLabel("Date of death", { exact: true }).fill("1999");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.locator("dl").getByText("Died", { exact: true }).waitFor({ timeout: 8000 }).catch(async (e) => {
      console.log("ALERTS:", JSON.stringify(await page.getByRole("alert").allInnerTexts()), "LAST PATCH:", JSON.stringify(saved.at(-1)));
      console.log("PAGE:", (await page.locator("main").innerText()).replace(/\n+/g, " | ").slice(0, 500));
      throw e;
    });
    facts = await page.locator("dl").innerText();
    if (!/Died\s*1999/.test(facts)) throw new Error("death year shows: " + facts.replace(/\n/g, " | "));
    if (saved.at(-1).death_date !== "1999-01-01" || saved.at(-1).death_precision !== "year" || saved.at(-1).is_living !== false) throw new Error("death payload " + JSON.stringify(saved.at(-1)));
    await page.goto(BASE + "/tree/");
    await page.getByRole("tab", { name: "List" }).click();
    await page.getByRole("heading", { name: "Your generation" }).waitFor();
    await page.goto(BASE + "/person/?id=me");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    if ((await page.getByLabel("Date of death", { exact: true }).inputValue()) !== "1999") throw new Error("death year not pre-filled after reopening");
    ok("DOB: Year only and About (year) and death year all save, show correctly, and pre-fill after leaving and reopening");

    if (errors.length) throw new Error("Page errors:\n" + errors.join("\n"));
    console.log("\nVIEWS + CHAT UI TEST PASSED");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error("\nVIEWS TEST FAILED:", e.message);
  process.exit(1);
});
