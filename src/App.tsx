import {
  ChevronRight,
  Database,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  Home,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { ChangeEvent, ReactNode, useRef, useState } from "react";
import { WorkspaceDialog } from "./components/WorkspaceDialog";
import type { DataRoomItem, Dataroom } from "./domain/types";
import { useDataroomWorkspace } from "./hooks/useDataroomWorkspace";
import { formatBytes, formatDateTime } from "./lib/format";

type DialogState =
  | { type: "create-dataroom" }
  | { type: "rename-dataroom"; dataroom: Dataroom }
  | { type: "delete-dataroom"; dataroom: Dataroom }
  | { type: "create-folder" }
  | { type: "rename-item"; item: DataRoomItem }
  | { type: "delete-item"; item: DataRoomItem }
  | null;

export function App() {
  const workspace = useDataroomWorkspace();
  const [dialog, setDialog] = useState<DialogState>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleDialogConfirm(value: string) {
    if (!dialog) {
      return;
    }

    let success = false;

    if (dialog.type === "create-dataroom") {
      success = await workspace.createDataroom(value);
    }

    if (dialog.type === "rename-dataroom") {
      success = await workspace.renameDataroom(dialog.dataroom.id, value);
    }

    if (dialog.type === "delete-dataroom") {
      success = await workspace.deleteDataroom(dialog.dataroom.id);
    }

    if (dialog.type === "create-folder") {
      success = await workspace.createFolder(value);
    }

    if (dialog.type === "rename-item") {
      success = await workspace.renameItem(dialog.item.id, value);
    }

    if (dialog.type === "delete-item") {
      success = await workspace.deleteItem(dialog.item.id);
    }

    if (success) {
      setDialog(null);
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    await workspace.uploadFiles(files);
    event.target.value = "";
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-0 lg:grid-cols-[280px_1fr]">
        <aside className="border-b border-mist bg-white px-4 py-5 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-accent">Acme Corp.</p>
              <h1 className="mt-1 text-xl font-semibold">Data Room</h1>
            </div>
            <button
              aria-label="Create data room"
              className="grid h-9 w-9 place-items-center rounded bg-accent text-white transition hover:bg-accent/90"
              onClick={() => setDialog({ type: "create-dataroom" })}
              title="New data room"
              type="button"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-6 space-y-2">
            {workspace.datarooms.length === 0 && !workspace.isLoading ? (
              <div className="rounded border border-dashed border-mist bg-paper p-4 text-sm leading-6 text-steel">
                Create a data room to start organizing diligence PDFs.
              </div>
            ) : null}

            {workspace.datarooms.map((dataroom) => (
              <div
                className={classNames(
                  "group rounded border p-2 transition",
                  workspace.selectedDataroom?.id === dataroom.id
                    ? "border-accent bg-accent/5"
                    : "border-transparent hover:border-mist hover:bg-paper"
                )}
                key={dataroom.id}
              >
                <button
                  className="flex w-full items-center gap-2 text-left"
                  onClick={() => void workspace.selectDataroom(dataroom.id)}
                  type="button"
                >
                  <Database className="h-4 w-4 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{dataroom.name}</span>
                </button>
                <div className="mt-2 flex justify-end gap-1 opacity-100 lg:opacity-0 lg:transition lg:group-hover:opacity-100">
                  <IconButton
                    label={`Rename data room ${dataroom.name}`}
                    onClick={() => setDialog({ type: "rename-dataroom", dataroom })}
                  >
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    danger
                    label={`Delete data room ${dataroom.name}`}
                    onClick={() => setDialog({ type: "delete-dataroom", dataroom })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="flex min-w-0 flex-col">
          <header className="border-b border-mist bg-white px-5 py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm text-steel">
                  <button
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-accent transition hover:bg-accent/10"
                    disabled={!workspace.selectedDataroom}
                    onClick={() => workspace.openFolder(null)}
                    type="button"
                  >
                    <Home className="h-4 w-4" />
                    Root
                  </button>
                  {workspace.breadcrumbs.map((folder) => (
                    <span className="inline-flex items-center gap-2" key={folder.id}>
                      <ChevronRight className="h-4 w-4 text-mist" />
                      <button
                        className="rounded px-2 py-1 text-accent transition hover:bg-accent/10"
                        onClick={() => workspace.openFolder(folder.id)}
                        type="button"
                      >
                        {folder.name}
                      </button>
                    </span>
                  ))}
                </div>
                <h2 className="mt-3 truncate text-2xl font-semibold">
                  {workspace.selectedDataroom?.name ?? "No data room selected"}
                </h2>
              </div>

              <div className="flex flex-wrap gap-2">
                <label className="relative min-w-[220px] flex-1 xl:min-w-[280px]">
                  <span className="sr-only">Search documents</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel" />
                  <input
                    className="h-10 w-full rounded border border-mist bg-white pl-9 pr-10 text-sm outline-none transition placeholder:text-steel/70 focus:border-accent focus:ring-2 focus:ring-accent/20"
                    onChange={(event) => workspace.setSearchQuery(event.target.value)}
                    placeholder="Search documents"
                    value={workspace.searchQuery}
                  />
                  {workspace.searchQuery ? (
                    <button
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-steel transition hover:bg-paper"
                      onClick={() => workspace.setSearchQuery("")}
                      title="Clear search"
                      type="button"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </label>
                <button
                  className="inline-flex items-center gap-2 rounded border border-mist bg-white px-3 py-2 text-sm font-medium text-ink transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!workspace.selectedDataroom}
                  onClick={() => setDialog({ type: "create-folder" })}
                  type="button"
                >
                  <Folder className="h-4 w-4 text-accent" />
                  New folder
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!workspace.selectedDataroom}
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  <Upload className="h-4 w-4" />
                  Upload PDF
                </button>
                <input
                  accept="application/pdf"
                  className="sr-only"
                  data-testid="pdf-upload"
                  multiple
                  onChange={(event) => void handleUpload(event)}
                  ref={fileInputRef}
                  type="file"
                />
              </div>
            </div>

            {workspace.notice ? (
              <div
                className={classNames(
                  "mt-4 rounded border px-3 py-2 text-sm",
                  workspace.notice.tone === "error"
                    ? "border-danger/30 bg-danger/5 text-danger"
                    : "border-accent/30 bg-accent/5 text-accent"
                )}
                role="status"
              >
                {workspace.notice.message}
              </div>
            ) : null}
          </header>

          <div className="grid flex-1 min-h-0 lg:grid-cols-[1fr_320px]">
            <section className="min-w-0 p-5">
              <div className="rounded border border-mist bg-white">
                <div className="grid grid-cols-[minmax(0,1fr)_120px_160px_120px] gap-3 border-b border-mist px-4 py-3 text-xs font-semibold uppercase text-steel max-md:hidden">
                  <span>Name</span>
                  <span>Type</span>
                  <span>Updated</span>
                  <span className="text-right">Actions</span>
                </div>

                {workspace.isLoading ? (
                  <div className="p-8 text-center text-sm text-steel">Loading data room...</div>
                ) : null}

                {!workspace.isLoading && workspace.selectedDataroom && workspace.visibleItems.length === 0 ? (
                  <div className="grid min-h-[280px] place-items-center p-8 text-center">
                    <div>
                      {workspace.isSearchActive ? (
                        <Search className="mx-auto h-10 w-10 text-accent" />
                      ) : (
                        <FolderOpen className="mx-auto h-10 w-10 text-accent" />
                      )}
                      <p className="mt-4 text-base font-semibold">
                        {workspace.isSearchActive ? "No items match your search." : "This folder is empty."}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-steel">
                        {workspace.isSearchActive
                          ? "Try a different file or folder name."
                          : "Add a folder or upload PDF files to start building the data room."}
                      </p>
                    </div>
                  </div>
                ) : null}

                {!workspace.isLoading && !workspace.selectedDataroom ? (
                  <div className="grid min-h-[360px] place-items-center p-8 text-center">
                    <div>
                      <Database className="mx-auto h-10 w-10 text-accent" />
                      <p className="mt-4 text-base font-semibold">Create your first data room.</p>
                      <p className="mt-2 text-sm leading-6 text-steel">
                        A data room is the top-level workspace for folders and PDF documents.
                      </p>
                      <button
                        className="mt-5 rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90"
                        onClick={() => setDialog({ type: "create-dataroom" })}
                        type="button"
                      >
                        New data room
                      </button>
                    </div>
                  </div>
                ) : null}

                {!workspace.isLoading && workspace.visibleItems.length > 0 ? (
                  <div className="divide-y divide-mist">
                    {workspace.visibleItems.map((item) => (
                      <ExplorerRow
                        isSelected={workspace.selectedFileId === item.id}
                        item={item}
                        key={item.id}
                        onDelete={() => setDialog({ type: "delete-item", item })}
                        onOpen={() =>
                          item.type === "folder" ? workspace.openFolder(item.id) : workspace.setSelectedFileId(item.id)
                        }
                        onRename={() => setDialog({ type: "rename-item", item })}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </section>

            <aside className="border-t border-mist bg-white p-5 lg:border-l lg:border-t-0">
              {workspace.selectedFile ? (
                <div>
                  <div className="flex h-12 w-12 items-center justify-center rounded bg-accent/10 text-accent">
                    <FileText className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 break-words text-lg font-semibold">{workspace.selectedFile.name}</h3>
                  <dl className="mt-5 space-y-4 text-sm">
                    <Detail label="Type" value="PDF document" />
                    <Detail label="Size" value={formatBytes(workspace.selectedFile.size)} />
                    <Detail label="Updated" value={formatDateTime(workspace.selectedFile.updatedAt)} />
                  </dl>
                  <div className="mt-5">
                    {workspace.isPreviewLoading ? (
                      <div className="grid h-[420px] place-items-center rounded border border-mist bg-paper text-sm text-steel">
                        Loading PDF preview...
                      </div>
                    ) : null}
                    {!workspace.isPreviewLoading && workspace.selectedFileUrl ? (
                      <div>
                        <object
                          className="h-[420px] w-full rounded border border-mist bg-paper"
                          data={workspace.selectedFileUrl}
                          title={`PDF preview for ${workspace.selectedFile.name}`}
                          type="application/pdf"
                        >
                          <a
                            className="inline-flex items-center gap-2 rounded bg-accent px-3 py-2 text-sm font-semibold text-white"
                            href={workspace.selectedFileUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Open PDF
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </object>
                        <a
                          className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-accent"
                          href={workspace.selectedFileUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open PDF in browser
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    ) : null}
                    {!workspace.isPreviewLoading && !workspace.selectedFileUrl ? (
                      <div className="rounded border border-mist bg-paper p-3 text-sm leading-6 text-steel">
                        Preview is unavailable for this file.
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="rounded border border-dashed border-mist bg-paper p-4 text-sm leading-6 text-steel">
                  Select a PDF file to see details here.
                </div>
              )}
            </aside>
          </div>
        </section>
      </div>

      {dialog ? (
        <WorkspaceDialog
          confirmLabel={getDialogConfirmLabel(dialog)}
          description={getDialogDescription(dialog)}
          destructive={dialog.type === "delete-dataroom" || dialog.type === "delete-item"}
          initialValue={getDialogInitialValue(dialog)}
          onCancel={() => setDialog(null)}
          onConfirm={handleDialogConfirm}
          title={getDialogTitle(dialog)}
        />
      ) : null}
    </main>
  );
}

interface ExplorerRowProps {
  item: DataRoomItem;
  isSelected: boolean;
  onDelete: () => void;
  onOpen: () => void;
  onRename: () => void;
}

function ExplorerRow({ item, isSelected, onDelete, onOpen, onRename }: ExplorerRowProps) {
  return (
    <div
      className={classNames(
        "grid gap-3 px-4 py-3 transition hover:bg-paper md:grid-cols-[minmax(0,1fr)_120px_160px_120px] md:items-center",
        isSelected ? "bg-accent/5" : "bg-white"
      )}
    >
      <button className="flex min-w-0 items-center gap-3 text-left" onClick={onOpen} type="button">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-accent/10 text-accent">
          {item.type === "folder" ? <Folder className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">{item.name}</span>
          <span className="block text-xs text-steel md:hidden">
            {item.type === "folder" ? "Folder" : formatBytes(item.size)}
          </span>
        </span>
      </button>
      <span className="text-sm text-steel max-md:hidden">{item.type === "folder" ? "Folder" : "PDF"}</span>
      <span className="text-sm text-steel max-md:hidden">{formatDateTime(item.updatedAt)}</span>
      <div className="flex justify-end gap-1">
        <IconButton label={`Rename ${item.name}`} onClick={onRename}>
          <Pencil className="h-4 w-4" />
        </IconButton>
        <IconButton danger label={`Delete ${item.name}`} onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
  );
}

interface IconButtonProps {
  children: ReactNode;
  danger?: boolean;
  label: string;
  onClick: () => void;
}

function IconButton({ children, danger = false, label, onClick }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={classNames(
        "grid h-8 w-8 place-items-center rounded border transition",
        danger
          ? "border-danger/20 text-danger hover:bg-danger/10"
          : "border-mist text-steel hover:bg-paper hover:text-ink"
      )}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-steel">{label}</dt>
      <dd className="mt-1 break-words text-ink">{value}</dd>
    </div>
  );
}

function getDialogTitle(dialog: NonNullable<DialogState>) {
  if (dialog.type === "create-dataroom") return "Create data room";
  if (dialog.type === "rename-dataroom") return "Rename data room";
  if (dialog.type === "delete-dataroom") return "Delete data room";
  if (dialog.type === "create-folder") return "Create folder";
  if (dialog.type === "rename-item") return "Rename item";
  return "Delete item";
}

function getDialogDescription(dialog: NonNullable<DialogState>) {
  if (dialog.type === "delete-dataroom") {
    return `Delete "${dialog.dataroom.name}" and every folder and file inside it.`;
  }

  if (dialog.type === "delete-item") {
    return dialog.item.type === "folder"
      ? `Delete "${dialog.item.name}" and every nested folder and file inside it.`
      : `Delete "${dialog.item.name}" from this data room.`;
  }

  return undefined;
}

function getDialogInitialValue(dialog: NonNullable<DialogState>) {
  if (dialog.type === "rename-dataroom") return dialog.dataroom.name;
  if (dialog.type === "rename-item") return dialog.item.name;
  if (dialog.type === "create-folder") return "New Folder";
  return "";
}

function getDialogConfirmLabel(dialog: NonNullable<DialogState>) {
  if (dialog.type === "delete-dataroom" || dialog.type === "delete-item") return "Delete";
  if (dialog.type === "rename-dataroom" || dialog.type === "rename-item") return "Save";
  return "Create";
}

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
