// ── Public API ────────────────────────────────────────────────────────────────
export { WaSynapse } from './WaSynapse.js';
export { BasePlugin } from './plugin/BasePlugin.js';
export { GroupManager } from './group/GroupManager.js';
export { StateStoreManager, InMemoryGroupStateStore } from './store/StateStore.js';
export { SQLiteAdapter } from './database/SQLiteAdapter.js';
export { Logger } from './logger/Logger.js';

// ── whatsapp-web.js re-exports ────────────────────────────────────────────────
// Auth strategies and cache options — re-exported so consumers don't need a
// direct dependency on whatsapp-web.js.
export { LocalAuth, RemoteAuth, NoAuth } from 'whatsapp-web.js';

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  // Logging
  LogLevel,
  PluginLogger,
  // Users
  UserRecord,
  // Groups
  GroupConfig,
  GroupPluginConfig,
  // State
  GroupStateStore,
  // Contexts
  MessageContext,
  CommandContext,
  SetupContext,
  // Handlers
  CommandHandler,
  RawMessageHandler,
  // Plugin contracts
  WaPlugin,
  WaCommand,
  WaRawMessageHandler,
  // Options
  WaSynapseOptions,
  AccountConfig,
} from './types/index.js';
