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
  HardDrive,
  LogOut,
  Maximize2,
  MoveRight,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
  Upload,
  Users,
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
  register,
  storeToken,
  updateAccess,
  updatePublicAccess,
  uploadFiles
} from "./api/client";
import type { AccessRecord, Dataroom, DataroomItem, DataroomRole, FileItem } from "./api/types";
import { appConfig } from "./config";
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
type ItemTypeFilter = "ALL" | "FOLDER" | "FILE";
type ModifiedFilter = "ALL" | "TODAY" | "WEEK" | "MONTH";
type SortField = "name" | "owner" | "updatedAt" | "size";
type SortState = { field: SortField; direction: "asc" | "desc" };

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
  const [typeFilter, setTypeFilter] = useState<ItemTypeFilter>("ALL");
  const [modifiedFilter, setModifiedFilter] = useState<ModifiedFilter>("ALL");
  const [sort, setSort] = useState<SortState>({ field: "name", direction: "asc" });

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

  const currentUser = meQuery.data?.user ?? null;
  const allItems = useMemo(() => allItemsQuery.data?.items ?? [], [allItemsQuery.data?.items]);
  const serverVisibleItems = useMemo(() => visibleItemsQuery.data?.items ?? [], [visibleItemsQuery.data?.items]);
  const baseVisibleItems = useMemo(
    () => searchQuery.trim()
      ? serverVisibleItems
      : serverVisibleItems.filter((item) => item.parentId === currentParentId),
    [currentParentId, searchQuery, serverVisibleItems]
  );
  const visibleItems = useMemo(
    () => sortItems(filterItems(baseVisibleItems, typeFilter, modifiedFilter), sort, selectedDataroom?.owner?.name ?? currentUser?.name ?? ""),
    [baseVisibleItems, currentUser?.name, modifiedFilter, selectedDataroom?.owner?.name, sort, typeFilter]
  );
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

  const registerMutation = useMutation({
    mutationFn: (payload: { email: string; name: string; password: string }) => register(payload.email, payload.name, payload.password),
    onSuccess: async (payload) => {
      storeToken(payload.token);
      setToken(payload.token);
      setNotice({ tone: "success", message: `Created user ${payload.user.name}.` });
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
  const publicAccessMutation = useMutation({
    mutationFn: (role: DataroomRole | null) => updatePublicAccess(token ?? "", activeDataroomId ?? "", role),
    onSuccess: async () => {
      setNotice({ tone: "success", message: "Public access updated." });
      await queryClient.invalidateQueries({ queryKey: ["datarooms"] });
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

  function changeSort(field: SortField) {
    setSort((current) => ({
      field,
      direction: current.field === field && current.direction === "asc" ? "desc" : "asc"
    }));
  }

  if (!token || !currentUser) {
    return (
      <LoginScreen
        notice={notice}
        onLogin={(email, password) => loginMutation.mutate({ email, password })}
        onRegister={(email, name, password) => registerMutation.mutate({ email, name, password })}
      />
    );
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

            <div className="mt-6">
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
                    type="button"
                  >
                    <Database className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{room.name}</span>
                    <RoleBadge role={room.role} />
                  </button>
                ))}
              </div>
            </div>
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

                    <div className="text-sm text-ghost/55">{visibleItems.length} item{visibleItems.length === 1 ? "" : "s"}</div>
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
                    <FilterSelect
                      label="Type"
                      onChange={(value) => setTypeFilter(value as ItemTypeFilter)}
                      options={[
                        { label: "All types", value: "ALL" },
                        { label: "Folders", value: "FOLDER" },
                        { label: "PDF files", value: "FILE" }
                      ]}
                      value={typeFilter}
                    />
                    <FilterSelect
                      label="Modified"
                      onChange={(value) => setModifiedFilter(value as ModifiedFilter)}
                      options={[
                        { label: "Any time", value: "ALL" },
                        { label: "Today", value: "TODAY" },
                        { label: "Last 7 days", value: "WEEK" },
                        { label: "Last 30 days", value: "MONTH" }
                      ]}
                      value={modifiedFilter}
                    />
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
                    sort={sort}
                    onSort={changeSort}
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

      <AccessDialog
        access={accessQuery.data?.access ?? []}
        isOpen={accessDialogOpen}
        isPending={accessMutation.isPending || publicAccessMutation.isPending}
        onClose={() => setAccessDialogOpen(false)}
        onPublicRoleChange={(role) => publicAccessMutation.mutate(role)}
        onRoleChange={(userId, role) => accessMutation.mutate({ userId, role })}
        publicRole={selectedDataroom?.publicRole ?? null}
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

function LoginScreen({ notice, onLogin, onRegister }: {
  notice: Notice;
  onLogin: (email: string, password: string) => void;
  onRegister: (email: string, name: string, password: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("New User");
  const [email, setEmail] = useState(appConfig.defaultLoginEmail);
  const [password, setPassword] = useState(appConfig.defaultLoginPassword);
  const isRegister = mode === "register";

  function switchMode(nextMode: "login" | "register") {
    setMode(nextMode);

    if (nextMode === "login") {
      setEmail(appConfig.defaultLoginEmail);
      setPassword(appConfig.defaultLoginPassword);
      return;
    }

    setEmail("");
    setPassword("");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-void p-6 text-ghost">
      <form className="w-full max-w-md rounded-[32px] border border-neon-yellow/30 bg-panel p-7 shadow-panel" onSubmit={(event) => {
        event.preventDefault();
        if (isRegister) {
          onRegister(email, name, password);
          return;
        }
        onLogin(email, password);
      }}>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-neon-yellow">Cyber Data Room</p>
        <h1 className="mt-2 text-2xl font-semibold">{isRegister ? "Create user" : "Sign in"}</h1>
        {isRegister ? (
          <label className="mt-6 block text-sm">
            Name
            <input className="mt-2 h-11 w-full rounded-2xl border border-neon-cyan/30 bg-void px-4 outline-none focus:border-neon-yellow" onChange={(event) => setName(event.target.value)} value={name} />
          </label>
        ) : null}
        <label className="mt-6 block text-sm">
          Email
          <input className="mt-2 h-11 w-full rounded-2xl border border-neon-cyan/30 bg-void px-4 outline-none focus:border-neon-yellow" onChange={(event) => setEmail(event.target.value)} value={email} />
        </label>
        <label className="mt-4 block text-sm">
          Password
          <input className="mt-2 h-11 w-full rounded-2xl border border-neon-cyan/30 bg-void px-4 outline-none focus:border-neon-yellow" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
        </label>
        <button className="mt-6 w-full rounded-2xl bg-neon-yellow px-4 py-3 font-black text-black" type="submit">{isRegister ? "Create user" : "Sign in"}</button>
        <button className="mt-3 w-full rounded-2xl border border-neon-cyan/30 px-4 py-3 text-sm font-semibold text-neon-cyan hover:bg-neon-cyan/10" onClick={() => switchMode(isRegister ? "login" : "register")} type="button">
          {isRegister ? "Back to sign in" : "Create a new user"}
        </button>
        {!isRegister ? (
          <div className="mt-5 text-xs leading-6 text-ghost/60">
          {appConfig.demoAccountsText}
          </div>
        ) : null}
        {notice ? <div className={classNames("mt-4 rounded-2xl border p-3 text-sm", notice.tone === "error" ? "border-danger bg-danger/10 text-red-200" : "border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan")}>{notice.message}</div> : null}
      </form>
    </main>
  );
}

function DriveTable(props: {
  items: DataroomItem[];
  selectedFileId: string | null;
  canEdit: boolean;
  ownerName: string;
  sort: SortState;
  onOpen: (item: DataroomItem) => void;
  onRename: (item: DataroomItem) => void;
  onMove: (item: DataroomItem) => void;
  onDelete: (item: DataroomItem) => void;
  onSort: (field: SortField) => void;
}) {
  const table = useReactTable({
    data: props.items,
    columns: [
      {
        id: "name",
        header: () => <SortHeader field="name" label="Name" onSort={props.onSort} sort={props.sort} />,
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
      { id: "owner", header: () => <SortHeader field="owner" label="Owner" onSort={props.onSort} sort={props.sort} />, cell: () => props.ownerName },
      { id: "updatedAt", header: () => <SortHeader field="updatedAt" label="Date modified" onSort={props.onSort} sort={props.sort} />, cell: ({ row }) => formatDateTime(row.original.updatedAt) },
      { id: "size", header: () => <SortHeader field="size" label="File size" onSort={props.onSort} sort={props.sort} />, cell: ({ row }) => (row.original.type === "FILE" ? formatBytes(row.original.size) : "-") },
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

function SortHeader(props: { field: SortField; label: string; sort: SortState; onSort: (field: SortField) => void }) {
  const active = props.sort.field === props.field;

  return (
    <button className="inline-flex items-center gap-2 rounded-full px-2 py-1 text-left hover:bg-neon-cyan/10" onClick={() => props.onSort(props.field)} type="button">
      {props.label}
      <span className={classNames("grid h-6 w-6 place-items-center rounded-full", active ? "bg-neon-cyan/25 text-neon-cyan" : "bg-ghost/10 text-ghost/45")}>
        <ChevronDown className={classNames("h-4 w-4 transition", active && props.sort.direction === "asc" ? "rotate-180" : "")} />
      </span>
    </button>
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
  const publicRole = props.dataroom?.publicRole ?? null;

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

      {props.userRole ? (
        <div className="mt-5 rounded-[24px] border border-neon-yellow/20 bg-neon-yellow/10 p-4 text-sm">
          Your role: <span className="font-black text-neon-yellow">{props.userRole}</span>
        </div>
      ) : null}

      <div className="mt-5 rounded-[24px] border border-neon-cyan/15 bg-void/60 p-4">
        <p className="text-sm font-semibold">Current access</p>
        {props.isLoading ? <p className="mt-4 text-sm text-ghost/60">Loading access...</p> : null}
        <div className="mt-4 space-y-3">
          {publicRole ? (
            <div className="flex items-center gap-3 rounded-2xl bg-neon-cyan/10 p-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-neon-cyan text-sm font-black text-black">
                <Users className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">Everyone</p>
                <p className="truncate text-xs text-ghost/50">All users</p>
              </div>
              <RoleBadge role={publicRole} />
            </div>
          ) : null}
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

    </aside>
  );
}

function AccessDialog(props: {
  isOpen: boolean;
  users: Array<{ id: string; email: string; name: string }>;
  access: AccessRecord[];
  publicRole: DataroomRole | null;
  isPending: boolean;
  onClose: () => void;
  onPublicRoleChange: (role: DataroomRole | null) => void;
  onRoleChange: (userId: string, role: DataroomRole | null) => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredUsers = normalizedQuery
    ? props.users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(normalizedQuery))
    : props.users;

  useEffect(() => {
    if (!props.isOpen) {
      setQuery("");
    }
  }, [props.isOpen]);

  return (
    <Dialog.Root onOpenChange={(open) => !open && props.onClose()} open={props.isOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-32px)] w-[620px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[32px] border border-neon-yellow bg-panel p-5 shadow-panel">
          <Dialog.Title className="text-lg font-semibold">Manage data room access</Dialog.Title>
          <div className="mt-5 grid grid-cols-[1fr_170px] items-center gap-3 rounded-[28px] border border-neon-yellow/35 bg-neon-yellow/10 p-3 max-sm:grid-cols-1">
            <div>
              <p className="font-semibold">Available to everyone</p>
              <p className="text-xs text-ghost/60">All current and future users</p>
            </div>
            <RoleSelect disabled={props.isPending} role={props.publicRole} onChange={props.onPublicRoleChange} />
          </div>
          <label className="relative mt-4 block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ghost/50" />
            <input
              className="h-11 w-full rounded-full border border-neon-cyan/25 bg-void pl-11 pr-4 text-sm outline-none focus:border-neon-yellow"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search users"
              value={query}
            />
          </label>
          <div className="mt-5 space-y-3">
            {filteredUsers.map((user) => {
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
            {filteredUsers.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-neon-cyan/25 p-5 text-sm text-ghost/60">No users found.</div>
            ) : null}
          </div>
          <Dialog.Close className="mt-5 rounded-full bg-neon-yellow px-5 py-2 text-sm font-black text-black">Done</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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

function FilterSelect(props: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-full border border-neon-cyan/30 px-4 py-2 text-sm text-ghost/85">
      <span className="text-ghost/55">{props.label}</span>
      <select className="bg-transparent font-semibold text-ghost outline-none" onChange={(event) => props.onChange(event.target.value)} value={props.value}>
        {props.options.map((option) => (
          <option className="bg-panel text-ghost" key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
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

function filterItems(items: DataroomItem[], typeFilter: ItemTypeFilter, modifiedFilter: ModifiedFilter) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  return items.filter((item) => {
    if (typeFilter !== "ALL" && item.type !== typeFilter) {
      return false;
    }

    if (modifiedFilter === "ALL") {
      return true;
    }

    const updatedAt = new Date(item.updatedAt).getTime();

    if (Number.isNaN(updatedAt)) {
      return false;
    }

    if (modifiedFilter === "TODAY") {
      return new Date(item.updatedAt).toDateString() === new Date(now).toDateString();
    }

    if (modifiedFilter === "WEEK") {
      return now - updatedAt <= 7 * day;
    }

    return now - updatedAt <= 30 * day;
  });
}

function sortItems(items: DataroomItem[], sort: SortState, ownerName: string) {
  const direction = sort.direction === "asc" ? 1 : -1;

  return [...items].sort((left, right) => {
    const leftValue = sortValue(left, sort.field, ownerName);
    const rightValue = sortValue(right, sort.field, ownerName);

    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return (leftValue - rightValue) * direction;
    }

    return String(leftValue).localeCompare(String(rightValue)) * direction;
  });
}

function sortValue(item: DataroomItem, field: SortField, ownerName: string) {
  if (field === "owner") {
    return ownerName;
  }

  if (field === "updatedAt") {
    return new Date(item.updatedAt).getTime();
  }

  if (field === "size") {
    return item.type === "FILE" ? item.size : 0;
  }

  return item.name.toLowerCase();
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

