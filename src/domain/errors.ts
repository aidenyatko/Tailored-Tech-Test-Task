export type DataRoomErrorCode =
  | "DATAROOM_NOT_FOUND"
  | "ITEM_NOT_FOUND"
  | "INVALID_PARENT"
  | "INVALID_NAME"
  | "DUPLICATE_NAME"
  | "INVALID_FILE_TYPE";

export class DataRoomError extends Error {
  readonly code: DataRoomErrorCode;

  constructor(code: DataRoomErrorCode, message: string) {
    super(message);
    this.name = "DataRoomError";
    this.code = code;
  }
}
