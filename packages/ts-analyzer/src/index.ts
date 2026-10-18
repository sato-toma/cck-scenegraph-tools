// Core exports
export { SceneGraphParser } from "./sceneGraph/sceneGraphParser";
export { TypeScriptCodeParser } from "./analysis/typeScriptParser";
export { ConstraintValidator } from "./validation/constraintValidator";
export { ClusterScriptDefinitions } from "./rules/clusterScriptDefinitions";
export { ClusterScriptAnalyzer } from "./analysis/analyzer";
export { ComponentRequirementExtractor } from "./analysis/componentRequirements/extractor";
export { ComponentRequirementValidator } from "./analysis/componentRequirements/validator";
export {
  applyApprovedComponentChangePlan,
  applyApprovedComponentChangePlanViaUnityCliMcp,
  applyAndVerifyComponentChangePlanViaUnityCliMcp,
  approveComponentChangePlan,
  COMPONENT_CHANGE_ACTION_STATUSES,
  COMPONENT_CHANGE_CHECK_STATUSES,
  COMPONENT_CHANGE_VERIFICATION_STATUSES,
  ComponentChangeApplicationError,
  createComponentChangePlan,
  excludeComponentChangeReviewItem,
  getApprovedComponentChanges,
  rejectComponentChangePlan,
  resolveComponentChangeSettings,
} from "./analysis/componentChangePlan";
export { formatComponentChangePlan } from "./reporting/componentChangePlanFormatter";
export {
  ANALYSIS_REPORT_FORMATS,
  formatGitHubActionsAnnotations,
  formatJsonAnalysisReport,
  formatSarifAnalysisReport,
  formatStructuredAnalysisReport,
  formatVSCodeProblems,
} from "./reporting/structuredAnalysisFormatter";
export type {
  AnalysisReportFormat,
  StructuredAnalysisReportFormat,
} from "./reporting/structuredAnalysisFormatter";
export {
  formatComponentChangeVerificationReport,
} from "./reporting/componentChangeVerificationFormatter";
export {
  COMPONENT_REQUIREMENT_STATUSES,
  formatComponentRequirementStatusCounts,
  hasMissingComponentRequirements,
  hasUnverifiedComponentRequirements,
  summarizeComponentRequirements,
} from "./analysis/componentRequirements/summary";
export { WorldUploadValidator } from "./validation/worldUploadValidator";
export {
  McpSceneAdapter,
  McpSceneAdapterError,
} from "./sceneGraph/mcpSceneAdapter";
export { ruleSets, stateMutationRuleSets } from "./rules";

// Type exports
export type {
  McpComponent,
  McpGameObject,
  McpSceneAdapterResult,
  McpSceneDiagnostic,
  McpSceneSnapshot,
} from "./sceneGraph/mcpSceneAdapter";
export type {
  ComponentChangeApplicationRecord,
  ComponentChangeActionStatus,
  ComponentChangeCheckStatus,
  ComponentChangeVerificationAction,
  ComponentChangeVerificationDependencies,
  ComponentChangeVerificationOptions,
  ComponentChangeVerificationReport,
  ComponentChangeVerificationStatus,
  ApprovedComponentChangePlan,
  ComponentChangeAction,
  ComponentChangePlan,
  ComponentChangePlanApprovalConfirmation,
  ComponentChangePlanStatus,
  ComponentChangeReviewItem,
  ComponentChangeReviewReason,
  UnityCliMcpApplicationOptions,
  UnityComponentApplicationBridge,
  UnityComponentApplicationTarget,
} from "./analysis/componentChangePlan";
export type {
  SceneGraph,
  GameObject,
  Component,
  ComponentConstraint,
  ApiMethod,
  ApiProperty,
  ClusterScriptDefinition,
  AnalysisResult,
  ComponentRequirementRequest,
  ComponentRequirementVerificationStatus,
  ComponentRequirementStatusCounts,
  ComponentRequirementOccurrence,
  MatchedSceneComponent,
  ValidationIssue,
  ComponentAnalysisCache,
  ComponentProperty,
  ComponentPropertyValue,
} from "./domain/types";
