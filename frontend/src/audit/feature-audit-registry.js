/**
 * Wave 0 audit ledger for the v1.1 feature matrix.
 *
 * This is deliberately an audit fixture, not a runtime capability registry.
 * Runtime tools remain owned by Operation V2 until the capability wave.
 */

const DEFAULT_SCOPE = Object.freeze({
  userId: "local",
  characterId: "fixture-character",
  relationshipId: "local:fixture-character",
  sessionId: "char:fixture-character",
  visibility: "private",
});

const DEFAULT_FAILURES = Object.freeze({
  pending: "retain pending receipt; do not write a success projection",
  denied: "retain denial receipt; do not claim completion",
  cancelled: "retain cancellation receipt; safe retry only when policy allows",
  failed: "retain failure receipt; do not create lived memory",
});

function row(featureId, values = {}) {
  return Object.freeze({
    featureId,
    owner: values.owner || "ui",
    scope: { ...DEFAULT_SCOPE, ...(values.scope || {}) },
    status: values.status || "partial",
    known: values.known !== false,
    requestable: values.requestable === true,
    executable: values.executable === true,
    operationIds: Object.freeze([...(values.operationIds || [])]),
    permission: values.permission || "none",
    successState: values.successState || "not_applicable",
    failureStates: { ...DEFAULT_FAILURES, ...(values.failureStates || {}) },
    receipt: {
      required: values.receipt?.required !== false,
      type: values.receipt?.type || "ProductAuditReceipt",
      sourceRef: values.receipt?.sourceRef !== false,
    },
    writeAuthority: values.writeAuthority || "none",
    memoryPolicy: values.memoryPolicy || "none",
    realityNamespace: values.realityNamespace || "reality",
  });
}

