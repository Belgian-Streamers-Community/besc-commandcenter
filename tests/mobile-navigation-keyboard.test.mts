import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);

test("mobiele navigatie sluit met Escape en behoudt passende focus", async (t) => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost/app/taken" });
  const replacements = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true };
  const original = Object.fromEntries(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, value, writable: true });
  let pathname = "/app/taken";
  const loadedModule = { exports: {} as { PersistentAppShell: React.ComponentType<{ initialData: object }> } };
  const compiled = ts.transpileModule(readFileSync("src/components/persistent-app-shell.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(compiled, { module: loadedModule, exports: loadedModule.exports, require: (name: string) => {
    if (name === "next/navigation") return { usePathname: () => pathname };
    if (name === "next/link") return { default: (props: object) => React.createElement("a", props) };
    if (name === "next/image") return { default: ({ priority, ...props }: { priority?: boolean }) => { void priority; return React.createElement("img", props); } };
    if (name === "@/app/auth/actions") return { signOut: () => { throw Error("No auth action allowed in this fixture"); } };
    if (name === "@/components/global-search-trigger") return { GlobalSearchTrigger: () => React.createElement("button", {
      "data-search": true, onKeyDown: (event: React.KeyboardEvent) => { if (event.key === "Escape") event.preventDefault(); },
    }, "Zoeken") };
    return require(name);
  } });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const data = { membershipRole: "admin", financeRole: "none", name: "TESTFIXTURE", role: "Admin", theme: "dark", canManageTickets: false, canManageDiscordBot: false };
  try {
    await act(async () => root.render(React.createElement(loadedModule.exports.PersistentAppShell, { initialData: data })));
    const menu = dom.window.document.querySelector<HTMLDetailsElement>(".mobile-navigation")!;
    const summary = menu.querySelector("summary")!;
    const key = async (target: Element, value: string) => {
      await act(async () => target.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })));
    };
    await t.test("Escape vanaf menuknop sluit", async () => {
      menu.open = true; summary.focus(); await key(summary, "Escape");
      assert.equal(menu.open, false); assert.equal(dom.window.document.activeElement, summary);
    });
    await t.test("Escape vanaf menulink brengt focus terug", async () => {
      menu.open = true; const link = menu.querySelector<HTMLAnchorElement>("a")!; link.focus(); await key(link, "Escape");
      assert.equal(menu.open, false); assert.equal(dom.window.document.activeElement, summary);
    });
    await t.test("andere toetsen sluiten het menu niet", async () => {
      menu.open = true; await key(summary, "ArrowDown"); assert.equal(menu.open, true);
    });
    await t.test("een onderliggende bediening kan Escape zelf afhandelen", async () => {
      menu.open = true; const search = menu.querySelector<HTMLButtonElement>("[data-search]")!; search.focus(); await key(search, "Escape");
      assert.equal(menu.open, true); assert.equal(dom.window.document.activeElement, search);
    });
    await t.test("gesloten menu onderschept Escape niet", async () => {
      menu.open = false;
      const event = new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
      summary.dispatchEvent(event); assert.equal(event.defaultPrevented, false);
    });
    await t.test("navigatie naar een andere pagina sluit nog steeds", async () => {
      menu.open = true; pathname = "/app/projecten";
      await act(async () => root.render(React.createElement(loadedModule.exports.PersistentAppShell, { initialData: data })));
      assert.equal(menu.open, false);
    });
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const key of Object.keys(replacements)) {
      if (original[key]) Object.defineProperty(globalThis, key, original[key]!);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
