import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { AccessRecord, Dataroom, DataroomItem, User } from "./api/types";

const owner: User = { id: "user-owner", email: "owner@acme.test", name: "Olivia Owner" };
const viewer: User = { id: "user-viewer", email: "viewer@acme.test", name: "Val Viewer" };
let datarooms: Dataroom[];
let items: DataroomItem[];
let accessRecords: AccessRecord[];
let users: User[];
let currentUser: User;

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    datarooms = [
      {
        id: "room-1",
        name: "Acme Deal",
        ownerId: owner.id,
        publicRole: null,
        owner,
        role: "OWNER",
        createdAt: "2026-08-02T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z"
      }
    ];
    items = [];
    accessRecords = [
      {
        id: "access-owner",
        dataroomId: "room-1",
        userId: owner.id,
        role: "OWNER",
        user: owner
      }
    ];
    users = [owner, viewer];
    currentUser = owner;
    vi.stubGlobal("fetch", vi.fn(mockFetch));
  });

  it("signs in and shows accessible data rooms with roles", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect((await screen.findAllByText("Acme Deal")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("OWNER")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Olivia Owner")).length).toBeGreaterThan(0);
  });

  it("opens access management from the selected data room panel", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await user.click(await screen.findByRole("button", { name: "Manage" }));

    expect(await screen.findByRole("dialog", { name: "Manage data room access" })).toBeInTheDocument();
    expect(await screen.findByText("Val Viewer")).toBeInTheDocument();
  });

  it("creates a user from the login screen", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Create a new user" }));
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Nina New");
    await user.type(screen.getByLabelText("Email"), "nina@example.test");
    await user.type(screen.getByLabelText("Password"), "nina123");
    await user.click(screen.getByRole("button", { name: "Create user" }));

    expect(await screen.findByText("Nina New")).toBeInTheDocument();
  });

  it("filters users in the access dialog", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await user.click(await screen.findByRole("button", { name: "Manage" }));
    const dialog = await screen.findByRole("dialog", { name: "Manage data room access" });

    await user.type(within(dialog).getByPlaceholderText("Search users"), "Val");

    expect(within(dialog).getByText("Val Viewer")).toBeInTheDocument();
    expect(within(dialog).queryByText("Olivia Owner")).not.toBeInTheDocument();
  });

  it("enables public access from the access dialog", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await user.click(await screen.findByRole("button", { name: "Manage" }));
    const dialog = await screen.findByRole("dialog", { name: "Manage data room access" });
    const publicRoleSelect = within(dialog).getAllByRole("combobox")[0];

    await user.click(publicRoleSelect);
    await user.click(await screen.findByRole("option", { name: "viewer" }));

    expect(await screen.findByText("Everyone")).toBeInTheDocument();
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
    await user.type(await screen.findByPlaceholderText("Search in data room"), "revenue");

    expect(await screen.findByText("Report.pdf")).toBeInTheDocument();
  });

  it("filters files and folders by type", async () => {
    const user = userEvent.setup();
    items = [
      folderItem("folder-1", "Legal"),
      pdfItem("file-1", "Resume.pdf")
    ];
    renderApp();

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await user.selectOptions(await screen.findByLabelText("Type"), "FILE");

    expect(await screen.findByText("Resume.pdf")).toBeInTheDocument();
    expect(screen.queryByText("Legal")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Type"), "FOLDER");

    expect(await screen.findByText("Legal")).toBeInTheDocument();
    expect(screen.queryByText("Resume.pdf")).not.toBeInTheDocument();
  });

  it("sorts rows by name", async () => {
    const user = userEvent.setup();
    items = [
      pdfItem("file-1", "Backend.pdf"),
      pdfItem("file-2", "Web.pdf")
    ];
    renderApp();

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(tableRows()[0]).toContain("Backend.pdf");

    await user.click(await screen.findByRole("button", { name: "Name" }));

    expect(tableRows()[0]).toContain("Web.pdf");
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
    currentUser = owner;
    return json({ token: "test-token", user: owner });
  }

  if (url.pathname === "/api/auth/register" && method === "POST") {
    const body = JSON.parse(String(init?.body));
    const user: User = { id: "user-new", email: body.email, name: body.name };
    users.push(user);
    currentUser = user;
    return json({ token: "new-token", user }, 201);
  }

  if (url.pathname === "/api/auth/me") {
    return json({ user: currentUser });
  }

  if (url.pathname === "/api/users") {
    return json({ users });
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

  if (url.pathname === "/api/datarooms/room-1/access" && method === "GET") {
    return json({ access: accessRecords });
  }

  if (url.pathname === "/api/datarooms/room-1/public-access" && method === "PUT") {
    const body = JSON.parse(String(init?.body));
    datarooms = datarooms.map((dataroom) => dataroom.id === "room-1" ? { ...dataroom, publicRole: body.role } : dataroom);
    return json({ dataroom: datarooms[0] });
  }

  if (url.pathname === "/api/datarooms/room-1/access/user-viewer" && method === "PUT") {
    const body = JSON.parse(String(init?.body));
    accessRecords = accessRecords.filter((record) => record.userId !== viewer.id);

    if (body.role) {
      accessRecords.push({
        id: "access-viewer",
        dataroomId: "room-1",
        userId: viewer.id,
        role: body.role,
        user: viewer
      });
    }

    return json({ access: accessRecords });
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

function folderItem(id: string, name: string): DataroomItem {
  return {
    id,
    dataroomId: "room-1",
    parentId: null,
    type: "FOLDER",
    name,
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z"
  };
}

function pdfItem(id: string, name: string): DataroomItem {
  return {
    id,
    dataroomId: "room-1",
    parentId: null,
    type: "FILE",
    name,
    mimeType: "application/pdf",
    size: 12,
    blobKey: `${id}.pdf`,
    searchText: name.toLowerCase(),
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z"
  };
}

function tableRows() {
  return Array.from(document.querySelectorAll("tbody tr")).map((row) => row.textContent ?? "");
}
