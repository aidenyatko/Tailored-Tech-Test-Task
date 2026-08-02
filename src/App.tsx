import * as Dialog from "@radix-ui/react-dialog";
import * as Select from "@radix-ui/react-select";
import * as Tabs from "@radix-ui/react-tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import {
  ChevronDown,
  ChevronRight,
  Database,
  Eye,
  FileText,
  Folder,
  Home,
  LogOut,
  Maximize2,
  MoveRight,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { ChangeEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  createDataroom,
  createFolder,
  deleteDataroom,
  deleteItem,
  fileContentUrl,
  getStoredToken,
  listAccess,
  listDatarooms,
  listItems,
  listUsers,
  login,
  me,
  moveItem,
  renameDataroom,
  renameItem,
  storeToken,
  updateAccess,
  uploadFiles
} from "./api/client";
import type { Dataroom, DataroomItem, DataroomRole, FileItem } from "./api/types";
import { formatBytes, formatDateTime } from "./lib/format";

type DialogState =
  | { type: "create-dataroom" }
  | { type: "rename-dataroom"; dataroom: Dataroom }
  | { type: "delete-dataroom"; dataroom: Dataroom }
  | { type: "create-folder" }
  | { type: "rename-item"; item: DataroomItem }
  | { type: "delete-item"; item: DataroomItem }
  | { type: "move-item"; item: DataroomItem }
  | null;

type Notice = { tone: "success" | "error"; message: string } | null;

