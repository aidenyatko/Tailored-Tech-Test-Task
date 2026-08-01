import { beforeEach, describe, expect, it } from "vitest";
import { DataRoomError } from "../domain/errors";
import { DataRoomStorage } from "./dataRoomStorage";

function makeStorage() {
  return new DataRoomStorage(`test-db-${crypto.randomUUID()}`);
}

function makePdf(name = "Report.pdf") {
  const bytes = new TextEncoder().encode("%PDF-1.4");
  return {
    name,
    type: "application/pdf",
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer
  } as File;
}

describe("DataRoomStorage", () => {
  let storage: DataRoomStorage;

  beforeEach(() => {
    storage = makeStorage();
  });

  it("creates data rooms, folders, and duplicate PDF names safely", async () => {
    const dataroom = await storage.createDataroom("Acme Deal");
    const folder = await storage.createFolder(dataroom.id, null, "Financials");
    const firstFile = await storage.uploadFile(dataroom.id, folder.id, makePdf("Report.pdf"));
    const secondFile = await storage.uploadFile(dataroom.id, folder.id, makePdf("Report.pdf"));

    expect(firstFile.name).toBe("Report.pdf");
    expect(secondFile.name).toBe("Report (1).pdf");
    expect(await storage.getFileBlob(firstFile.storageKey)).toBeInstanceOf(Blob);
  });

  it("rejects non-PDF uploads", async () => {
    const dataroom = await storage.createDataroom("Acme Deal");
    const file = {
      name: "notes.txt",
      type: "text/plain",
      size: 4,
      arrayBuffer: async () => new TextEncoder().encode("text").buffer
    } as File;

    await expect(storage.uploadFile(dataroom.id, null, file)).rejects.toMatchObject({
      code: "INVALID_FILE_TYPE"
    } satisfies Partial<DataRoomError>);
  });

  it("blocks manual rename collisions", async () => {
    const dataroom = await storage.createDataroom("Acme Deal");
    const firstFolder = await storage.createFolder(dataroom.id, null, "Legal");
    await storage.createFolder(dataroom.id, null, "Tax");

    await expect(storage.renameItem(firstFolder.id, "Tax")).rejects.toMatchObject({
      code: "DUPLICATE_NAME"
    } satisfies Partial<DataRoomError>);
  });

  it("deletes nested folders, files, and blobs", async () => {
    const dataroom = await storage.createDataroom("Acme Deal");
    const folder = await storage.createFolder(dataroom.id, null, "Financials");
    const nested = await storage.createFolder(dataroom.id, folder.id, "Archive");
    const file = await storage.uploadFile(dataroom.id, nested.id, makePdf());

    await storage.deleteItem(folder.id);

    expect(await storage.listItems(dataroom.id)).toEqual([]);
    expect(await storage.getFileBlob(file.storageKey)).toBeNull();
  });
});
