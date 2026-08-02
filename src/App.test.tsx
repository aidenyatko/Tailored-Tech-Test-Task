import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { Dataroom, DataroomItem, User } from "./api/types";

const owner: User = { id: "user-owner", email: "owner@acme.test", name: "Olivia Owner" };
let datarooms: Dataroom[];
let items: DataroomItem[];

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    datarooms = [
      {
        id: "room-1",
        name: "Acme Deal",
        ownerId: owner.id,
        owner,
        role: "OWNER",
        createdAt: "2026-08-02T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z"
      }
    ];
    items = [];
    vi.stubGlobal("fetch", vi.fn(mockFetch));
  });

  it("signs in and shows accessible data rooms with roles", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect((await screen.findAllByText("Acme Deal")).length).toBeGreaterThan(0);
    expect(await screen.findByText("OWNER")).toBeInTheDocument();
    expect(await screen.findByText("Olivia Owner")).toBeInTheDocument();
  });

  it("creates a folder through the API workspace", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await user.click(await screen.findByRole("button", { name: "New folder" }));
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Legal");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Legal")).toBeInTheDocument();
  });

  it("searches by indexed PDF contents", async () => {
    const user = userEvent.setup();
    items = [
      {
        id: "file-1",
        dataroomId: "room-1",
        parentId: null,
        type: "FILE",
        name: "Report.pdf",
        mimeType: "application/pdf",
        size: 12,
        blobKey: "report.pdf",
        searchText: "material revenue contract",
        createdAt: "2026-08-02T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z"
      }
    ];
    renderApp();

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await user.type(await screen.findByPlaceholderText("Search names and PDF contents"), "revenue");

    expect(await screen.findByText("Report.pdf")).toBeInTheDocument();
  });
});

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
}

async function mockFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(String(input), "http://localhost");
  const method = init?.method ?? "GET";

  if (url.pathname === "/api/auth/login" && method === "POST") {
    return json({ token: "test-token", user: owner });
  }

  if (url.pathname === "/api/auth/me") {
    return json({ user: owner });
  }

  if (url.pathname === "/api/users") {
    return json({ users: [owner] });
  }

  if (url.pathname === "/api/datarooms" && method === "GET") {
    return json({ datarooms });
  }

  if (url.pathname === "/api/datarooms/room-1/items" && method === "GET") {
    const query = url.searchParams.get("q")?.toLowerCase() ?? "";
    const filtered = query
      ? items.filter((item) => `${item.name} ${item.type === "FILE" ? item.searchText : ""}`.toLowerCase().includes(query))
      : items;
    return json({ items: filtered });
  }

  if (url.pathname === "/api/datarooms/room-1/folders" && method === "POST") {
    const body = JSON.parse(String(init?.body));
    const item: DataroomItem = {
      id: "folder-1",
      dataroomId: "room-1",
      parentId: body.parentId ?? null,
      type: "FOLDER",
      name: body.name,
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z"
    };
    items.push(item);
    return json({ item }, 201);
  }

  return json({ error: { message: `Unhandled ${method} ${url.pathname}` } }, 404);
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
