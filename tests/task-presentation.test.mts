import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const user = "fixture-user";
const org = "fixture-org";
const statuses = ["todo", "doing", "waiting", "review", "done", "cancelled"];
const labels = ["Te doen", "Bezig", "Wachten", "Review", "Afgerond", "Geannuleerd"];
const tasks = statuses.map((status, index) => ({
  id: status, title: `TESTFIXTURE ${status}`, status, priority: "normal", due_at: null,
  completed_at: null, deleted_at: null, organization_id: org, created_by: user,
  project_id: null, projects: null, description: null,
  task_assignees: [{ user_id: index === 2 ? "other" : user, profiles: null }],
}));
tasks.push({ ...tasks[0], id: "unassigned", title: "TESTFIXTURE unassigned", task_assignees: [] });

function fixture() {
  const queries: string[] = [];
  const client = { from(table: string) {
    queries.push(table);
    const filters: ((row: Record<string, unknown>) => boolean)[] = [];
    let single = false;
    const query: Record<string, unknown> = {
      select: () => query, order: () => query,
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
      is: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
      in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
      not: (key: string, operator: string, value: string) => {
        assert.equal(operator, "in");
        filters.push(row => !value.slice(1, -1).split(",").includes(String(row[key]))); return query;
      },
      maybeSingle: () => { single = true; return query; },
      then: (resolve: (value: unknown) => unknown) => {
        let rows: Record<string, unknown>[] = [];
        if (table === "tasks") rows = tasks;
        if (table === "task_assignees") rows = tasks.flatMap(task => task.task_assignees.map(assignee => ({ task_id: task.id, user_id: assignee.user_id })));
        const data = rows.filter(row => filters.every(filter => filter(row)));
        return Promise.resolve({ data: single ? data[0] ?? null : data, error: null }).then(resolve);
      },
    };
    return query;
  } };
  const shell = ({ children }: { children: React.ReactNode }) => React.createElement("main", null, children);
  const modulePage = ({ children, resultCount }: { children: React.ReactNode; resultCount: number }) => React.createElement("section", { "data-results": resultCount }, children);
  const noAction = () => { throw Error("No writes allowed in local presentation tests"); };
  function load(path: string): Record<string, unknown> {
    const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const mod = { exports: {} as Record<string, unknown> };
    runInNewContext(code, { module: mod, exports: mod.exports, URLSearchParams, Date, require: (id: string) => {
      if (id === "@/lib/task-status") return load("src/lib/task-status.ts");
      if (id === "@/lib/format") return load("src/lib/format.ts");
      if (id === "@/lib/auth-context") return { requireActiveMembership: async () => ({ supabase: client, user: { id: user }, membership: { organization_id: org, role: "admin" } }) };
      if (id === "@/lib/supabase/configured") return { isSupabaseConfigured: () => true };
      if (id === "@/lib/demo-data") return { demoDashboard: { tasks: [] } };
      if (id === "@/lib/campaign-pilot") return { campaignWorkflowEnabled: () => false };
      if (id === "@/components/dossier-editor-gate") return { dossierEditorGate: async () => null };
      if (id === "@/components/app-shell") return { AppShell: shell };
      if (id === "@/components/module-page") return { ModulePage: modulePage };
      if (id === "@/components/saved-views") return { SavedViews: () => null };
      if (id === "@/components/comments") return { Comments: () => null };
      if (id === "@/components/markdown-field") return { MarkdownContent: shell };
      if (id === "@/components/record-connections-panel") return { RecordConnectionsPanel: () => null };
      if (id === "@/lib/dossier-relations") return { loadDossierConnections: async () => [], loadRelationOptions: async () => [] };
      if (id === "@/lib/permissions") return { hasPermission: () => true };
      if (id === "next/navigation") return { notFound: () => { throw Error("Not found"); } };
      if (id === "next/link") return { __esModule: true, default: ({ children, ...props }: { children: React.ReactNode }) => React.createElement("a", props, children) };
      if (id === "../actions") return { updateTaskStatus: noAction };
      if (id === "./actions") return { addChecklistItem: noAction, deleteTask: noAction, setTaskAssignee: noAction, toggleChecklistItem: noAction };
      return require(id);
    } });
    return mod.exports;
  }
  return { load, queries };
}

type Page = (props: { searchParams: Promise<Record<string, string>>; params?: Promise<{ id: string }> }) => Promise<React.ReactNode>;
async function list(params: Record<string, string> = {}) {
  const f = fixture();
  const page = f.load("src/app/app/taken/page.tsx").default as Page;
  const dom = new JSDOM(renderToStaticMarkup(await page({ searchParams: Promise.resolve(params) })));
  return { dom, f };
}

test("already doing tasks have no Start form, while completion and other transitions remain", async () => {
  const { dom } = await list();
  try {
    for (const status of statuses) {
      const article = dom.window.document.querySelector(`a[href='/app/taken/${status}']`)!.closest("article")!;
      const buttons = [...article.querySelectorAll("button")].map(button => button.textContent);
      assert.equal(buttons.includes("Start"), !["doing", "done", "cancelled"].includes(status));
      const targets = [...article.querySelectorAll("input[name=status]")].map(input => input.getAttribute("value"));
      assert.deepEqual(targets, status === "doing" ? ["done"] : ["done", "cancelled"].includes(status) ? ["todo", "todo"] : ["done", "doing"]);
      assert.equal(article.querySelector(".badge")?.textContent, labels[statuses.indexOf(status)]);
    }
  } finally { dom.window.close(); }
});

test("personal open destination includes only assigned open tasks and no history", async () => {
  const { dom, f } = await list({ van_mij: "1", weergave: "open" });
  try {
    assert.deepEqual([...dom.window.document.querySelectorAll("a.task-link")].map(link => link.getAttribute("href")), ["/app/taken/todo", "/app/taken/doing", "/app/taken/review"]);
    assert.equal(dom.window.document.querySelector("[data-results]")?.getAttribute("data-results"), "3");
    assert.equal(dom.window.document.querySelector(".completed-section"), null);
    assert.ok(f.queries.includes("task_assignees"));
  } finally { dom.window.close(); }
});

test("details render the Dutch name for every supported task status", async () => {
  for (const [index, status] of statuses.entries()) {
    const page = fixture().load("src/app/app/taken/[id]/page.tsx").default as Page;
    const dom = new JSDOM(renderToStaticMarkup(await page({ params: Promise.resolve({ id: status }), searchParams: Promise.resolve({}) })));
    try { assert.equal(dom.window.document.querySelector(".project-actions .badge")?.textContent, labels[index]); }
    finally { dom.window.close(); }
  }
});
