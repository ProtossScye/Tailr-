import { describe, expect, it } from "vitest";
import { deleteMyAccount, type DeleteAccountDeps } from "./delete";

function setup(over: Partial<DeleteAccountDeps> = {}) {
  const calls: string[] = [];
  const deps: DeleteAccountDeps = {
    currentUser: async () => (calls.push("currentUser"), { id: "user-1", email: "ada@example.com" }),
    passwordIsRight: async (email, password) => (calls.push(`password:${email}:${password}`), password === "correct horse"),
    deleteUser: async (id) => void calls.push(`delete:${id}`),
    ...over,
  };
  return { deps, calls };
}
const input = (over: Partial<{ confirm: unknown; password: unknown }> = {}) => ({ confirm: "DELETE", password: "correct horse", ...over });

describe("deleteMyAccount", () => {
  it("deletes the signed-in person's account after the word and the password are right", async () => {
    const { deps, calls } = setup();
    expect(await deleteMyAccount(deps, input())).toEqual({ ok: true });
    expect(calls).toEqual(["currentUser", "password:ada@example.com:correct horse", "delete:user-1"]);
  });

  it("accepts the confirmation word in any case, with spaces around it", async () => {
    for (const confirm of ["delete", "  Delete ", "DELETE"]) {
      const { deps, calls } = setup();
      expect(await deleteMyAccount(deps, input({ confirm }))).toEqual({ ok: true });
      expect(calls).toContain("delete:user-1");
    }
  });

  it("does nothing, not even a password check, when the word is wrong or missing", async () => {
    for (const confirm of ["", "del", "DELETE ME", "yes", undefined, null, 5]) {
      const { deps, calls } = setup();
      const r = await deleteMyAccount(deps, input({ confirm }));
      expect(r, String(confirm)).toMatchObject({ ok: false });
      expect((r as { error: string }).error).toMatch(/DELETE/);
      expect(calls, String(confirm)).toEqual([]);
    }
  });

  it("does not delete with a wrong or empty password", async () => {
    for (const password of ["wrong", "", undefined, null, 5]) {
      const { deps, calls } = setup();
      const r = await deleteMyAccount(deps, input({ password }));
      expect(r, String(password)).toMatchObject({ ok: false });
      expect((r as { error: string }).error).toMatch(/password/i);
      expect(calls.some((c) => c.startsWith("delete:")), String(password)).toBe(false);
    }
  });

  it("does not delete when nobody is signed in", async () => {
    const { deps, calls } = setup({ currentUser: async () => null });
    expect(await deleteMyAccount(deps, input())).toMatchObject({ ok: false, error: expect.stringMatching(/sign in/i) });
    expect(calls).toEqual([]);
  });

  it("deletes only the account it checked the password for", async () => {
    const { deps, calls } = setup({ currentUser: async () => ({ id: "user-7", email: "bayo@example.com" }) });
    await deleteMyAccount(deps, input());
    expect(calls).toEqual(["password:bayo@example.com:correct horse", "delete:user-7"]);
  });

  it("reports a failed deletion without exposing the error", async () => {
    const { deps } = setup({ deleteUser: async () => Promise.reject(new Error("postgres://secret@host refused")) });
    const r = await deleteMyAccount(deps, input());
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toMatch(/could not delete/i);
    expect((r as { error: string }).error).not.toMatch(/secret|postgres/);
  });

  it("reports a failed password check the same way as a wrong password, without deleting", async () => {
    const { deps, calls } = setup({ passwordIsRight: async () => Promise.reject(new Error("network")) });
    const r = await deleteMyAccount(deps, input());
    expect(r).toMatchObject({ ok: false });
    expect(calls.some((c) => c.startsWith("delete:"))).toBe(false);
  });

  it("says deletion is not switched on when it cannot be done on this server", async () => {
    const { deps, calls } = setup({ deleteUser: null });
    const r = await deleteMyAccount(deps, input());
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/not switched on/i) });
    expect(calls).toEqual([]);
  });
});