export const FEATURE_AUDIT_ROWS = Object.freeze([
  row("pop.chat", { owner: "conversation", status: "online", requestable: false, executable: false, successState: "conversation_turn_recorded", writeAuthority: "ConversationV2", memoryPolicy: "evidence_only" }),
  row("moments", { owner: "business_record", status: "online", requestable: true, executable: true, operationIds: ["companion.moments.publish"], permission: "user_gesture", successState: "moment_published", writeAuthority: "MomentsStore", memoryPolicy: "candidate" }),
  // Diary now has a real chat executor with provider guard, durable save and
  // native read-back verification. Provider/network failures still surface as
  // failed receipts; they do not make the operation fictitiously succeed.
  row("diary", { owner: "executor", status: "online", requestable: true, executable: true, operationIds: ["companion.diary.create"], permission: "multiple", successState: "diary_created", writeAuthority: "DiaryRepository", memoryPolicy: "lived_fact" }),
  row("visual-memory", { owner: "business_record", status: "partial", requestable: false, executable: false, successState: "media_saved", permission: "multiple", writeAuthority: "VisualMemoryStore", memoryPolicy: "evidence_only" }),
  row("co-listen", { owner: "ui", status: "online", requestable: true, executable: true, operationIds: ["companion.listen.play"], permission: "user_gesture", successState: "track_played", writeAuthority: "LibraryTrackStore", memoryPolicy: "candidate" }),
  row("co-read", { owner: "ui", status: "online", requestable: true, executable: true, operationIds: ["companion.read.open"], permission: "user_gesture", successState: "reading_progress_saved", writeAuthority: "LibraryBookStore", memoryPolicy: "evidence_only" }),
  row("nyra-calendar", { owner: "operation", status: "partial", requestable: true, executable: true, operationIds: ["calendar.list", "calendar.create_reminder"], permission: "explicit_approval", successState: "calendar_event_created", writeAuthority: "CalendarRepository", memoryPolicy: "lived_fact" }),
  row("system-calendar", { owner: "operation", status: "partial", requestable: true, executable: false, operationIds: ["calendar.read", "calendar.write"], permission: "multiple", successState: "system_event_written", writeAuthority: "NativeCalendar", memoryPolicy: "evidence_only" }),
  row("selfie", { owner: "executor", status: "partial", requestable: true, executable: false, operationIds: ["companion.selfie.create"], permission: "provider", successState: "selfie_created", writeAuthority: "VisualMemoryStore", memoryPolicy: "lived_fact" }),
  row("imagegen", { owner: "executor", status: "partial", requestable: false, executable: false, successState: "imagegen_artifact_created", permission: "provider", writeAuthority: "ArtifactRepository", memoryPolicy: "fiction_only", realityNamespace: "creative_work" }),
  row("memory-rag", { owner: "projection", status: "default_off", requestable: true, executable: true, successState: "evidence_retrieved", writeAuthority: "ContextBroker", memoryPolicy: "evidence_only" }),
  row("worldbook", { owner: "projection", status: "online", requestable: true, executable: true, successState: "worldbook_entry_activated", writeAuthority: "WorldbookStore", memoryPolicy: "none", realityNamespace: "creative_work" }),
  row("character-definition", { owner: "business_record", status: "partial", requestable: true, executable: true, successState: "character_revision_saved", writeAuthority: "CharacterStore", memoryPolicy: "none" }),
  row("pet-actions", { owner: "operation", status: "partial", requestable: true, executable: false, operationIds: ["runtime.avatar.act", "runtime.avatar.express"], permission: "none", successState: "avatar_action_applied", writeAuthority: "RuntimeProtocol", memoryPolicy: "none" }),
  row("voice", { owner: "operation", status: "partial", requestable: true, executable: false, operationIds: ["voice.input.listen", "voice.output.speak"], permission: "multiple", successState: "voice_result_recorded", writeAuthority: "ConversationV2", memoryPolicy: "evidence_only" }),
  row("device.camera", { owner: "operation", status: "partial", requestable: true, executable: true, operationIds: ["camera.capture.get_status", "camera.capture.capture"], permission: "multiple", successState: "camera_capture_saved", writeAuthority: "MediaStore", memoryPolicy: "evidence_only" }),
  row("device.location", { owner: "operation", status: "partial", requestable: true, executable: true, operationIds: ["location.current.get_current"], permission: "multiple", successState: "location_read", writeAuthority: "DeviceResult", memoryPolicy: "external_only" }),
  row("device.screen", { owner: "operation", status: "partial", requestable: true, executable: true, operationIds: ["screen.capture.capture"], permission: "multiple", successState: "screen_capture_read", writeAuthority: "DeviceResult", memoryPolicy: "evidence_only" }),
  row("device.notification", { owner: "operation", status: "partial", requestable: true, executable: true, operationIds: ["notification.send.send"], permission: "multiple", successState: "notification_sent", writeAuthority: "NotificationService", memoryPolicy: "evidence_only" }),
  row("autonomy", { owner: "business_record", status: "online", requestable: true, executable: true, successState: "autonomy_policy_saved", writeAuthority: "AutonomyPrefs", memoryPolicy: "none" }),
  row("web.weather", { owner: "operation", status: "online", requestable: true, executable: true, operationIds: ["web.weather.lookup"], permission: "provider", successState: "weather_result_received", writeAuthority: "ToolRunReceipt", memoryPolicy: "external_only" }),
  row("web.search", { owner: "operation", status: "default_off", requestable: false, executable: false, operationIds: ["web.search.search"], permission: "provider", successState: "search_result_received", writeAuthority: "ToolRunReceipt", memoryPolicy: "external_only" }),
  row("scenario", { owner: "ui", status: "closed", requestable: false, executable: false, successState: "scenario_run_recorded", writeAuthority: "ScenarioRunStore", memoryPolicy: "fiction_only", realityNamespace: "shared_fiction" }),
  row("scroll", { owner: "ui", status: "closed", requestable: false, executable: false, successState: "scroll_event_recorded", writeAuthority: "ScrollStore", memoryPolicy: "fiction_only", realityNamespace: "shared_fiction" }),
  row("cocreate", { owner: "business_record", status: "closed", requestable: false, executable: false, successState: "artifact_version_saved", writeAuthority: "ArtifactRepository", memoryPolicy: "candidate", realityNamespace: "creative_work" }),
  row("adventure", { owner: "ui", status: "closed", requestable: false, executable: false, successState: "adventure_turn_recorded", writeAuthority: "AdventureStore", memoryPolicy: "fiction_only", realityNamespace: "shared_fiction" }),
  row("games", { owner: "ui", status: "online", requestable: false, executable: false, successState: "game_session_saved", writeAuthority: "GameStore", memoryPolicy: "fiction_only", realityNamespace: "simulation" }),
  row("assistant", { owner: "executor", status: "online", requestable: false, executable: false, successState: "task_outcome_recorded", writeAuthority: "UnifiedTaskRepository", memoryPolicy: "evidence_only" }),
  row("skill-platform", { owner: "executor", status: "online", requestable: false, executable: false, successState: "skill_run_recorded", permission: "multiple", writeAuthority: "SkillRunAudit", memoryPolicy: "evidence_only" }),
  row("task-center", { owner: "business_record", status: "partial", requestable: true, executable: true, successState: "task_state_changed", permission: "explicit_approval", writeAuthority: "UnifiedTaskRepository", memoryPolicy: "evidence_only" }),
  row("agent-permissions", { owner: "business_record", status: "partial", requestable: true, executable: true, successState: "permission_grant_saved", permission: "explicit_approval", writeAuthority: "PermissionBroker", memoryPolicy: "none" }),
  row("resource-library", { owner: "business_record", status: "partial", requestable: true, executable: true, successState: "resource_imported", permission: "user_gesture", writeAuthority: "ResourceIndex", memoryPolicy: "none" }),
  row("billing-credit", { owner: "external", status: "online", requestable: false, executable: false, successState: "billing_ledger_updated", permission: "account", writeAuthority: "BillingLedger", memoryPolicy: "none" }),
  row("nyra-coin", { owner: "business_record", status: "online", requestable: false, executable: false, successState: "economy_transaction_committed", permission: "explicit_approval", writeAuthority: "EconomyLedger", memoryPolicy: "lived_fact" }),
  row("qishi-market", { owner: "business_record", status: "online", requestable: false, executable: false, successState: "catalog_install_or_purchase_recorded", permission: "multiple", writeAuthority: "CatalogAndEconomy", memoryPolicy: "evidence_only" }),
  row("settings-lab", { owner: "business_record", status: "online", requestable: true, executable: true, successState: "setting_saved", permission: "user_gesture", writeAuthority: "SettingsStore", memoryPolicy: "none" }),
  row("appearance", { owner: "business_record", status: "online", requestable: true, executable: true, successState: "theme_applied", permission: "user_gesture", writeAuthority: "ThemePrefs", memoryPolicy: "none" }),
  row("backup-restore", { owner: "business_record", status: "partial", requestable: false, executable: false, successState: "backup_or_restore_completed", permission: "user_gesture", writeAuthority: "BackupAuthority", memoryPolicy: "none" }),
]);

export function featureAuditSnapshot() {
  return FEATURE_AUDIT_ROWS.map((item) => JSON.parse(JSON.stringify(item)));
}
