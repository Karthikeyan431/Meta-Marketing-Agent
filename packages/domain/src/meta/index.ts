export {
  MetaCredentialEncryptionKeyMissingError,
  encryptCredential,
  decryptCredential,
  type EncryptedCredential,
} from "./crypto.js";

export {
  MetaConnectionNotFoundError,
  MetaConnectionAlreadyActiveError,
  AdAccountNotFoundError,
  AdAccountNotDiscoverableError,
} from "./errors.js";

export {
  findMetaConnectionByWorkspace,
  upsertMetaConnection,
  disconnectMetaConnection,
  decryptMetaConnectionCredential,
  type UpsertMetaConnectionInput,
  type DisconnectMetaConnectionInput,
} from "./connections.js";

export {
  listAdAccountsByWorkspace,
  findAdAccountByWorkspace,
  selectAdAccounts,
  deselectAdAccount,
  type DiscoveredAdAccount,
  type SelectAdAccountsInput,
  type DeselectAdAccountInput,
} from "./ad-accounts.js";
