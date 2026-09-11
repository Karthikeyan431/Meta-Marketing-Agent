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
  recordConnectionHealthFailure,
  recordConnectionHealthSuccess,
  type UpsertMetaConnectionInput,
  type DisconnectMetaConnectionInput,
  type ConnectionHealthFailureKind,
} from "./connections.js";

export {
  listAdAccountsByWorkspace,
  listAllActiveAdAccountsForScheduledSync,
  findAdAccountByWorkspace,
  selectAdAccounts,
  deselectAdAccount,
  type DiscoveredAdAccount,
  type SelectAdAccountsInput,
  type DeselectAdAccountInput,
} from "./ad-accounts.js";

export {
  upsertCampaign,
  upsertAdSet,
  upsertAd,
  markMissingCampaignsRemoved,
  markMissingAdSetsRemoved,
  markMissingAdsRemoved,
  listCampaignsByWorkspace,
  findCampaignByWorkspace,
  listAdSetsByWorkspace,
  findAdSetByWorkspace,
  listAdsByWorkspace,
  findAdByWorkspace,
  type UpsertCampaignInput,
  type UpsertAdSetInput,
  type UpsertAdInput,
} from "./campaign-hierarchy.js";

export {
  tryStartSyncRun,
  completeSyncRun,
  failSyncRun,
  listSyncRunsByWorkspace,
  type StartSyncRunInput,
  type CompleteSyncRunInput,
} from "./sync-runs.js";

export {
  syncAdAccountCampaignHierarchy,
  type SyncAdAccountHierarchyInput,
  type SyncAdAccountHierarchyResult,
} from "./sync-orchestrator.js";

export {
  META_OAUTH_SCOPES,
  MetaApiError,
  buildMetaAuthorizationUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  validateMetaToken,
  getMetaIdentity,
  listBusinesses,
  listAdAccounts,
  listCampaigns,
  listAdSets,
  listAds,
  type MetaTokenDebugInfo,
  type MetaIdentity,
  type MetaBusinessSummary,
  type MetaAdAccountSummary,
  type MetaCampaignSummary,
  type MetaAdSetSummary,
  type MetaAdSummary,
} from "./client.js";
