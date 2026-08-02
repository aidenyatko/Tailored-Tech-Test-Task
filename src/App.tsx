import * as Dialog from "@radix-ui/react-dialog";
import * as Select from "@radix-ui/react-select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Database,
  Eye,
  FileText,
  Folder,
  Grid3X3,
  HardDrive,
  Home,
  Info,
  List,
  LogOut,
  Maximize2,
  MoveRight,
  Pencil,
  Plus,
  Search,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X
} from "lucide-react";
import { ChangeEvent, MouseEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
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
import type { AccessRecord, Dataroom, DataroomItem, DataroomRole, FileItem } from "./api/types";
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
type ContextMenuState = { x: number; y: number; dataroom: Dataroom } | null;

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
  const [accessDialogOpen, setAccessDialogOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, [contextMenu]);

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
  const canEdit = selectedDataroom?.role === "OWNER" || selectedDataroom?.role === "EDITOR";
  const canManageAccess = selectedDataroom?.role === "OWNER";

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

  const accessQuery = useQuery({
    queryKey: ["access", token, activeDataroomId],
    queryFn: () => listAccess(token ?? "", activeDataroomId ?? ""),
    enabled: Boolean(token && activeDataroomId && canManageAccess)
  });

  const usersQuery = useQuery({
    queryKey: ["users", token],
    queryFn: () => listUsers(token ?? ""),
    enabled: Boolean(token && accessDialogOpen && canManageAccess)
  });

  const allItems = useMemo(() => allItemsQuery.data?.items ?? [], [allItemsQuery.data?.items]);
  const serverVisibleItems = useMemo(() => visibleItemsQuery.data?.items ?? [], [visibleItemsQuery.data?.items]);
  const visibleItems = searchQuery.trim()
    ? serverVisibleItems
    : serverVisibleItems.filter((item) => item.parentId === currentParentId);
  const selectedFile = allItems.find((item): item is FileItem => item.id === selectedFileId && item.type === "FILE") ?? null;
  const currentFolder = currentParentId ? allItems.find((item) => item.id === currentParentId) ?? null : null;
  const selectedAddress = useMemo(
    () => buildAddress(
      selectedDataroom,
      allItems,
      selectedFile?.parentId ?? currentParentId,
      selectedFile,
      () => {
        setCurrentParentId(null);
        setSelectedFileId(null);
      },
      (folderId) => {
        setCurrentParentId(folderId);
        setSelectedFileId(null);
      }
    ),
    [allItems, currentParentId, selectedDataroom, selectedFile]
  );
  const currentUser = meQuery.data?.user ?? null;
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
  const accessMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: DataroomRole | null }) => updateAccess(token ?? "", activeDataroomId ?? "", userId, role),
    onSuccess: async () => {
      setNotice({ tone: "success", message: "Access updated." });
      await queryClient.invalidateQueries({ queryKey: ["access"] });
    },
    onError: (error: Error) => setNotice({ tone: "error", message: error.message })
  });

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

  function selectDataroom(room: Dataroom) {
    setSelectedDataroomId(room.id);
    setCurrentParentId(null);
    setSelectedFileId(null);
    setSearchQuery("");
  }

  function openDataroomContextMenu(event: MouseEvent, room: Dataroom) {
    event.preventDefault();
    selectDataroom(room);
    setContextMenu({ x: event.clientX, y: event.clientY, dataroom: room });
  }

  if (!token || !currentUser) {
    return <LoginScreen notice={notice} onLogin={(email, password) => loginMutation.mutate({ email, password })} />;
  }

  return (
    <main className="min-h-screen bg-void text-ghost">
      <div className="flex min-h-screen flex-col">
        <TopBar currentUserName={currentUser.name} onLogout={handleLogout} searchQuery={searchQuery} setSearchQuery={setSearchQuery} />

        <div className="grid flex-1 grid-cols-[248px_minmax(0,1fr)] max-lg:grid-cols-1">
          <aside className="bg-panel/80 px-3 py-4 max-lg:hidden">
            <button className="mb-5 flex h-14 items-center gap-3 rounded-3xl bg-neon-yellow px-5 text-sm font-black text-black shadow-panel hover:bg-neon-lime" onClick={() => setDialog({ type: "create-dataroom" })} type="button">
              <Plus className="h-5 w-5" />
              Create
            </button>

            <nav className="space-y-1 text-sm">
              <SideNavItem active icon={<Users className="h-5 w-5" />} label="Available to me" />
              <SideNavItem icon={<Home className="h-5 w-5" />} label="My drive" />
              <SideNavItem icon={<HardDrive className="h-5 w-5" />} label="Computers" />
              <SideNavItem icon={<Sparkles className="h-5 w-5" />} label="Starred" />
            </nav>

            <div className="mt-6 border-t border-neon-cyan/15 pt-4">
              <p className="px-3 text-xs font-black uppercase tracking-[0.16em] text-neon-yellow">Data rooms</p>
              <div className="mt-3 space-y-1">
                {datarooms.map((room) => (
                  <button
                    className={classNames(
                      "group flex w-full items-center gap-3 rounded-3xl px-3 py-2 text-left text-sm transition",
                      selectedDataroom?.id === room.id
                        ? "bg-neon-yellow/15 text-neon-yellow"
                        : "text-ghost/75 hover:bg-neon-cyan/10 hover:text-ghost"
                    )}
                    key={room.id}
                    onClick={() => selectDataroom(room)}
                    onContextMenu={(event) => openDataroomContextMenu(event, room)}
                    type="button"
                  >
                    <Database className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{room.name}</span>
                    <RoleBadge role={room.role} />
                  </button>
                ))}
              </div>
            </div>

            <StorageMeter />
          </aside>

          <section className="min-w-0 p-4 pl-0 max-lg:p-3">
            <div className="grid h-full min-h-[calc(100vh-88px)] grid-cols-[minmax(0,1fr)_340px] overflow-hidden rounded-[32px] border border-neon-cyan/15 bg-panel shadow-panel max-2xl:grid-cols-[minmax(0,1fr)_310px] max-xl:grid-cols-1">
              <div className="min-w-0 bg-void/35">
                <section className="border-b border-neon-cyan/15 px-5 py-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-sm text-ghost/60">
                        {selectedAddress.map((part, index) => (
                          <span className="inline-flex min-w-0 items-center gap-2" key={`${part.kind}-${part.id ?? "root"}-${index}`}>
                            {index > 0 ? <ChevronRight className="h-4 w-4 shrink-0 text-ghost/35" /> : null}
                            {part.clickable ? (
                              <button className="truncate rounded-2xl px-2 py-1 text-neon-cyan hover:bg-neon-cyan/10" onClick={part.onClick} type="button">
                                {part.label}
                              </button>
                            ) : (
                              <span className="truncate rounded-2xl px-2 py-1 text-ghost">{part.label}</span>
                            )}
                          </span>
                        ))}
                      </div>

                      <div className="mt-3 flex min-w-0 items-center gap-3">
                        <h1 className="truncate text-2xl font-semibold">{selectedDataroom?.name ?? "No data room selected"}</h1>
                        {selectedDataroom ? <ChevronDown className="h-5 w-5 text-ghost/45" /> : null}
                        {selectedDataroom ? <Users className="h-5 w-5 text-neon-cyan" /> : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button className="grid h-10 w-10 place-items-center rounded-full bg-neon-cyan/15 text-neon-cyan" title="List view" type="button">
                        <List className="h-5 w-5" />
                      </button>
                      <button className="grid h-10 w-10 place-items-center rounded-full border border-neon-cyan/20 text-ghost/70" title="Grid view" type="button">
                        <Grid3X3 className="h-5 w-5" />
                      </button>
                      <button className="grid h-10 w-10 place-items-center rounded-full border border-neon-cyan/20 text-ghost/70" title="Details" type="button">
                        <Info className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    {currentParentId ? (
                      <button className="rounded-full border border-neon-cyan/30 px-4 py-2 text-sm font-semibold text-neon-cyan hover:bg-neon-cyan/10" onClick={() => {
                        setCurrentParentId(currentFolder?.parentId ?? null);
                        setSelectedFileId(null);
                      }} type="button">
                        <ArrowLeft className="mr-2 inline h-4 w-4" />
                        Back
                      </button>
                    ) : null}
                    <FilterButton label="Type" />
                    <FilterButton label="People" />
                    <FilterButton label="Modified" />
                    <FilterButton label="Source" />
                    <button className="ml-auto rounded-full border border-neon-cyan/30 px-4 py-2 text-sm font-semibold text-neon-cyan disabled:opacity-40 max-md:ml-0" disabled={!canEdit} onClick={() => setDialog({ type: "create-folder" })} type="button">
                      <Folder className="mr-2 inline h-4 w-4" />
                      New folder
                    </button>
                    <button className="rounded-full bg-neon-yellow px-4 py-2 text-sm font-black text-black disabled:opacity-40" disabled={!canEdit} onClick={() => fileInputRef.current?.click()} type="button">
                      <Upload className="mr-2 inline h-4 w-4" />
                      Upload PDF
                    </button>
                    <input accept="application/pdf" className="sr-only" data-testid="pdf-upload" multiple onChange={(event) => void handleUpload(event)} ref={fileInputRef} type="file" />
                  </div>

                  {notice ? (
                    <div className={classNames("mt-4 rounded-2xl border px-4 py-3 text-sm", notice.tone === "error" ? "border-danger bg-danger/10 text-red-200" : "border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan")} role="status">
                      {notice.message}
                    </div>
                  ) : null}
                </section>

                <section className="p-5">
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
                    ownerName={selectedDataroom?.owner?.name ?? currentUser.name}
                    selectedFileId={selectedFileId}
                  />
                </section>
              </div>

              <AccessFrame
                access={accessQuery.data?.access ?? []}
                canManageAccess={canManageAccess}
                dataroom={selectedDataroom}
                fileUrl={fileUrl}
                isLoading={accessQuery.isLoading}
                onManage={() => setAccessDialogOpen(true)}
                onOpenViewer={() => setViewerOpen(true)}
                selectedFile={selectedFile}
                userName={currentUser.name}
                userRole={selectedDataroom?.role ?? null}
              />
            </div>
          </section>
        </div>
      </div>

      {contextMenu ? (
        <DataroomContextMenu
          canManageAccess={contextMenu.dataroom.role === "OWNER"}
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onDelete={() => {
            setDialog({ type: "delete-dataroom", dataroom: contextMenu.dataroom });
            setContextMenu(null);
          }}
          onManageAccess={() => {
            setAccessDialogOpen(true);
            setContextMenu(null);
          }}
          onRename={() => {
            setDialog({ type: "rename-dataroom", dataroom: contextMenu.dataroom });
            setContextMenu(null);
          }}
        />
      ) : null}

      <AccessDialog
        access={accessQuery.data?.access ?? []}
        isOpen={accessDialogOpen}
        isPending={accessMutation.isPending}
        onClose={() => setAccessDialogOpen(false)}
        onRoleChange={(userId, role) => accessMutation.mutate({ userId, role })}
        users={usersQuery.data?.users ?? []}
      />

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
          <Dialog.Content className="fixed inset-4 z-50 grid grid-rows-[auto_1fr] overflow-hidden rounded-[28px] border border-neon-yellow bg-void shadow-panel">
            <div className="flex items-center justify-between border-b border-neon-yellow/30 px-4 py-3">
              <Dialog.Title className="truncate text-base font-semibold">{selectedFile?.name}</Dialog.Title>
              <Dialog.Close className="grid h-9 w-9 place-items-center rounded-full text-neon-yellow hover:bg-neon-yellow/10"><X className="h-5 w-5" /></Dialog.Close>
            </div>
            {fileUrl ? <iframe className="h-full w-full bg-black" src={fileUrl} title="Full window PDF viewer" /> : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}

function TopBar(props: {
  currentUserName: string;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  onLogout: () => void;
}) {
  return (
    <header className="grid h-16 grid-cols-[248px_minmax(0,720px)_1fr] items-center gap-4 bg-panel/80 px-3 max-lg:grid-cols-[1fr_auto]">
      <div className="flex items-center gap-3 px-1">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-neon-yellow text-black">
          <HardDrive className="h-6 w-6" />
        </div>
        <div>
          <p className="text-xl font-semibold leading-none">Drive</p>
          <p className="mt-1 text-xs text-neon-cyan">Cyber room</p>
        </div>
      </div>

      <label className="relative max-lg:hidden">
        <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-ghost/60" />
        <input
          className="h-12 w-full rounded-full border border-neon-cyan/10 bg-ghost/10 pl-14 pr-12 text-sm text-ghost outline-none transition placeholder:text-ghost/55 focus:border-neon-yellow focus:bg-void"
          onChange={(event) => props.setSearchQuery(event.target.value)}
          placeholder="Search in data room"
          value={props.searchQuery}
        />
        <Settings className="pointer-events-none absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 text-ghost/50" />
      </label>

      <div className="flex items-center justify-end gap-3">
        <div className="hidden rounded-full bg-neon-cyan/10 px-4 py-2 text-sm text-neon-cyan sm:block">{props.currentUserName}</div>
        <IconButton label="Sign out" onClick={props.onLogout}>
          <LogOut className="h-4 w-4" />
        </IconButton>
      </div>
    </header>
  );
}

function LoginScreen({ notice, onLogin }: { notice: Notice; onLogin: (email: string, password: string) => void }) {
  const [email, setEmail] = useState("owner@acme.test");
  const [password, setPassword] = useState("owner123");

  return (
    <main className="grid min-h-screen place-items-center bg-void p-6 text-ghost">
      <form className="w-full max-w-md rounded-[32px] border border-neon-yellow/30 bg-panel p-7 shadow-panel" onSubmit={(event) => { event.preventDefault(); onLogin(email, password); }}>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-neon-yellow">Cyber Data Room</p>
        <h1 className="mt-2 text-2xl font-semibold">Sign in</h1>
        <label className="mt-6 block text-sm">
          Email
          <input className="mt-2 h-11 w-full rounded-2xl border border-neon-cyan/30 bg-void px-4 outline-none focus:border-neon-yellow" onChange={(event) => setEmail(event.target.value)} value={email} />
        </label>
        <label className="mt-4 block text-sm">
          Password
          <input className="mt-2 h-11 w-full rounded-2xl border border-neon-cyan/30 bg-void px-4 outline-none focus:border-neon-yellow" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
        </label>
        <button className="mt-6 w-full rounded-2xl bg-neon-yellow px-4 py-3 font-black text-black" type="submit">Sign in</button>
        <div className="mt-5 text-xs leading-6 text-ghost/60">
          Demo accounts: owner@acme.test / owner123, editor@acme.test / editor123, viewer@acme.test / viewer123.
        </div>
        {notice ? <div className="mt-4 rounded-2xl border border-danger bg-danger/10 p-3 text-sm text-red-200">{notice.message}</div> : null}
      </form>
    </main>
  );
}

function DriveTable(props: {
  items: DataroomItem[];
  selectedFileId: string | null;
  canEdit: boolean;
  ownerName: string;
  onOpen: (item: DataroomItem) => void;
  onRename: (item: DataroomItem) => void;
  onMove: (item: DataroomItem) => void;
  onDelete: (item: DataroomItem) => void;
}) {
  const table = useReactTable({
    data: props.items,
    columns: [
      {
        id: "name",
        header: () => (
          <span className="inline-flex items-center gap-2">
            Name
            <span className="grid h-6 w-6 place-items-center rounded-full bg-neon-cyan/25 text-neon-cyan">↑</span>
          </span>
        ),
        accessorKey: "name",
        cell: ({ row }) => {
          const item = row.original;
          return (
            <button className="flex min-w-0 items-center gap-4 text-left" onClick={() => props.onOpen(item)} type="button">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neon-cyan/10 text-neon-cyan">
                {item.type === "FOLDER" ? <Folder className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
              </span>
              <span className="min-w-0 truncate font-semibold">{item.name}</span>
              {item.type === "FILE" ? <Users className="h-4 w-4 shrink-0 text-ghost/40" /> : null}
            </button>
          );
        }
      },
      { header: "Owner", cell: () => props.ownerName },
      { header: "Date modified", cell: ({ row }) => formatDateTime(row.original.updatedAt) },
      { header: "File size", cell: ({ row }) => (row.original.type === "FILE" ? formatBytes(row.original.size) : "—") },
      {
        id: "actions",
        header: "",
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
    return <div className="grid min-h-[420px] place-items-center rounded-[28px] border border-dashed border-neon-cyan/25 bg-panel/80 text-ghost/60">No files or folders here.</div>;
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-neon-cyan/15 bg-panel/85">
      <table className="w-full border-collapse text-sm">
        <thead className="text-left text-ghost/65">
          {table.getHeaderGroups().map((group) => (
            <tr className="border-b border-neon-cyan/15" key={group.id}>
              {group.headers.map((header) => (
                <th className="px-5 py-4 font-semibold" key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr className={classNames("border-b border-neon-cyan/10 transition last:border-0 hover:bg-neon-cyan/10", props.selectedFileId === row.original.id ? "bg-neon-yellow/10" : "")} key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td className="px-5 py-3.5" key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccessFrame(props: {
  dataroom: Dataroom | null;
  access: AccessRecord[];
  canManageAccess: boolean;
  fileUrl: string | null;
  isLoading: boolean;
  selectedFile: FileItem | null;
  userName: string;
  userRole: DataroomRole | null;
  onManage: () => void;
  onOpenViewer: () => void;
}) {
  const visibleAccess = props.canManageAccess
    ? props.access
    : props.dataroom
      ? [{ id: "owner", dataroomId: props.dataroom.id, userId: props.dataroom.ownerId, role: "OWNER" as const, user: props.dataroom.owner ?? { id: props.dataroom.ownerId, email: "", name: "Owner" } }]
      : [];

  return (
    <aside className="border-l border-neon-cyan/15 bg-panel/95 p-5 max-xl:border-l-0 max-xl:border-t">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-neon-yellow">Access</p>
          <h2 className="mt-1 text-lg font-semibold">{props.dataroom?.name ?? "No data room"}</h2>
        </div>
        {props.canManageAccess ? (
          <button className="rounded-full border border-neon-yellow/40 px-3 py-2 text-sm font-semibold text-neon-yellow hover:bg-neon-yellow/10" onClick={props.onManage} type="button">
            Manage
          </button>
        ) : null}
      </div>

      <div className="mt-5 rounded-[24px] border border-neon-cyan/15 bg-void/60 p-4">
        <p className="text-sm font-semibold">Current access</p>
        {props.isLoading ? <p className="mt-4 text-sm text-ghost/60">Loading access...</p> : null}
        <div className="mt-4 space-y-3">
          {visibleAccess.map((record) => (
            <div className="flex items-center gap-3 rounded-2xl bg-panel/80 p-3" key={`${record.userId}-${record.role}`}>
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-neon-yellow text-sm font-black text-black">
                {record.user.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{record.user.name}</p>
                <p className="truncate text-xs text-ghost/50">{record.user.email || "Owner"}</p>
              </div>
              <RoleBadge role={record.role} />
            </div>
          ))}
        </div>
        {!props.canManageAccess ? (
          <p className="mt-4 text-xs leading-5 text-ghost/55">
            You are signed in as {props.userName}. Full access list is available to the data room owner.
          </p>
        ) : null}
      </div>

      <div className="mt-5 rounded-[24px] border border-neon-cyan/15 bg-void/60 p-4">
        <p className="text-sm font-semibold">Selected item</p>
        {props.selectedFile ? (
          <>
            <dl className="mt-4 space-y-4 text-sm">
              <Detail label="Name" value={props.selectedFile.name} />
              <Detail label="Type" value="PDF document" />
              <Detail label="Size" value={formatBytes(props.selectedFile.size)} />
              <Detail label="Updated" value={formatDateTime(props.selectedFile.updatedAt)} />
            </dl>
            <button className="mt-5 w-full rounded-full bg-neon-yellow px-4 py-2 text-sm font-black text-black disabled:opacity-50" disabled={!props.fileUrl} onClick={props.onOpenViewer} type="button">
              <Maximize2 className="mr-2 inline h-4 w-4" />
              Open in viewer
            </button>
            {props.fileUrl ? <iframe className="mt-4 h-72 w-full rounded-3xl border border-neon-cyan/20 bg-black" src={props.fileUrl} title={`PDF preview for ${props.selectedFile.name}`} /> : null}
          </>
        ) : (
          <p className="mt-4 text-sm leading-6 text-ghost/55">Select a file to see its address and metadata.</p>
        )}
      </div>

      {props.userRole ? (
        <div className="mt-5 rounded-[24px] border border-neon-yellow/20 bg-neon-yellow/10 p-4 text-sm">
          Your role: <span className="font-black text-neon-yellow">{props.userRole}</span>
        </div>
      ) : null}
    </aside>
  );
}

function AccessDialog(props: {
  isOpen: boolean;
  users: Array<{ id: string; email: string; name: string }>;
  access: AccessRecord[];
  isPending: boolean;
  onClose: () => void;
  onRoleChange: (userId: string, role: DataroomRole | null) => void;
}) {
  return (
    <Dialog.Root onOpenChange={(open) => !open && props.onClose()} open={props.isOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-neon-yellow bg-panel p-5 shadow-panel">
          <Dialog.Title className="text-lg font-semibold">Manage data room access</Dialog.Title>
          <div className="mt-5 space-y-3">
            {props.users.map((user) => {
              const record = props.access.find((candidate) => candidate.userId === user.id);
              return (
                <div className="grid grid-cols-[1fr_170px] items-center gap-3 rounded-3xl border border-neon-cyan/20 p-3 max-sm:grid-cols-1" key={user.id}>
                  <div>
                    <p className="font-semibold">{user.name}</p>
                    <p className="text-xs text-ghost/60">{user.email}</p>
                  </div>
                  <RoleSelect disabled={record?.role === "OWNER" || props.isPending} role={record?.role ?? null} onChange={(role) => props.onRoleChange(user.id, role)} />
                </div>
              );
            })}
          </div>
          <Dialog.Close className="mt-5 rounded-full bg-neon-yellow px-5 py-2 text-sm font-black text-black">Done</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DataroomContextMenu(props: {
  menu: NonNullable<ContextMenuState>;
  canManageAccess: boolean;
  onManageAccess: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed z-50 w-56 rounded-3xl border border-neon-cyan/25 bg-panel p-2 shadow-panel"
      onClick={(event) => event.stopPropagation()}
      style={{ left: props.menu.x, top: props.menu.y }}
    >
      <button className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm text-neon-yellow hover:bg-neon-yellow/10 disabled:opacity-45" disabled={!props.canManageAccess} onClick={props.onManageAccess} type="button">
        <Shield className="h-4 w-4" />
        Manage access
      </button>
      <button className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm hover:bg-neon-cyan/10" onClick={props.onRename} type="button">
        <Pencil className="h-4 w-4" />
        Rename
      </button>
      <button className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm text-red-300 hover:bg-danger/10" onClick={props.onDelete} type="button">
        <Trash2 className="h-4 w-4" />
        Delete
      </button>
      <button className="mt-1 flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm text-ghost/60 hover:bg-ghost/10" onClick={props.onClose} type="button">
        <X className="h-4 w-4" />
        Close
      </button>
    </div>
  );
}

function RoleSelect({ disabled, role, onChange }: { disabled: boolean; role: DataroomRole | null; onChange: (role: DataroomRole | null) => void }) {
  return (
    <Select.Root disabled={disabled} onValueChange={(value) => onChange(value === "NONE" ? null : (value as DataroomRole))} value={role ?? "NONE"}>
      <Select.Trigger className="flex h-10 items-center justify-between rounded-2xl border border-neon-cyan/30 bg-void px-3 text-sm">
        <Select.Value />
        <Select.Icon><ChevronDown className="h-4 w-4" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="z-50 rounded-2xl border border-neon-cyan/40 bg-panel p-1 text-ghost shadow-panel">
          <Select.Viewport>
            {["NONE", "VIEWER", "EDITOR", "OWNER"].map((value) => (
              <Select.Item className="cursor-pointer rounded-xl px-3 py-2 text-sm outline-none hover:bg-neon-cyan/10 data-[disabled]:opacity-40" disabled={value === "OWNER" && role !== "OWNER"} key={value} value={value}>
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[440px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-neon-yellow bg-panel p-5 shadow-panel">
          <Dialog.Title className="text-lg font-semibold">{dialogTitle(props.dialog)}</Dialog.Title>
          {props.dialog?.type === "move-item" ? (
            <label className="mt-5 block text-sm">
              Destination
              <select className="mt-2 h-11 w-full rounded-2xl border border-neon-cyan/30 bg-void px-3" onChange={(event) => setParentId(event.target.value || null)} value={parentId ?? ""}>
                <option value="">Data room root</option>
                {props.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
              </select>
            </label>
          ) : null}
          {needsInput ? (
            <label className="mt-5 block text-sm">
              Name
              <input className="mt-2 h-11 w-full rounded-2xl border border-neon-cyan/30 bg-void px-4" onChange={(event) => setValue(event.target.value)} value={value} />
            </label>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close className="rounded-full border border-neon-cyan/30 px-4 py-2 text-sm" type="button">Cancel</Dialog.Close>
            <button className="rounded-full bg-neon-yellow px-5 py-2 text-sm font-black text-black" onClick={() => props.onConfirm(value, parentId)} type="button">
              {props.dialog?.type?.startsWith("delete") ? "Delete" : props.dialog?.type === "move-item" ? "Move" : "Save"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FilterButton({ label }: { label: string }) {
  return (
    <button className="rounded-full border border-neon-cyan/30 px-4 py-2 text-sm text-ghost/85 hover:bg-neon-cyan/10" type="button">
      {label}
      <ChevronDown className="ml-2 inline h-4 w-4" />
    </button>
  );
}

function SideNavItem({ active = false, icon, label }: { active?: boolean; icon: ReactNode; label: string }) {
  return (
    <button className={classNames("flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-left", active ? "bg-neon-cyan/15 text-neon-cyan" : "text-ghost/75 hover:bg-neon-cyan/10")} type="button">
      {icon}
      {label}
    </button>
  );
}

function StorageMeter() {
  return (
    <div className="mt-8 px-3 text-sm text-ghost/70">
      <div className="flex items-center gap-3">
        <HardDrive className="h-5 w-5" />
        Storage
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-ghost/15">
        <div className="h-full w-7/12 rounded-full bg-neon-yellow" />
      </div>
      <p className="mt-3 text-xs">8.31 GB used of 15 GB</p>
      <button className="mt-4 w-full rounded-full border border-neon-cyan/30 px-4 py-2 text-xs font-semibold text-neon-cyan" type="button">
        Increase storage
      </button>
    </div>
  );
}

function RoleBadge({ role }: { role: DataroomRole }) {
  return <span className="rounded-full border border-neon-yellow/30 px-2 py-0.5 text-[10px] font-black uppercase text-neon-yellow">{role}</span>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-black uppercase tracking-[0.14em] text-neon-yellow">{label}</dt>
      <dd className="mt-1 break-words text-ghost">{value}</dd>
    </div>
  );
}

function IconButton({ children, danger = false, label, onClick }: { children: ReactNode; danger?: boolean; label: string; onClick: () => void }) {
  return (
    <button aria-label={label} className={classNames("grid h-9 w-9 place-items-center rounded-full border transition", danger ? "border-danger/40 text-red-300 hover:bg-danger/10" : "border-neon-cyan/25 text-neon-cyan hover:bg-neon-cyan/10")} onClick={onClick} title={label} type="button">
      {children}
    </button>
  );
}

function buildAddress(
  dataroom: Dataroom | null,
  items: DataroomItem[],
  parentId: string | null,
  selectedFile: FileItem | null,
  onDataroomClick: () => void,
  onFolderClick: (folderId: string) => void
) {
  const parts: Array<{ kind: "dataroom" | "folder" | "file"; id: string | null; label: string; clickable: boolean; onClick?: () => void }> = [];

  if (dataroom) {
    parts.push({ kind: "dataroom", id: dataroom.id, label: dataroom.name, clickable: true, onClick: onDataroomClick });
  }

  for (const folder of buildBreadcrumbs(items, parentId)) {
    parts.push({ kind: "folder", id: folder.id, label: folder.name, clickable: true, onClick: () => onFolderClick(folder.id) });
  }

  if (selectedFile) {
    parts.push({ kind: "file", id: selectedFile.id, label: selectedFile.name, clickable: false });
  }

  return parts;
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
