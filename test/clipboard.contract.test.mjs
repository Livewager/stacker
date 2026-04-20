/**
 * clipboard (useCopyable) contract tests.
 *
 * Same scope cut as prefs.contract.test.mjs: mirror the contract
 * without React so we can verify the shape via node:test without
 * jsdom / RTL. Any refactor of src/lib/clipboard.ts that breaks
 * these assertions has to update the mirror in lockstep — that's
 * the point.
 *
 * Run: `node --test test/clipboard.contract.test.mjs` (or `npm test`).
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";

// ------------------------------------------------------------------
// Contract under test — mirrors useCopyable's pure behaviour path.
// React-specific parts (the hook wrapping, useCallback deps) are not
// tested here; they're thin wrappers. The behaviour matrix below is
// everything that can actually regress.
// ------------------------------------------------------------------
function makeCopy({ nav, toast }) {
  return async (value, opts = {}) => {
    const { label = "Text", silent = false, errorTitle = "Clipboard blocked" } = opts;
    if (!value) {
      toast.push({ kind: "error", title: "Nothing to copy" });
      return false;
    }
    try {
      if (!nav || !nav.clipboard || typeof nav.clipboard.writeText !== "function") {
        throw new Error("clipboard API unavailable");
      }
      await nav.clipboard.writeText(value);
      if (!silent) {
        toast.push({ kind: "success", title: `${label} copied` });
      }
      return true;
    } catch {
      toast.push({ kind: "error", title: errorTitle });
      return false;
    }
  };
}

// Tiny collector. Captures every push call so each test can assert
// the full sequence of toasts produced by a single copy invocation.
function makeToast() {
  const pushed = [];
  return {
    push: (t) => pushed.push(t),
    _pushed: pushed,
  };
}

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

test("empty value: error toast + false, no clipboard call", async () => {
  const writes = [];
  const nav = {
    clipboard: {
      writeText: async (v) => {
        writes.push(v);
      },
    },
  };
  const toast = makeToast();
  const copy = makeCopy({ nav, toast });
  const ok = await copy("");
  assert.equal(ok, false);
  assert.deepEqual(writes, []);
  assert.equal(toast._pushed.length, 1);
  assert.equal(toast._pushed[0].kind, "error");
  assert.equal(toast._pushed[0].title, "Nothing to copy");
});

test("happy path: writes text, success toast, returns true", async () => {
  const writes = [];
  const nav = {
    clipboard: {
      writeText: async (v) => {
        writes.push(v);
      },
    },
  };
  const toast = makeToast();
  const copy = makeCopy({ nav, toast });
  const ok = await copy("hello", { label: "Principal" });
  assert.equal(ok, true);
  assert.deepEqual(writes, ["hello"]);
  assert.equal(toast._pushed.length, 1);
  assert.equal(toast._pushed[0].kind, "success");
  assert.equal(toast._pushed[0].title, "Principal copied");
});

test("default label: falls back to 'Text copied'", async () => {
  const nav = { clipboard: { writeText: async () => {} } };
  const toast = makeToast();
  const copy = makeCopy({ nav, toast });
  await copy("hi");
  assert.equal(toast._pushed[0].title, "Text copied");
});

test("silent: success toast suppressed, returns true", async () => {
  const nav = { clipboard: { writeText: async () => {} } };
  const toast = makeToast();
  const copy = makeCopy({ nav, toast });
  const ok = await copy("x", { silent: true });
  assert.equal(ok, true);
  assert.equal(toast._pushed.length, 0);
});

test("silent + failure: error toast still fires, returns false", async () => {
  const nav = {
    clipboard: {
      writeText: async () => {
        throw new Error("blocked by permissions");
      },
    },
  };
  const toast = makeToast();
  const copy = makeCopy({ nav, toast });
  const ok = await copy("x", { silent: true });
  assert.equal(ok, false);
  assert.equal(toast._pushed.length, 1);
  assert.equal(toast._pushed[0].kind, "error");
});

test("clipboard API unavailable: error toast + false", async () => {
  // No navigator.clipboard (SSR / legacy / insecure context).
  const nav = {};
  const toast = makeToast();
  const copy = makeCopy({ nav, toast });
  const ok = await copy("hi");
  assert.equal(ok, false);
  assert.equal(toast._pushed.length, 1);
  assert.equal(toast._pushed[0].kind, "error");
  assert.equal(toast._pushed[0].title, "Clipboard blocked");
});

test("custom errorTitle: used in failure toast", async () => {
  const nav = {
    clipboard: {
      writeText: async () => {
        throw new Error("no");
      },
    },
  };
  const toast = makeToast();
  const copy = makeCopy({ nav, toast });
  await copy("v", { errorTitle: "Couldn't copy principal" });
  assert.equal(toast._pushed[0].title, "Couldn't copy principal");
});

test("writeText rejects: no crash, error toast, returns false", async () => {
  const nav = {
    clipboard: {
      writeText: () => Promise.reject(new Error("denied")),
    },
  };
  const toast = makeToast();
  const copy = makeCopy({ nav, toast });
  const ok = await copy("x");
  assert.equal(ok, false);
  assert.equal(toast._pushed[0].kind, "error");
});

test("sequence: three successful copies emit three success toasts in order", async () => {
  const writes = [];
  const nav = {
    clipboard: {
      writeText: async (v) => {
        writes.push(v);
      },
    },
  };
  const toast = makeToast();
  const copy = makeCopy({ nav, toast });
  await copy("a", { label: "Alpha" });
  await copy("b", { label: "Beta" });
  await copy("c", { label: "Gamma" });
  assert.deepEqual(writes, ["a", "b", "c"]);
  assert.deepEqual(
    toast._pushed.map((t) => t.title),
    ["Alpha copied", "Beta copied", "Gamma copied"],
  );
});
