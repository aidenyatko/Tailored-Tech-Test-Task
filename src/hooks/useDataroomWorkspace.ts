import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataRoomError } from "../domain/errors";
import { getBreadcrumbs, getItemsByParent, sortDataRoomItems } from "../domain/tree";
import type { DataRoomItem, Dataroom, EntityId, FileItem } from "../domain/types";
import { DataRoomStorage } from "../storage/dataRoomStorage";

export interface WorkspaceNotice {
  tone: "success" | "error";
  message: string;
}

export function useDataroomWorkspace() {
  const dbName = useRef(import.meta.env.MODE === "test" ? `acme-data-room-test-${crypto.randomUUID()}` : "acme-data-room");
  const storage = useRef(new DataRoomStorage(dbName.current));
  const [datarooms, setDatarooms] = useState<Dataroom[]>([]);
  const [items, setItems] = useState<DataRoomItem[]>([]);
  const [selectedDataroomId, setSelectedDataroomId] = useState<EntityId | null>(null);
  const [currentParentId, setCurrentParentId] = useState<EntityId | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<EntityId | null>(null);
  const [selectedFileUrl, setSelectedFileUrl] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notice, setNotice] = useState<WorkspaceNotice | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(
    async (nextDataroomId = selectedDataroomId, nextParentId = currentParentId) => {
      setIsLoading(true);
      try {
        const nextDatarooms = await storage.current.listDatarooms();
        const fallbackId = nextDatarooms[0]?.id ?? null;
        const activeId = nextDataroomId && nextDatarooms.some((room) => room.id === nextDataroomId) ? nextDataroomId : fallbackId;
        const nextItems = activeId ? await storage.current.listItems(activeId) : [];
        const parentStillExists =
          nextParentId === null || nextItems.some((item) => item.id === nextParentId && item.type === "folder");

        setDatarooms(nextDatarooms);
        setSelectedDataroomId(activeId);
        setItems(nextItems);
        setCurrentParentId(parentStillExists ? nextParentId : null);
      } finally {
        setIsLoading(false);
      }
    },
    [currentParentId, selectedDataroomId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const selectedDataroom = useMemo(
    () => datarooms.find((dataroom) => dataroom.id === selectedDataroomId) ?? null,
    [datarooms, selectedDataroomId]
  );

  const currentItems = useMemo(() => getItemsByParent(items, currentParentId), [currentParentId, items]);

  const visibleItems = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();

    if (!query) {
      return currentItems;
    }

    return sortDataRoomItems(items.filter((item) => item.name.toLocaleLowerCase().includes(query)));
  }, [currentItems, items, searchQuery]);

  const breadcrumbs = useMemo(() => {
    if (!currentParentId) {
      return [];
    }

    return getBreadcrumbs(items, currentParentId);
  }, [currentParentId, items]);

  const selectedFile = useMemo(
    () => items.find((item): item is FileItem => item.id === selectedFileId && item.type === "file") ?? null,
    [items, selectedFileId]
  );

  useEffect(() => {
    let isCancelled = false;
    let objectUrl: string | null = null;

    setSelectedFileUrl(null);

    if (!selectedFile) {
      setIsPreviewLoading(false);
      return undefined;
    }

    setIsPreviewLoading(true);

    storage.current
      .getFileBlob(selectedFile.storageKey)
      .then((blob) => {
        if (isCancelled || !blob) {
          return;
        }

        objectUrl = URL.createObjectURL(blob);
        setSelectedFileUrl(objectUrl);
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setNotice({ tone: "error", message: getErrorMessage(error) });
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsPreviewLoading(false);
        }
      });

    return () => {
      isCancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [selectedFile]);

  const run = useCallback(
    async (operation: () => Promise<void>, successMessage?: string) => {
      try {
        setNotice(null);
        await operation();
        if (successMessage) {
          setNotice({ tone: "success", message: successMessage });
        }
        return true;
      } catch (error) {
        setNotice({ tone: "error", message: getErrorMessage(error) });
        return false;
      }
    },
    []
  );

  const createDataroom = useCallback(
    async (name: string) => {
      return run(async () => {
        const dataroom = await storage.current.createDataroom(name);
        setCurrentParentId(null);
        setSelectedFileId(null);
        await load(dataroom.id, null);
      }, "Data room created.");
    },
    [load, run]
  );

  const renameDataroom = useCallback(
    async (id: EntityId, name: string) => {
      return run(async () => {
        await storage.current.renameDataroom(id, name);
        await load(id, currentParentId);
      }, "Data room renamed.");
    },
    [currentParentId, load, run]
  );

  const deleteDataroom = useCallback(
    async (id: EntityId) => {
      return run(async () => {
        await storage.current.deleteDataroom(id);
        setCurrentParentId(null);
        setSelectedFileId(null);
        await load(null, null);
      }, "Data room deleted.");
    },
    [load, run]
  );

  const createFolder = useCallback(
    async (name: string) => {
      if (!selectedDataroomId) {
        return false;
      }

      return run(async () => {
        await storage.current.createFolder(selectedDataroomId, currentParentId, name);
        await load(selectedDataroomId, currentParentId);
      }, "Folder created.");
    },
    [currentParentId, load, run, selectedDataroomId]
  );

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!selectedDataroomId || files.length === 0) {
        return false;
      }

      return run(async () => {
        for (const file of files) {
          await storage.current.uploadFile(selectedDataroomId, currentParentId, file);
        }
        await load(selectedDataroomId, currentParentId);
      }, files.length === 1 ? "PDF uploaded." : "PDF files uploaded.");
    },
    [currentParentId, load, run, selectedDataroomId]
  );

  const renameItem = useCallback(
    async (id: EntityId, name: string) => {
      return run(async () => {
        await storage.current.renameItem(id, name);
        await load(selectedDataroomId, currentParentId);
      }, "Item renamed.");
    },
    [currentParentId, load, run, selectedDataroomId]
  );

  const deleteItem = useCallback(
    async (id: EntityId) => {
      return run(async () => {
        await storage.current.deleteItem(id);
        if (selectedFileId === id) {
          setSelectedFileId(null);
        }
        await load(selectedDataroomId, currentParentId);
      }, "Item deleted.");
    },
    [currentParentId, load, run, selectedDataroomId, selectedFileId]
  );

  const selectDataroom = useCallback(
    async (id: EntityId) => {
      setCurrentParentId(null);
      setSelectedFileId(null);
      await load(id, null);
    },
    [load]
  );

  const openFolder = useCallback((id: EntityId | null) => {
    setCurrentParentId(id);
    setSelectedFileId(null);
  }, []);

  return {
    breadcrumbs,
    createDataroom,
    createFolder,
    currentItems,
    currentParentId,
    datarooms,
    deleteDataroom,
    deleteItem,
    isLoading,
    isPreviewLoading,
    isSearchActive: Boolean(searchQuery.trim()),
    items,
    notice,
    openFolder,
    renameDataroom,
    renameItem,
    searchQuery,
    selectDataroom,
    selectedDataroom,
    selectedFile,
    selectedFileId,
    selectedFileUrl,
    setNotice,
    setSearchQuery,
    setSelectedFileId,
    uploadFiles,
    visibleItems
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof DataRoomError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong.";
}
