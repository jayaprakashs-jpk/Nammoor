import { describe, expect, it } from "vitest";
import type { GPerson } from "@/shared/lib/graph";
import { suggestKeep } from "./keep";

const P = (id: string, o: Partial<GPerson> = {}): GPerson => ({ id, name: id, nick: null, g: "male", dob: null, dobp: "unknown", ord: null, alive: true, dod: null, photo: null, uid: null, mgr: null, state: null, ...o });

describe("suggestKeep", () => {
  it("the person with an account stays", () => expect(suggestKeep(P("a"), P("b", { uid: "u" })).keep.id).toBe("b"));
  it("the fuller card stays", () => expect(suggestKeep(P("a"), P("b", { photo: "x", np: "Salem" })).keep.id).toBe("b"));
  it("a tie keeps the first", () => expect(suggestKeep(P("a"), P("b")).keep.id).toBe("a"));
  it("the account beats a fuller card", () => expect(suggestKeep(P("a", { photo: "x", np: "y", nt: "z" }), P("b", { uid: "u" })).keep.id).toBe("b"));
});
