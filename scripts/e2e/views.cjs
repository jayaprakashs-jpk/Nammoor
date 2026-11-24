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

const P = (id, name, g, extra = {}) => ({ id, name, nick: null, g, dob: null, dobp: "unknown", ord: null, alive: true, dod: null, photo: null, uid: null, mgr: null, state: null, ...extra });
const graph = {
  persons: [
    P("thatha", "Rangasamy", "male", { alive: false }), P("paati", "Kamala", "female"),
    P("appa", "Ramasamy", "male", { ord: 1 }), P("chithappa", "Murugan", "male", { ord: 2 }), P("athai", "Selvi", "female", { ord: 3 }),
    P("amma", "Lakshmi", "female", { ord: 2 }), P("chithi", "Vasuki", "female"),
    P("me", "Karthik Ramasamy", "male", { uid: ME, dob: "1990-05-01", dobp: "exact" }), P("akka", "Divya", "female", { dob: "1985-01-01", dobp: "exact" }),
    P("cuz", "Arun", "male", { dob: "1992-01-01", dobp: "exact" }), P("wife", "Priya", "female"), P("kid", "Aadhav", "male", { dob: "2018-01-01", dobp: "exact" }),
    P("mThatha", "Subbaiah", "male"), P("mama", "Gopal", "male", { ord: 1 }), P("mami", "Radha", "female"), P("mamaDau", "Meena", "female"),
    P("wF", "Natarajan", "male"), P("wM", "Saroja", "female"),
  ],
  parents: [
    ["thatha", "appa"], ["paati", "appa"], ["thatha", "chithappa"], ["paati", "chithappa"], ["thatha", "athai"], ["paati", "athai"],
    ["appa", "me"], ["amma", "me"], ["appa", "akka"], ["amma", "akka"], ["chithappa", "cuz"], ["chithi", "cuz"],
    ["me", "kid"], ["wife", "kid"], ["mThatha", "amma"], ["mThatha", "mama"], ["mama", "mamaDau"], ["mami", "mamaDau"], ["wF", "wife"], ["wM", "wife"],
  ].map(([a, b]) => [a, b, "biological"]),
  unions: [["thatha", "paati"], ["appa", "amma"], ["chithappa", "chithi"], ["me", "wife"], ["mama", "mami"], ["wF", "wM"]].map(([a, b]) => [a, b, null, null, null]),
};

const ROOMS = [
  { id: "room-family", name: "Test Kudumbam", kind: "family", last_message_at: "2026-11-24T08:00:00Z" },
  { id: "room-grp", name: "Pongal plan", kind: "group", last_message_at: null },
];
const messages = [
  { id: "m1", room_id: "room-family", sender_id: "22222222-2222-4222-8222-222222222222", body: "Vanakkam all", created_at: "2026-11-24T07:00:00Z", edited_at: null, deleted_at: null },
];

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
    if (p.endsWith("/rest/v1/persons")) {
      const id = (url.searchParams.get("id") || "").replace("eq.", "");
      const g = graph.persons.find((x) => x.id === id);
      if (!g) return json(single ? null : [], single ? 406 : 200);
      const row = { id: g.id, family_id: "fam1", user_id: g.uid, managed_by: ME, full_name: g.name, initials: null, nickname: null, name_native: null, gender: g.g,
        birth_date: g.dob, birth_precision: g.dobp, birth_time: null, birth_place: null, birth_order: g.ord, is_living: g.alive, death_date: null, death_precision: "unknown",
        native_place: null, current_city: null, state_code: null, country_code: null, photo_path: null, history: null, created_by: ME, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
      return json(single ? row : [row]);
    }
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
