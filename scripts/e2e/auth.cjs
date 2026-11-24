// Offline test of every sign-in and security flow. No secrets, no real email or SMS.
//   npm run build && NODE_USE_ENV_PROXY=1 node scripts/e2e/auth.cjs
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

const UID = "33333333-3333-4333-8333-333333333333";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: UID, role: "authenticated", exp: 4102444800 })}.sig`;

// ---- a pretend Supabase Auth ----
function makeServer() {
  const s = {
    log: [],                // every auth request: { m, p, q, b }
    account: { email: "ravi@example.com", phone: null, identities: ["email"], name: "Ravi" },
    goodCode: "123456", goodPassword: "Pongal2026", wrongCodesAllowed: false,
    authorizeHits: [],
  };
  const user = () => ({
    id: UID, aud: "authenticated", role: "authenticated", email: s.account.email, phone: s.account.phone ?? "",
    email_confirmed_at: s.account.email ? "2026-01-01T00:00:00Z" : null, phone_confirmed_at: s.account.phone ? "2026-01-01T00:00:00Z" : null,
    identities: s.account.identities.map((p) => ({ provider: p, identity_id: p, id: p, user_id: UID, identity_data: { email: s.account.email ?? "g@example.com" } })),
    app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z",
  });
  const session = () => ({ access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user: user() });
  s.session = session;
  s.user = user;
  s.install = async (page) => {
    await page.route(/supabase\.co/, async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const p = url.pathname;
      const m = req.method();
      const h = { "access-control-allow-origin": "*" };
      const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: h, body: JSON.stringify(body) });
      if (m === "OPTIONS") return route.fulfill({ status: 204, headers: { ...h, "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
      let b = null;
      try { b = req.postData() ? JSON.parse(req.postData()) : null; } catch { /* not json */ }
      if (p.startsWith("/auth/v1/")) s.log.push({ m, p, q: Object.fromEntries(url.searchParams), b });

      if (p.endsWith("/auth/v1/otp")) return json({});
      if (p.endsWith("/auth/v1/recover")) return json({});
      if (p.endsWith("/auth/v1/signup")) return json({ ...user(), identities: [{ provider: "email" }] });
      if (p.endsWith("/auth/v1/verify")) {
        if (b.token === s.goodCode) return json(session());
        return json({ code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" }, 403);
      }
      if (p.endsWith("/auth/v1/token")) {
        if (url.searchParams.get("grant_type") === "password") {
          if (b.password === s.goodPassword) return json(session());
          return json({ code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }, 400);
        }
        return json(session());
      }
      if (p.endsWith("/auth/v1/user/identities/authorize")) { s.authorizeHits.push(req.url()); return json({ url: "https://accounts.google.test/consent" }); }
      if (p.endsWith("/auth/v1/user")) {
        if (m === "PUT") {
          if (b.password && b.password === s.goodPassword) return json({ code: 422, error_code: "same_password", msg: "New password should be different from the old password." }, 422);
          return json(user());
        }
        return json(user());
      }
      if (p.endsWith("/auth/v1/logout")) return route.fulfill({ status: 204, headers: h });
      // the data tables, just enough for the tree page to open
      if (p.endsWith("/rest/v1/profiles")) return json(req.headers()["accept"]?.includes("vnd.pgrst.object") ? { display_name: s.account.name, relation_style: "tamil" } : [{ display_name: s.account.name, relation_style: "tamil" }]);
      if (p.endsWith("/rest/v1/family_members")) return json([{ role: "owner", families: { id: "f1", name: "Test Kudumbam", native_place: null } }]);
      if (p.endsWith("/rpc/family_graph")) return json({ persons: [{ id: "p1", name: "Ravi", nick: null, g: "male", dob: null, dobp: "unknown", ord: null, alive: true, dod: null, dodp: "unknown", photo: null, uid: UID, mgr: UID, state: null, np: null }], parents: [], unions: [] });
      if (p.includes("accounts.google.test")) return route.fulfill({ status: 200, contentType: "text/html", body: "ok" });
      return json([]);
    });
    await page.route(/accounts\.google\.test/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>Google (pretend)</p>" }));
  };
  s.count = (re) => s.log.filter((x) => re.test(x.p)).length;
  s.last = (re) => s.log.filter((x) => re.test(x.p)).at(-1);
  return s;
}

(async () => {
  const server = await serve(path.join(ROOT, "out"));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const errors = [];
  const fresh = async ({ signedIn = false, srv = makeServer() } = {}) => {
    const ctx = await browser.newContext(devices["Pixel 7"]);
    if (signedIn) await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }, [`sb-${REF}-auth-token`, srv.session()]);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && !/ERR_|Failed to load resource|WebSocket|status of 4\d\d/i.test(m.text()) && errors.push("console: " + m.text()));
    await srv.install(page);
    return { ctx, page, srv };
  };
  const code = (page) => page.getByLabel("Code", { exact: true });
  const alert = (page) => page.locator("p[role=alert]");
  const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, `a-${n}.png`) });

  try {
    // ======================= the main screen =======================
    {
      const { page } = await fresh();
      await page.goto(BASE + "/login/");
      await page.getByRole("button", { name: /Continue with Google/ }).waitFor();
      await page.getByLabel("Email or mobile number").waitFor();
      await page.getByRole("button", { name: "Send code" }).waitFor();
      await page.getByRole("button", { name: "Sign in with Email & Password" }).waitFor();
      if (await page.getByLabel("Password").count()) throw new Error("password box is on the main screen (clutter)");
      if (await page.getByLabel("Country code").count()) throw new Error("country picker shows before anyone types a number");
      await shot(page, "1-main");
      ok("main screen: Google, one smart box, Send code, and the password option below. No clutter");

      const box = page.getByLabel("Email or mobile number");
      await box.fill("98765");
      await page.getByLabel("Country code").waitFor();
      if ((await page.getByLabel("Country code").inputValue()) !== "91") throw new Error("country does not default to +91");
      await shot(page, "2-phone");
      await page.getByRole("button", { name: "Send code" }).click();
      await alert(page).filter({ hasText: "10 digits" }).waitFor();
      await box.fill("12345 67890");
      await page.getByRole("button", { name: "Send code" }).click();
      await alert(page).filter({ hasText: "starts with 6, 7, 8 or 9" }).waitFor();
      await box.fill("ravi@gmail");
      await page.getByRole("button", { name: "Send code" }).click();
      await alert(page).filter({ hasText: "does not look right" }).waitFor();
      await box.fill("");
      await page.getByRole("button", { name: "Send code" }).click();
      await alert(page).filter({ hasText: "Type your email or mobile number" }).waitFor();
      ok("smart box: country picker (+91) appears only for numbers; clear messages for a short number, a wrong first digit, a bad email, nothing typed");
    }

    // ======================= email code =======================
    {
      const { page, srv } = await fresh();
      await page.goto(BASE + "/login/?next=%2Ftree%2F");
      await page.getByLabel("Email or mobile number").fill("  Ravi@Example.com ");
      await page.getByRole("button", { name: "Send code" }).click();
      await page.getByText("We sent a 6-digit code to ravi@example.com").waitFor();
      const sent = srv.last(/\/otp$/).b;
      if (sent.email !== "ravi@example.com" || sent.create_user === false) throw new Error("otp body " + JSON.stringify(sent));
      await code(page).fill("000000");
      await page.getByRole("button", { name: "Verify" }).click();
      await alert(page).filter({ hasText: /wrong or has expired.*\(4 tries left\)/ }).waitFor();
      await shot(page, "3-wrong-code");
      await code(page).fill("123456");
      await page.getByRole("button", { name: "Verify" }).click();
      await page.waitForURL(/\/tree\//);
      if (srv.last(/\/verify$/).b.type !== "email") throw new Error("verify type " + srv.last(/\/verify$/).b.type);
      ok("email code: sent to the cleaned-up address, wrong code explained with tries left, right code signs in and opens the tree");
    }

    // ======================= mobile code =======================
    {
      const { page, srv } = await fresh();
      srv.account = { ...srv.account, email: null, phone: "919876543210", identities: ["phone"] };
      await page.goto(BASE + "/login/");
      await page.getByLabel("Email or mobile number").fill("98765 43210");
      await page.getByRole("button", { name: "Send code" }).click();
      await page.getByText("We sent a 6-digit code to +91 98765 43210").waitFor();
      const sent = srv.last(/\/otp$/).b;
      if (sent.phone !== "+919876543210" || sent.channel !== "sms") throw new Error("otp body " + JSON.stringify(sent));
      await code(page).fill("123456");
      await page.getByRole("button", { name: "Verify" }).click();
      await page.waitForURL(/\/tree\//);
      const v = srv.last(/\/verify$/).b;
      if (v.type !== "sms" || v.phone !== "+919876543210") throw new Error("verify body " + JSON.stringify(v));
      ok("mobile code: number written the Indian way becomes +919876543210, sent as SMS, verified as SMS, signs in (no email needed)");
    }

    // ======================= limits =======================
    {
      const { page, srv } = await fresh();
      await page.goto(BASE + "/login/");
      for (let i = 1; i <= 3; i++) {
        await page.getByLabel("Email or mobile number").fill("98765 43210");
        await page.getByRole("button", { name: "Send code" }).click();
        await page.getByText("We sent a 6-digit code").waitFor();
        await page.getByRole("button", { name: "Use a different email or number" }).click();
      }
      await page.getByLabel("Email or mobile number").fill("+91 98765 43210");
      await page.getByRole("button", { name: "Send code" }).click();
      await alert(page).filter({ hasText: /You already asked for 3 codes. Please wait \d+ minutes?/ }).waitFor();
      if (srv.count(/\/otp$/) !== 3) throw new Error("a 4th request reached the server: " + srv.count(/\/otp$/));
      await shot(page, "4-limit");
      await page.getByLabel("Email or mobile number").fill("98765 11111");
      await page.getByRole("button", { name: "Send code" }).click();
      await page.getByText("We sent a 6-digit code").waitFor();
      ok("request limit: the 4th code for the same number is stopped on the phone (written differently, still the same number) with how long to wait; a different number still works");
    }
    {
      const { page, srv } = await fresh();
      await page.goto(BASE + "/login/");
      await page.getByLabel("Email or mobile number").fill("ravi@example.com");
      await page.getByRole("button", { name: "Send code" }).click();
      for (let i = 1; i <= 5; i++) {
        await code(page).fill("00000" + i);
        await page.getByRole("button", { name: "Verify" }).click();
        await alert(page).filter({ hasText: i < 5 ? `(${5 - i} ${5 - i === 1 ? "try" : "tries"} left)` : "Too many wrong tries" }).waitFor();
      }
      await code(page).fill("123456");
      await page.getByRole("button", { name: "Verify" }).click();
      await alert(page).filter({ hasText: /Please wait \d+ minutes/ }).waitFor();
      if (srv.count(/\/verify$/) !== 5) throw new Error("locked-out attempt still reached the server: " + srv.count(/\/verify$/));
      ok("lockout: 5 wrong codes lock the screen, even the right code is held back, and the server is not hit again");
    }

    // ======================= password =======================
    {
      const { page, srv } = await fresh();
      await page.goto(BASE + "/login/");
      await page.getByRole("button", { name: "Sign in with Email & Password" }).click();
      await page.getByLabel("Email", { exact: true }).fill("ravi@example.com");
      await page.getByLabel("Password", { exact: true }).fill("wrongpass1");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await alert(page).filter({ hasText: "Wrong email or password. Check both and try again. (4 tries left)" }).waitFor();
      await shot(page, "5-wrong-password");
      await page.getByRole("button", { name: "Show" }).click();
      if ((await page.getByLabel("Password", { exact: true }).getAttribute("type")) !== "text") throw new Error("Show does not reveal the password");
      await page.getByLabel("Password", { exact: true }).fill("Pongal2026");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.waitForURL(/\/tree\//);
      ok("password: wrong password gives a plain message that does not say which half was wrong, Show/Hide works, right password signs in");
      void srv;
    }

    // ======================= forgot password (code, not a link) =======================
    {
      const { page, srv } = await fresh();
      await page.goto(BASE + "/login/");
      await page.getByRole("button", { name: "Sign in with Email & Password" }).click();
      await page.getByRole("button", { name: "Forgot password?" }).click();
      await page.getByLabel("Email", { exact: true }).fill("ravi@example.com");
      await page.getByRole("button", { name: "Send reset code" }).click();
      await page.getByText("We sent a 6-digit code to ravi@example.com").waitFor();
      if (srv.count(/\/recover$/) !== 1) throw new Error("reset email not requested");
      await code(page).fill("000000");
      await page.getByRole("button", { name: "Verify" }).click();
      await alert(page).filter({ hasText: "wrong or has expired" }).waitFor();
      await code(page).fill("123456");
      await page.getByRole("button", { name: "Verify" }).click();
      await page.getByText("The code was right. Now choose a new password.").waitFor();
      if (!/login/.test(page.url())) throw new Error("left the login screen before a new password was set");
      if (srv.last(/\/verify$/).b.type !== "recovery") throw new Error("verify type " + srv.last(/\/verify$/).b.type);
      const save = page.getByRole("button", { name: "Save new password" });
      if (!(await save.isDisabled())) throw new Error("Save is enabled with an empty password");
      await page.getByLabel("New password", { exact: true }).fill("abc");
      await page.getByText("At least 8 characters").waitFor();
      if (!(await save.isDisabled())) throw new Error("Save is enabled for a short password");
      await page.getByLabel("New password", { exact: true }).fill("password123");
      if (!(await save.isDisabled())) throw new Error("an easy password was accepted");
      await shot(page, "6-new-password-rules");
      await page.getByLabel("New password", { exact: true }).fill("Pongal2027x");
      await page.getByText("✓ At least 8 characters").waitFor();
      await save.click();
      await page.waitForURL(/\/tree\//);
      const put = srv.last(/\/user$/);
      if (put.m !== "PUT" || put.b.password !== "Pongal2027x") throw new Error("password update " + JSON.stringify(put));
      ok("forgot password: email -> 6-digit code (not a link) -> new password with live rules and a disabled Save until it is strong -> saved, all inside the app");
    }

    // ======================= new account with password =======================
    {
      const { page, srv } = await fresh();
      await page.goto(BASE + "/login/");
      await page.getByRole("button", { name: "Sign in with Email & Password" }).click();
      await page.getByRole("button", { name: "Create a new account" }).click();
      await page.getByLabel("Email", { exact: true }).fill("new@example.com");
      await page.getByLabel("Choose a password").fill("short1");
      const make = page.getByRole("button", { name: "Create account" });
      if (!(await make.isDisabled())) throw new Error("Create account enabled for a weak password");
      await page.getByLabel("Choose a password").fill("Ravinew2026");
      await make.click();
      await page.getByText("We sent a 6-digit code to new@example.com").waitFor();
      if (srv.last(/\/signup$/).b.password !== "Ravinew2026") throw new Error("signup body");
      await code(page).fill("123456");
      await page.getByRole("button", { name: "Verify" }).click();
      await page.waitForURL(/\/tree\//);
      if (srv.last(/\/verify$/).b.type !== "signup") throw new Error("verify type");
      ok("new account: weak password blocked with rules, strong one creates it, email code confirms it");
    }

    // ======================= name step for brand-new mobile users =======================
    {
      const { page, srv } = await fresh();
      srv.account = { email: null, phone: "919812345678", identities: ["phone"], name: "" };
      await page.goto(BASE + "/login/");
      await page.getByLabel("Email or mobile number").fill("9812345678");
      await page.getByRole("button", { name: "Send code" }).click();
      await code(page).fill("123456");
      await page.getByRole("button", { name: "Verify" }).click();
      await page.getByText("What should your family call you?").waitFor();
      ok("a brand-new mobile user (no name, no email) is asked for their name, not dropped into an empty screen");
    }

    // ======================= security settings =======================
    {
      const { page, srv } = await fresh({ signedIn: true });
      srv.account = { email: null, phone: "919876543210", identities: ["phone"], name: "Ravi" };
      await page.goto(BASE + "/security/");
      await page.getByText("How you sign in").waitFor();
      await page.getByText("+91 98765 43210").waitFor();
      await page.getByRole("button", { name: "Link my Google account" }).waitFor();
      await page.getByText("Add your email").waitFor();
      await shot(page, "7-security");
      ok("security page: shows the mobile number already linked, and offers Google and email to add");

      await page.getByRole("button", { name: "Link my Google account" }).click();
      await page.waitForURL(/accounts\.google\.test/);
      const hit = new URL(srv.authorizeHits[0]);
      if (hit.searchParams.get("provider") !== "google" || !hit.searchParams.get("redirect_to")?.endsWith("/auth/callback/")) throw new Error("link request " + hit.search);
      ok("link Google: asks Supabase to link (not sign in) with the right return address, then goes to Google");
    }
    {
      const { page, srv } = await fresh({ signedIn: true });
      srv.account = { email: null, phone: "919876543210", identities: ["phone"], name: "Ravi" };
      await page.goto(BASE + "/security/");
      await page.getByLabel("Add your email").fill("ravi@example.com");
      await page.getByRole("button", { name: "Send code" }).click();
      await page.getByText("We sent a 6-digit code to ravi@example.com").waitFor();
      const put = srv.last(/\/user$/);
      if (put.m !== "PUT" || put.b.email !== "ravi@example.com") throw new Error("email update " + JSON.stringify(put));
      srv.account.email = "ravi@example.com"; // the server confirms it once the code is right
      srv.account.identities = ["phone", "email"];
      await code(page).fill("123456");
      await page.getByRole("button", { name: "Verify" }).click();
      await page.getByText(/^✓\s*ravi@example\.com$/).waitFor();
      if (srv.last(/\/verify$/).b.type !== "email_change") throw new Error("verify type " + srv.last(/\/verify$/).b.type);
      ok("add email: updateUser sends the code, email_change verification links it to the same account");
    }
    {
      const { page, srv } = await fresh({ signedIn: true });
      srv.account = { email: "ravi@example.com", phone: null, identities: ["email"], name: "Ravi" };
      await page.goto(BASE + "/security/");
      await page.getByLabel("Country code").selectOption("91");
      await page.getByLabel("Add your mobile number").fill("98765");
      await page.getByRole("button", { name: "Send code" }).click();
      await alert(page).filter({ hasText: "10 digits" }).waitFor();
      await page.getByLabel("Add your mobile number").fill("98765 43210");
      await page.getByRole("button", { name: "Send code" }).click();
      await page.getByText("We sent a 6-digit code by SMS to +91 98765 43210").waitFor();
      if (srv.last(/\/user$/).b.phone !== "+919876543210") throw new Error("phone update " + JSON.stringify(srv.last(/\/user$/)));
      srv.account.phone = "919876543210";
      await code(page).fill("123456");
      await page.getByRole("button", { name: "Verify" }).click();
      await page.getByText("+91 98765 43210").waitFor();
      if (srv.last(/\/verify$/).b.type !== "phone_change") throw new Error("verify type");
      ok("add mobile: SMS code, phone_change verification, number shown as linked");
    }
    {
      const { page, srv } = await fresh({ signedIn: true });
      await page.goto(BASE + "/security/");
      await page.getByRole("button", { name: "Set or change password" }).click();
      await page.getByLabel("New password", { exact: true }).fill("Pongal2028x");
      await page.getByLabel("Type it again").fill("Pongal2028y");
      await page.getByText("The two passwords are not the same yet.").waitFor();
      if (!(await page.getByRole("button", { name: "Save password" }).isDisabled())) throw new Error("Save enabled with mismatch");
      await page.getByLabel("Type it again").fill("Pongal2028x");
      await page.getByRole("button", { name: "Save password" }).click();
      await page.getByText("Password saved ✓").waitFor();
      if (srv.last(/\/user$/).b.password !== "Pongal2028x") throw new Error("password body");
      await page.getByRole("button", { name: "Set or change password" }).click();
      await page.getByLabel("New password", { exact: true }).fill(srv.goodPassword);
      await page.getByLabel("Type it again").fill(srv.goodPassword);
      await page.getByRole("button", { name: "Save password" }).click();
      await alert(page).filter({ hasText: "password you have not used before".replace("password you have not used before", "not used before") }).waitFor();
      ok("password: both boxes must match, saved when strong, reusing the old one is explained");
    }
    {
      const { page, srv } = await fresh({ signedIn: true });
      await page.goto(BASE + "/security/");
      await page.getByText("App Lock is available in the Nammoor Android app.").waitFor();
      page.once("dialog", (d) => d.dismiss());
      await page.getByRole("button", { name: "Log out of all other devices" }).click();
      if (srv.count(/\/logout$/) !== 0) throw new Error("signed out without asking");
      page.once("dialog", (d) => d.accept());
      await page.getByRole("button", { name: "Log out of all other devices" }).click();
      await page.getByText("Signed out everywhere else ✓").waitFor();
      if (srv.last(/\/logout$/).q.scope !== "others") throw new Error("scope " + srv.last(/\/logout$/).q.scope);
      await shot(page, "8-devices");
      ok("other devices: asks first, then signs out with scope=others (this phone stays in); App Lock explains it is for the Android app");
      page.once("dialog", (d) => d.accept());
      await page.getByRole("button", { name: "Sign out of this phone" }).click();
      await page.waitForURL(/\/login\//);
    }

    if (errors.length) throw new Error("Page errors:\n" + errors.join("\n"));
    console.log("\nAUTH + SECURITY UI TEST PASSED");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error("\nAUTH TEST FAILED:", e.message);
  process.exit(1);
});