export function App() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState(() => getStoredToken());
  const [selectedDataroomId, setSelectedDataroomId] = useState<string | null>(null);
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  const meQuery = useQuery({
    queryKey: ["me", token],
    queryFn: () => me(token ?? ""),
    enabled: Boolean(token),
    retry: false
  });

  const dataroomsQuery = useQuery({
    queryKey: ["datarooms", token],
    queryFn: () => listDatarooms(token ?? ""),
    enabled: Boolean(token)
  });

  const datarooms = dataroomsQuery.data?.datarooms ?? [];
  const selectedDataroom = datarooms.find((room) => room.id === selectedDataroomId) ?? datarooms[0] ?? null;
  const activeDataroomId = selectedDataroom?.id ?? null;

  const allItemsQuery = useQuery({
    queryKey: ["items", token, activeDataroomId, ""],
    queryFn: () => listItems(token ?? "", activeDataroomId ?? ""),
    enabled: Boolean(token && activeDataroomId)
  });

  const visibleItemsQuery = useQuery({
    queryKey: ["items", token, activeDataroomId, searchQuery],
    queryFn: () => listItems(token ?? "", activeDataroomId ?? "", searchQuery),
    enabled: Boolean(token && activeDataroomId)
  });

  const allItems = useMemo(() => allItemsQuery.data?.items ?? [], [allItemsQuery.data?.items]);
  const serverVisibleItems = useMemo(() => visibleItemsQuery.data?.items ?? [], [visibleItemsQuery.data?.items]);
  const visibleItems = searchQuery.trim()
    ? serverVisibleItems
    : serverVisibleItems.filter((item) => item.parentId === currentParentId);
  const selectedFile = allItems.find((item): item is FileItem => item.id === selectedFileId && item.type === "FILE") ?? null;
  const currentUser = meQuery.data?.user ?? null;
  const canEdit = selectedDataroom?.role === "OWNER" || selectedDataroom?.role === "EDITOR";
  const canManageAccess = selectedDataroom?.role === "OWNER";
  const breadcrumbs = useMemo(() => buildBreadcrumbs(allItems, currentParentId), [allItems, currentParentId]);
  const fileUrl = selectedFile && token ? fileContentUrl(selectedFile.id, token) : null;

  const refreshWorkspace = async () => {
    await queryClient.invalidateQueries({ queryKey: ["datarooms"] });
    await queryClient.invalidateQueries({ queryKey: ["items"] });
    await queryClient.invalidateQueries({ queryKey: ["access"] });
  };

  const runMutation = <T, TVariables = void>(operation: (variables: TVariables) => Promise<T>, successMessage: string) => ({
    mutationFn: operation,
    onSuccess: async () => {
      setNotice({ tone: "success", message: successMessage });
      setDialog(null);
      await refreshWorkspace();
    },
    onError: (error: Error) => setNotice({ tone: "error", message: error.message })
  });

  const loginMutation = useMutation({
    mutationFn: (payload: { email: string; password: string }) => login(payload.email, payload.password),
    onSuccess: async (payload) => {
      storeToken(payload.token);
      setToken(payload.token);
      setNotice({ tone: "success", message: `Signed in as ${payload.user.name}.` });
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => setNotice({ tone: "error", message: error.message })
  });

  const createRoomMutation = useMutation(runMutation((name: string) => createDataroom(token ?? "", name), "Data room created."));
  const renameRoomMutation = useMutation(runMutation(
    (name: string) => renameDataroom(token ?? "", dialog?.type === "rename-dataroom" ? dialog.dataroom.id : "", name),
    "Data room renamed."
  ));
  const deleteRoomMutation = useMutation(runMutation(
    () => deleteDataroom(token ?? "", dialog?.type === "delete-dataroom" ? dialog.dataroom.id : ""),
    "Data room deleted."
  ));
  const createFolderMutation = useMutation(runMutation(
    (name: string) => createFolder(token ?? "", activeDataroomId ?? "", currentParentId, name),
    "Folder created."
  ));
  const renameItemMutation = useMutation(runMutation(
    (name: string) => renameItem(token ?? "", dialog?.type === "rename-item" ? dialog.item.id : "", name),
    "Item renamed."
  ));
  const deleteItemMutation = useMutation(runMutation(
    () => deleteItem(token ?? "", dialog?.type === "delete-item" ? dialog.item.id : ""),
    "Item deleted."
  ));

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (!activeDataroomId || files.length === 0) {
      return;
    }

    try {
      await uploadFiles(token ?? "", activeDataroomId, currentParentId, files);
      setNotice({ tone: "success", message: files.length === 1 ? "PDF uploaded." : "PDF files uploaded." });
      await refreshWorkspace();
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Upload failed." });
    }
  }

  function handleLogout() {
    storeToken(null);
    setToken(null);
    setSelectedDataroomId(null);
    setCurrentParentId(null);
    setSelectedFileId(null);
    void queryClient.clear();
  }

  if (!token || !currentUser) {
    return <LoginScreen notice={notice} onLogin={(email, password) => loginMutation.mutate({ email, password })} />;
  }

  return (
    <main className="min-h-screen bg-void text-ghost">
      <div className="grid min-h-screen grid-cols-[280px_1fr] max-lg:grid-cols-1">
        <aside className="border-r border-neon-yellow/20 bg-panel/95 p-4 shadow-panel max-lg:border-b max-lg:border-r-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-neon-yellow">Acme Corp.</p>
              <h1 className="mt-1 text-xl font-semibold">Data Room</h1>
              <p className="mt-1 text-xs text-ghost/60">{currentUser.name}</p>
            </div>
            <IconButton label="Sign out" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </IconButton>
          </div>

          <button className="mt-6 w-full rounded-sm bg-neon-yellow px-4 py-2 text-sm font-black text-black hover:bg-neon-lime" onClick={() => setDialog({ type: "create-dataroom" })} type="button">
            <Plus className="mr-2 inline h-4 w-4" />
            New data room
          </button>

          <div className="mt-5 space-y-1">
            {datarooms.map((room) => (
              <button
                className={classNames(
                  "flex w-full items-center gap-3 rounded-sm border px-3 py-2 text-left text-sm transition",
                  selectedDataroom?.id === room.id
                    ? "border-neon-yellow bg-neon-yellow/10 text-neon-yellow"
                    : "border-transparent text-ghost/75 hover:border-neon-cyan/40 hover:bg-neon-cyan/5 hover:text-ghost"
                )}
                key={room.id}
                onClick={() => {
                  setSelectedDataroomId(room.id);
                  setCurrentParentId(null);
                  setSelectedFileId(null);
                }}
                type="button"
              >
                <Database className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{room.name}</span>
                <RoleBadge role={room.role} />
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-w-0 flex-col">
          <header className="border-b border-neon-yellow/20 bg-panel px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1 text-sm text-ghost/60">
                  <button className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-neon-cyan hover:bg-neon-cyan/10" onClick={() => setCurrentParentId(null)} type="button">
                    <Home className="h-4 w-4" />
                    My Drive
                  </button>
                  {breadcrumbs.map((folder) => (
                    <span className="inline-flex items-center gap-1" key={folder.id}>
                      <ChevronRight className="h-4 w-4" />
                      <button className="rounded-sm px-2 py-1 text-neon-cyan hover:bg-neon-cyan/10" onClick={() => setCurrentParentId(folder.id)} type="button">
                        {folder.name}
                      </button>
                    </span>
                  ))}
                </div>
                <h2 className="mt-2 truncate text-2xl font-semibold">{selectedDataroom?.name ?? "No data room selected"}</h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="relative w-[320px] max-sm:w-full">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neon-cyan" />
                  <input className="h-10 w-full rounded-sm border border-neon-cyan/30 bg-void pl-9 pr-9 text-sm outline-none focus:border-neon-yellow" onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search names and PDF contents" value={searchQuery} />
                  {searchQuery ? (
                    <button aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-ghost/60" onClick={() => setSearchQuery("")} type="button">
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </label>
                {canManageAccess ? (
                  <AccessPanel dataroomId={activeDataroomId} token={token} />
                ) : null}
                <button className="rounded-sm border border-neon-cyan/30 px-3 py-2 text-sm font-semibold text-neon-cyan disabled:opacity-40" disabled={!canEdit} onClick={() => setDialog({ type: "create-folder" })} type="button">
                  <Folder className="mr-2 inline h-4 w-4" />
                  New folder
                </button>
                <button className="rounded-sm bg-neon-yellow px-3 py-2 text-sm font-black text-black disabled:opacity-40" disabled={!canEdit} onClick={() => fileInputRef.current?.click()} type="button">
                  <Upload className="mr-2 inline h-4 w-4" />
                  Upload PDF
                </button>
                <input accept="application/pdf" className="sr-only" data-testid="pdf-upload" multiple onChange={(event) => void handleUpload(event)} ref={fileInputRef} type="file" />
              </div>
            </div>

            {notice ? (
              <div className={classNames("mt-3 border px-3 py-2 text-sm", notice.tone === "error" ? "border-danger bg-danger/10 text-red-200" : "border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan")} role="status">
                {notice.message}
              </div>
            ) : null}
          </header>

          <div className="grid flex-1 min-h-0 grid-cols-[1fr_340px] max-xl:grid-cols-1">
            <section className="min-w-0 p-5">
              <DriveTable
                canEdit={canEdit}
                items={visibleItems}
                onDelete={(item) => setDialog({ type: "delete-item", item })}
                onMove={(item) => setDialog({ type: "move-item", item })}
                onOpen={(item) => {
                  if (item.type === "FOLDER") {
                    setCurrentParentId(item.id);
                    setSelectedFileId(null);
                    setSearchQuery("");
                    return;
                  }

                  setSelectedFileId(item.id);
                }}
                onRename={(item) => setDialog({ type: "rename-item", item })}
                selectedFileId={selectedFileId}
              />
            </section>

            <aside className="border-l border-neon-yellow/20 bg-panel p-5 max-xl:border-l-0 max-xl:border-t">
              <Tabs.Root defaultValue="details">
                <Tabs.List className="grid grid-cols-2 border border-neon-cyan/20">
                  <Tabs.Trigger className="px-3 py-2 text-sm data-[state=active]:bg-neon-cyan/15 data-[state=active]:text-neon-cyan" value="details">Details</Tabs.Trigger>
                  <Tabs.Trigger className="px-3 py-2 text-sm data-[state=active]:bg-neon-cyan/15 data-[state=active]:text-neon-cyan" value="access">Access</Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content className="mt-5" value="details">
                  {selectedFile && fileUrl ? (
                    <div>
                      <div className="grid h-12 w-12 place-items-center bg-neon-yellow text-black">
                        <FileText className="h-6 w-6" />
                      </div>
                      <h3 className="mt-4 break-words text-lg font-semibold">{selectedFile.name}</h3>
                      <dl className="mt-5 space-y-4 text-sm">
                        <Detail label="Type" value="PDF document" />
                        <Detail label="Size" value={formatBytes(selectedFile.size)} />
                        <Detail label="Updated" value={formatDateTime(selectedFile.updatedAt)} />
                      </dl>
                      <button className="mt-5 w-full rounded-sm bg-neon-yellow px-4 py-2 text-sm font-black text-black" onClick={() => setViewerOpen(true)} type="button">
                        <Maximize2 className="mr-2 inline h-4 w-4" />
                        Open in data room viewer
                      </button>
                      <iframe className="mt-4 h-[360px] w-full border border-neon-cyan/25 bg-black" src={fileUrl} title={`PDF preview for ${selectedFile.name}`} />
                    </div>
                  ) : (
                    <EmptyPanel>Select a PDF file to preview it here.</EmptyPanel>
                  )}
                </Tabs.Content>
                <Tabs.Content className="mt-5" value="access">
                  {selectedDataroom ? (
                    <div className="space-y-3 text-sm">
                      <Detail label="Your role" value={selectedDataroom.role.toLowerCase()} />
                      <Detail label="Owner" value={selectedDataroom.owner?.name ?? "Owner"} />
                      <p className="leading-6 text-ghost/60">
                        Owners manage access. Editors can change folders and files. Viewers can only read and preview.
                      </p>
                    </div>
                  ) : (
                    <EmptyPanel>No data room selected.</EmptyPanel>
                  )}
                </Tabs.Content>
              </Tabs.Root>
            </aside>
          </div>
        </section>
      </div>

      <NameDialog
        dialog={dialog}
        folders={allItems.filter((item) => item.type === "FOLDER")}
        onCancel={() => setDialog(null)}
        onConfirm={(value, parentId) => {
          if (dialog?.type === "create-dataroom") createRoomMutation.mutate(value);
          if (dialog?.type === "rename-dataroom") renameRoomMutation.mutate(value);
          if (dialog?.type === "delete-dataroom") deleteRoomMutation.mutate();
          if (dialog?.type === "create-folder") createFolderMutation.mutate(value);
          if (dialog?.type === "rename-item") renameItemMutation.mutate(value);
          if (dialog?.type === "delete-item") deleteItemMutation.mutate();
          if (dialog?.type === "move-item") {
            void moveItem(token, dialog.item.id, parentId).then(refreshWorkspace).then(() => {
              setDialog(null);
              setNotice({ tone: "success", message: "Item moved." });
            }).catch((error: Error) => setNotice({ tone: "error", message: error.message }));
          }
        }}
      />

      <Dialog.Root onOpenChange={setViewerOpen} open={viewerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/80" />
          <Dialog.Content className="fixed inset-4 z-50 grid grid-rows-[auto_1fr] border border-neon-yellow bg-void shadow-panel">
            <div className="flex items-center justify-between border-b border-neon-yellow/30 px-4 py-3">
              <Dialog.Title className="truncate text-base font-semibold">{selectedFile?.name}</Dialog.Title>
              <Dialog.Close className="grid h-8 w-8 place-items-center text-neon-yellow"><X className="h-5 w-5" /></Dialog.Close>
            </div>
            {fileUrl ? <iframe className="h-full w-full bg-black" src={fileUrl} title="Full window PDF viewer" /> : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}

function LoginScreen({ notice, onLogin }: { notice: Notice; onLogin: (email: string, password: string) => void }) {
  const [email, setEmail] = useState("owner@acme.test");
  const [password, setPassword] = useState("owner123");

  return (
    <main className="grid min-h-screen place-items-center bg-void p-6 text-ghost">
      <form className="w-full max-w-md border border-neon-yellow/30 bg-panel p-6 shadow-panel" onSubmit={(event) => { event.preventDefault(); onLogin(email, password); }}>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-neon-yellow">Cyber Data Room</p>
        <h1 className="mt-2 text-2xl font-semibold">Sign in</h1>
        <label className="mt-6 block text-sm">
          Email
          <input className="mt-2 h-10 w-full border border-neon-cyan/30 bg-void px-3 outline-none focus:border-neon-yellow" onChange={(event) => setEmail(event.target.value)} value={email} />
        </label>
        <label className="mt-4 block text-sm">
          Password
          <input className="mt-2 h-10 w-full border border-neon-cyan/30 bg-void px-3 outline-none focus:border-neon-yellow" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
        </label>
        <button className="mt-6 w-full bg-neon-yellow px-4 py-2 font-black text-black" type="submit">Sign in</button>
        <div className="mt-5 text-xs leading-6 text-ghost/60">
          Demo accounts: owner@acme.test / owner123, editor@acme.test / editor123, viewer@acme.test / viewer123.
        </div>
        {notice ? <div className="mt-4 border border-danger bg-danger/10 p-3 text-sm text-red-200">{notice.message}</div> : null}
      </form>
    </main>
  );
}

function DriveTable(props: {
  items: DataroomItem[];
  selectedFileId: string | null;
  canEdit: boolean;
  onOpen: (item: DataroomItem) => void;
  onRename: (item: DataroomItem) => void;
  onMove: (item: DataroomItem) => void;
  onDelete: (item: DataroomItem) => void;
}) {
  const table = useReactTable({
    data: props.items,
    columns: [
      {
        header: "Name",
        accessorKey: "name",
        cell: ({ row }) => {
          const item = row.original;
          return (
            <button className="flex min-w-0 items-center gap-3 text-left" onClick={() => props.onOpen(item)} type="button">
              <span className="grid h-9 w-9 shrink-0 place-items-center bg-neon-cyan/10 text-neon-cyan">
                {item.type === "FOLDER" ? <Folder className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
              </span>
              <span className="truncate font-semibold">{item.name}</span>
            </button>
          );
        }
      },
      { header: "Type", cell: ({ row }) => (row.original.type === "FOLDER" ? "Folder" : "PDF") },
      { header: "Updated", cell: ({ row }) => formatDateTime(row.original.updatedAt) },
      {
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            {props.canEdit ? (
              <>
                <IconButton label={`Rename ${row.original.name}`} onClick={() => props.onRename(row.original)}><Pencil className="h-4 w-4" /></IconButton>
                <IconButton label={`Move ${row.original.name}`} onClick={() => props.onMove(row.original)}><MoveRight className="h-4 w-4" /></IconButton>
                <IconButton danger label={`Delete ${row.original.name}`} onClick={() => props.onDelete(row.original)}><Trash2 className="h-4 w-4" /></IconButton>
              </>
            ) : (
              <Eye className="h-4 w-4 text-neon-cyan" />
            )}
          </div>
        )
      }
    ],
    getCoreRowModel: getCoreRowModel()
  });

  if (props.items.length === 0) {
    return <div className="grid min-h-[360px] place-items-center border border-neon-cyan/20 bg-panel text-ghost/60">No files or folders here.</div>;
  }

  return (
    <div className="overflow-hidden border border-neon-cyan/20 bg-panel">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-void text-left text-xs uppercase tracking-[0.16em] text-neon-yellow">
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th className="px-4 py-3 font-black" key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-neon-cyan/10">
          {table.getRowModel().rows.map((row) => (
            <tr className={classNames("hover:bg-neon-cyan/5", props.selectedFileId === row.original.id ? "bg-neon-yellow/10" : "")} key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td className="px-4 py-3" key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccessPanel({ dataroomId, token }: { dataroomId: string | null; token: string }) {
  const queryClient = useQueryClient();
  const usersQuery = useQuery({ queryKey: ["users", token], queryFn: () => listUsers(token), enabled: Boolean(dataroomId) });
  const accessQuery = useQuery({ queryKey: ["access", token, dataroomId], queryFn: () => listAccess(token, dataroomId ?? ""), enabled: Boolean(dataroomId) });
  const records = accessQuery.data?.access ?? [];
  const users = usersQuery.data?.users ?? [];

  const mutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: DataroomRole | null }) => updateAccess(token, dataroomId ?? "", userId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["access"] })
  });

  return (
    <Dialog.Root>
      <Dialog.Trigger className="rounded-sm border border-neon-yellow/40 px-3 py-2 text-sm font-semibold text-neon-yellow" type="button">
        <Shield className="mr-2 inline h-4 w-4" />
        Access
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[520px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 border border-neon-yellow bg-panel p-5 shadow-panel">
          <Dialog.Title className="text-lg font-semibold">Manage data room access</Dialog.Title>
          <div className="mt-5 space-y-3">
            {users.map((user) => {
              const record = records.find((candidate) => candidate.userId === user.id);
              return (
                <div className="grid grid-cols-[1fr_160px] items-center gap-3 border border-neon-cyan/20 p-3" key={user.id}>
                  <div>
                    <p className="font-semibold">{user.name}</p>
                    <p className="text-xs text-ghost/60">{user.email}</p>
                  </div>
                  <RoleSelect disabled={record?.role === "OWNER"} role={record?.role ?? null} onChange={(role) => mutation.mutate({ userId: user.id, role })} />
                </div>
              );
            })}
          </div>
          <Dialog.Close className="mt-5 rounded-sm bg-neon-yellow px-4 py-2 text-sm font-black text-black">Done</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RoleSelect({ disabled, role, onChange }: { disabled: boolean; role: DataroomRole | null; onChange: (role: DataroomRole | null) => void }) {
  return (
    <Select.Root disabled={disabled} onValueChange={(value) => onChange(value === "NONE" ? null : (value as DataroomRole))} value={role ?? "NONE"}>
      <Select.Trigger className="flex h-9 items-center justify-between border border-neon-cyan/30 bg-void px-3 text-sm">
        <Select.Value />
        <Select.Icon><ChevronDown className="h-4 w-4" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="z-50 border border-neon-cyan/40 bg-panel text-ghost shadow-panel">
          <Select.Viewport>
            {["NONE", "VIEWER", "EDITOR", "OWNER"].map((value) => (
              <Select.Item className="cursor-pointer px-3 py-2 text-sm outline-none hover:bg-neon-cyan/10 data-[disabled]:opacity-40" disabled={value === "OWNER" && role !== "OWNER"} key={value} value={value}>
                <Select.ItemText>{value.toLowerCase()}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

function NameDialog(props: {
  dialog: DialogState;
  folders: DataroomItem[];
  onCancel: () => void;
  onConfirm: (value: string, parentId: string | null) => void;
}) {
  const [value, setValue] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const needsInput = props.dialog && !props.dialog.type.startsWith("delete") && props.dialog.type !== "move-item";

  useEffect(() => {
    if (props.dialog?.type === "rename-dataroom") setValue(props.dialog.dataroom.name);
    else if (props.dialog?.type === "rename-item") setValue(props.dialog.item.name);
    else if (props.dialog?.type === "create-folder") setValue("New Folder");
    else setValue("");
    setParentId(null);
  }, [props.dialog]);

  return (
    <Dialog.Root onOpenChange={(open) => !open && props.onCancel()} open={Boolean(props.dialog)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[440px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 border border-neon-yellow bg-panel p-5 shadow-panel">
          <Dialog.Title className="text-lg font-semibold">{dialogTitle(props.dialog)}</Dialog.Title>
          {props.dialog?.type === "move-item" ? (
            <label className="mt-5 block text-sm">
              Destination
              <select className="mt-2 h-10 w-full border border-neon-cyan/30 bg-void px-3" onChange={(event) => setParentId(event.target.value || null)} value={parentId ?? ""}>
                <option value="">My Drive root</option>
                {props.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
              </select>
            </label>
          ) : null}
          {needsInput ? (
            <label className="mt-5 block text-sm">
              Name
              <input className="mt-2 h-10 w-full border border-neon-cyan/30 bg-void px-3" onChange={(event) => setValue(event.target.value)} value={value} />
            </label>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close className="border border-neon-cyan/30 px-4 py-2 text-sm" type="button">Cancel</Dialog.Close>
            <button className="bg-neon-yellow px-4 py-2 text-sm font-black text-black" onClick={() => props.onConfirm(value, parentId)} type="button">
              {props.dialog?.type?.startsWith("delete") ? "Delete" : props.dialog?.type === "move-item" ? "Move" : "Save"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RoleBadge({ role }: { role: DataroomRole }) {
  return <span className="rounded-sm border border-neon-yellow/30 px-1.5 py-0.5 text-[10px] font-black uppercase text-neon-yellow">{role}</span>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-black uppercase tracking-[0.14em] text-neon-yellow">{label}</dt>
      <dd className="mt-1 break-words text-ghost">{value}</dd>
    </div>
  );
}

function EmptyPanel({ children }: { children: ReactNode }) {
  return <div className="border border-dashed border-neon-cyan/30 bg-void p-4 text-sm leading-6 text-ghost/60">{children}</div>;
}

function IconButton({ children, danger = false, label, onClick }: { children: ReactNode; danger?: boolean; label: string; onClick: () => void }) {
  return (
    <button aria-label={label} className={classNames("grid h-8 w-8 place-items-center border transition", danger ? "border-danger/40 text-red-300 hover:bg-danger/10" : "border-neon-cyan/25 text-neon-cyan hover:bg-neon-cyan/10")} onClick={onClick} title={label} type="button">
      {children}
    </button>
  );
}

function buildBreadcrumbs(items: DataroomItem[], parentId: string | null) {
  const result: DataroomItem[] = [];
  let currentId = parentId;

  while (currentId) {
    const item = items.find((candidate) => candidate.id === currentId);
    if (!item) break;
    result.unshift(item);
    currentId = item.parentId;
  }

  return result;
}

function dialogTitle(dialog: DialogState) {
  if (!dialog) return "";
  if (dialog.type === "create-dataroom") return "Create data room";
  if (dialog.type === "rename-dataroom") return "Rename data room";
  if (dialog.type === "delete-dataroom") return "Delete data room";
  if (dialog.type === "create-folder") return "Create folder";
  if (dialog.type === "rename-item") return "Rename item";
  if (dialog.type === "move-item") return "Move item";
  return "Delete item";
}

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
