import { describe, expect, it } from "vitest";
import { isAuthCallback, NATIVE_REDIRECT, parseAuthCallback } from "./google";

describe("sign-in return link", () => {
  it("reads the code from the app link", () => {
    expect(parseAuthCallback(`${NATIVE_REDIRECT}?code=abc123-DEF_456`)).toEqual({ code: "abc123-DEF_456", error: null });
  });
  it("reads the code from the website link", () => {
    expect(parseAuthCallback("https://nammoor.example/auth/callback/?code=0a1b2c3d-4e5f")).toEqual({ code: "0a1b2c3d-4e5f", error: null });
  });
  it("reports a refusal with the reason", () => {
    const r = parseAuthCallback(`${NATIVE_REDIRECT}?error=access_denied&error_description=User+cancelled+the+sign+in`);
    expect(r).toEqual({ code: null, error: "User cancelled the sign in" });
  });
  it("finds an error after the #", () => {
    expect(parseAuthCallback(`${NATIVE_REDIRECT}#error=server_error&error_description=Unable+to+exchange`).error).toBe("Unable to exchange");
  });
  it("an error wins even if a code is present", () => {
    expect(parseAuthCallback(`${NATIVE_REDIRECT}?code=abcdef&error=access_denied`)).toMatchObject({ code: null });
  });
  it("rejects missing, odd or oversized codes", () => {
    expect(parseAuthCallback(NATIVE_REDIRECT).code).toBeNull();
    expect(parseAuthCallback(`${NATIVE_REDIRECT}?code=<script>`).code).toBeNull();
    expect(parseAuthCallback(`${NATIVE_REDIRECT}?code=${"a".repeat(500)}`).code).toBeNull();
    expect(parseAuthCallback(`${NATIVE_REDIRECT}?code=`).error).toMatch(/no code/);
  });
  it("does not throw on garbage", () => {
    expect(parseAuthCallback("not a url").error).toMatch(/not valid/);
  });
  it("only our own link counts", () => {
    expect(isAuthCallback(`${NATIVE_REDIRECT}?code=abcdef`)).toBe(true);
    expect(isAuthCallback("com.evil.app://auth/callback?code=abcdef")).toBe(false);
    expect(isAuthCallback("https://nammoor.example/auth/callback/")).toBe(false);
  });
});
