# Google sign-in setup (Nammoor)

How it works: the app opens Google in the phone's browser, Google sends the person to **Supabase**,
and Supabase sends them back to the app at `com.nammoor.app://auth/callback`. Google itself only
ever talks to Supabase, so you need a **Web** OAuth client. **No Android SHA-1 is needed** for this
flow. (SHA-1 is only for the other method, the native Google account picker. See the end.)

## A. Google Cloud Console (once)

1. Go to https://console.cloud.google.com and pick or create a project (e.g. "Nammoor").
2. **APIs & Services > OAuth consent screen**
   - User type: **External**. App name: **Nammoor**. Support email: yours.
   - Scopes: add `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` (the defaults).
   - **Authorized domain:** `supabase.co`
   - While in "Testing", only emails you list under **Test users** can sign in. Add yourself and testers.
     Click **Publish app** before real users (the basic scopes need no Google review).
3. **APIs & Services > Credentials > Create credentials > OAuth client ID**
   - Application type: **Web application**. Name: `Nammoor web`.
   - **Authorized JavaScript origins:** leave empty (or add your website address once it is hosted).
   - **Authorized redirect URIs (exactly this one):**
     `https://ijvisbjyhkpifhyltrxk.supabase.co/auth/v1/callback`
   - Create. Copy the **Client ID** and **Client secret**.

## B. Supabase dashboard (once)

1. **Authentication > Sign In / Providers > Google**: switch **Enable** on, paste the Client ID and
   Client secret, save.
2. **Authentication > URL Configuration**
   - **Site URL:** your hosted website address (e.g. `https://yourname.netlify.app`). Until the site
     is hosted, leave it as is. The Android app does not use it.
   - **Redirect URLs** (add all that apply):
     - `com.nammoor.app://auth/callback`  <- the Android app. **Required.**
     - `https://YOUR-SITE/auth/callback/`  <- the website, after you host it (keep the trailing `/`).
     - `http://localhost:3000/auth/callback/`  <- only if you run the site on your computer.

## C. Check it

1. Install the new APK, tap **Continue with Google**, choose an account.
2. A browser tab opens, you pick the account, and the app comes back and opens your family tree.
3. If you see "redirect_uri_mismatch": the URI in step A.3 is not exactly the one above.
4. If you see "Access blocked: app has not completed verification": add your email under Test users
   (step A.2) or publish the app.
5. If it returns to the app but shows an error: the redirect URL in step B.2 is missing or has a typo.

## Android SHA-1 (only for native Google sign-in, which Nammoor does not use yet)

Not needed now. If we later switch to the native account picker you will create an **Android** OAuth
client with package `com.nammoor.app` and this SHA-1 (the pinned debug key in `android/app/debug.keystore`):

    37:74:97:51:04:FF:3D:72:8F:AD:3A:FF:BB:C9:F0:DE:97:C6:04:DD

A Play Store release build is signed with a different key, so it will have its own SHA-1.
Get a key's SHA-1 with: `keytool -list -v -keystore KEYSTORE -alias ALIAS`
