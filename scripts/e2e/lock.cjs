// App Lock test with a SIMULATED Android bridge. The page believes it is inside the Android app;
// "fingerprint" answers are scripted. This proves our lock code, not the phone's biometric hardware.
//   npm run build && NODE_USE_ENV_PROXY=1 node scripts/e2e/lock.cjs
const { chromium, devices } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");
const { serve, readEnv } = require("./serve.cjs");

const ROOT = path.resolve(__dirname, "../..");
const env = readEnv(ROOT);
const REF = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const ok = (m) => console.log(`  ✓ ${m}`);
const UID = "44444444-4444-4444-8444-444444444444";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: UID, role: "authenticated", exp: 4102444800 })}.sig`;
const user = { id: UID, aud: "authenticated", role: "authenticated", email: "ravi@example.com", phone: "", email_confirmed_at: "2026-01-01T00:00:00Z", identities: [{ provider: "email", id: "e", identity_id: "e", user_id: UID, identity_data: {} }], app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user };

// Runs in the page BEFORE the app: makes Capacitor think it is on Android and answers plugin calls.
const FAKE_ANDROID = () => {
  // Capacitor only talks to "native" plugins the native side has announced
  const m = (name, rtype = "promise") => ({ name, rtype });
  window.Capacitor = { PluginHeaders: [
    { name: "App", methods: [m("addListener", "callback"), m("removeListener"), m("getLaunchUrl"), m("removeAllListeners")] },
    { name: "NativeBiometric", methods: [m("isAvailable"), m("verifyIdentity"), m("addListener", "callback"), m("removeListener")] },
    { name: "Browser", methods: [m("open"), m("close")] },
  ] };
  window.__calls = [];
  window.__bio = { answer: (() => { try { return localStorage.getItem("__bio") || "ok"; } catch { return "ok"; } })() }; // "ok" | "cancel" | "fail" | "none" (no screen lock set up)
  window.__listeners = {};
  window.androidBridge = {
    postMessage(str) {
      const m = JSON.parse(str);
      window.__calls.push(`${m.pluginId}.${m.methodName}`);
      const reply = (data, error) => setTimeout(() => window.Capacitor.fromNative({ callbackId: m.callbackId, pluginId: m.pluginId, methodName: m.methodName, success: !error, data, error }), 5);
      if (m.pluginId === "App" && m.methodName === "addListener") { window.__listeners[m.options.eventName] = m.callbackId; return reply(); }
      if (m.pluginId === "App") return reply({});
      if (m.pluginId === "NativeBiometric" && m.methodName === "isAvailable") return reply({ isAvailable: window.__bio.answer !== "none", biometryType: 3 });
      if (m.pluginId === "NativeBiometric" && m.methodName === "verifyIdentity") {
        if (window.__bio.answer === "ok") return reply({});
        return reply(undefined, { message: window.__bio.answer, code: window.__bio.answer === "cancel" ? 16 : 10 });
      }
      return reply({});
    },
  };
  // the app moves to the background and back
  window.__appState = (isActive) => window.Capacitor.fromNative({ callbackId: window.__listeners.appStateChange, pluginId: "App", methodName: "appStateChange", success: true, data: { isActive }, save: true });
};

(async () => {
  const server = await serve(path.join(ROOT, "out"));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const errors = [];
  try {
    const ctx = await browser.newContext(devices["Pixel 7"]);
    await ctx.addInitScript(FAKE_ANDROID);
    // Capacitor's own Android bridge script (what the real WebView injects), so plugin calls and replies work for real
    await ctx.addInitScript({ content: fs.readFileSync(path.join(ROOT, "node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js"), "utf8") });
    await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }, [`sb-${REF}-auth-token`, session]);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(/supabase\.co/, async (route) => {
      const p = new URL(route.request().url()).pathname;
      const h = { "access-control-allow-origin": "*" };
      const json = (b, st = 200) => route.fulfill({ status: st, contentType: "application/json", headers: h, body: JSON.stringify(b) });
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...h, "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
      if (p.endsWith("/auth/v1/user")) return json(user);
      if (p.endsWith("/auth/v1/logout")) return route.fulfill({ status: 204, headers: h });
      if (p.endsWith("/rest/v1/family_members")) return json([{ role: "owner", families: { id: "f1", name: "Test Kudumbam", native_place: null } }]);
      if (p.endsWith("/rest/v1/profiles")) return json({ display_name: "Ravi", relation_style: "tamil" });
      if (p.endsWith("/rpc/family_graph")) return json({ persons: [{ id: "p1", name: "Ravi", nick: null, g: "male", dob: null, dobp: "unknown", ord: null, alive: true, dod: null, dodp: "unknown", photo: null, uid: UID, mgr: UID, state: null, np: null }], parents: [], unions: [] });
      return json([]);
    });
    const lockText = page.getByText("Nammoor is locked");
    const calls = () => page.evaluate(() => window.__calls);
    const bio = (a) => page.evaluate((a) => { window.__bio.answer = a; localStorage.setItem("__bio", a); }, a); // survives a reload

    // 1. Security page, turn App Lock on: needs the fingerprint first
    await page.goto(BASE + "/security/");
    const sw = page.getByRole("switch", { name: "App Lock" });
    await sw.waitFor();
    if ((await sw.getAttribute("aria-checked")) !== "false") throw new Error("lock starts on");
    await bio("cancel");
    await sw.click();
    await page.waitForTimeout(200);
    if ((await sw.getAttribute("aria-checked")) !== "false") throw new Error("lock turned on although the fingerprint prompt was cancelled");
    await bio("none");
    await sw.click();
    await page.locator("p[role=alert]").filter({ hasText: "set up a screen lock" }).waitFor();
    await bio("ok");
    await sw.click();
    await page.getByText("App Lock is on ✓").waitFor({ timeout: 6000 }).catch(async (e) => {
      console.log("CALLS:", JSON.stringify(await calls()), "ALERT:", JSON.stringify(await page.locator("p[role=alert]").allInnerTexts()), "SWITCH:", await sw.getAttribute("aria-checked"));
      throw e;
    });
    if ((await sw.getAttribute("aria-checked")) !== "true") throw new Error("lock did not turn on");
    if (!(await calls()).includes("NativeBiometric.verifyIdentity")) throw new Error("never asked the phone");
    ok("App Lock needs the phone's check to turn on: a cancelled prompt changes nothing; no screen lock set up explains what to do; a good check turns it on");

    // 2. Cold start with the lock on: the page is hidden behind the lock until unlocked
    await bio("cancel");
    await page.reload();
    await lockText.waitFor();
    if ((await page.evaluate(() => document.documentElement.dataset.locked)) !== "1") throw new Error("page not hidden while locked");
    const hidden = await page.evaluate(() => getComputedStyle(document.querySelector("main") ?? document.body.children[3]).visibility);
    if (hidden !== "hidden") throw new Error("content is visible behind the lock: " + hidden);
    ok("cold start: the lock screen shows and the page behind it is hidden");

    // 3. Wrong finger / cancel keeps it locked; the right one opens it
    await page.getByRole("button", { name: "Unlock" }).click();
    await page.waitForTimeout(150);
    if (!(await lockText.isVisible())) throw new Error("unlocked after a cancelled prompt");
    await bio("fail");
    await page.getByRole("button", { name: "Unlock" }).click();
    await page.locator("p[role=alert]").filter({ hasText: "did not work" }).waitFor();
    await bio("ok");
    await page.getByRole("button", { name: "Unlock" }).click();
    await lockText.waitFor({ state: "detached" });
    if ((await page.evaluate(() => document.documentElement.dataset.locked)) !== "0") throw new Error("page still hidden after unlock");
    ok("cancel keeps it locked, a failed check says so, a good check unlocks and shows the page");

    // 4. Short trips do not lock; long ones do
    await page.evaluate(() => window.__appState(false));
    await page.evaluate(() => window.__appState(true));
    await page.waitForTimeout(250);
    if (await lockText.isVisible()) throw new Error("locked after a 0 second trip (file picker / Share sheet)");
    await bio("cancel");
    await page.evaluate(() => { const real = Date.now; let t = real(); Date.now = () => t; window.__tick = (ms) => (t += ms); });
    await page.evaluate(() => window.__appState(false));
    await page.evaluate(() => window.__tick(31_000));
    await page.evaluate(() => window.__appState(true));
    await lockText.waitFor();
    ok("coming back after a few seconds (file picker, Share sheet) does not lock; after 30+ seconds away it locks");

    // 5. Sign out from the lock screen forgets the lock
    await page.getByRole("button", { name: "Sign out instead" }).click();
    await page.waitForURL(/\/login\//);
    if ((await page.evaluate(() => localStorage.getItem("nammoor.appLock"))) !== null) throw new Error("lock setting survived sign out");
    ok("'Sign out instead' on the lock screen signs out and clears App Lock for the next person");

    if (errors.length) throw new Error("Page errors:\n" + errors.join("\n"));
    console.log("\nAPP LOCK TEST PASSED (simulated Android bridge)");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error("\nAPP LOCK TEST FAILED:", e.message);
  process.exit(1);
});
