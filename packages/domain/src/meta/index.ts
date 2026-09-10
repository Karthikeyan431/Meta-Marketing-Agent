export {
  MetaCredentialEncryptionKeyMissingError,
  encryptCredential,
  decryptCredential,
  type EncryptedCredential,
} from "./crypto.js";

export { MetaConnectionNotFoundError, MetaConnectionAlreadyActiveError } from "./errors.js";

export {
  findMetaConnectionByWorkspace,
  upsertMetaConnection,
  disconnectMetaConnection,
  decryptMetaConnectionCredential,
  type UpsertMetaConnectionInput,
  type DisconnectMetaConnectionInput,
} from "./connections.js";
