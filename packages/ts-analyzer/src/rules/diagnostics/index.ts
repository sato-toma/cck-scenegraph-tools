import { MaterialApiValidator } from "./materialApiRule";
import { SetStateCompatArgumentValidator } from "./setStateCompatArgumentsRule";
import { SetVisiblePlayersArgumentValidator } from "./setVisiblePlayersArgumentsRule";
import { SubNodeExistenceValidator } from "./subNodeExistenceRule";
import { DiagnosticRule, DiagnosticRuleContext } from "./types";
import { apiMethodRule } from "./apiMethodRule";
import { stateMutationRule } from "./stateMutationRule";

export const diagnosticRules: readonly DiagnosticRule[] = [
  {
    id: "set-state-compat-arguments",
    analyze: ({ source }) => SetStateCompatArgumentValidator.validate(source),
  },
  {
    id: "set-visible-players-arguments",
    analyze: ({ source }) => SetVisiblePlayersArgumentValidator.validate(source),
  },
  {
    id: "sub-node-existence",
    analyze: (context) =>
      SubNodeExistenceValidator.validate(
        context.source,
        context.sceneGraphPath,
        context.sceneGraph,
        context.sourceFilePath,
      ),
  },
  {
    id: "material-api",
    analyze: (context) =>
      MaterialApiValidator.validate(
        context.source,
        context.sceneGraphPath,
        context.sceneGraph,
        context.sourceFilePath,
      ),
  },
  apiMethodRule,
  stateMutationRule,
];

export function runDiagnosticRules(
  context: DiagnosticRuleContext,
): ReturnType<DiagnosticRule["analyze"]> {
  return diagnosticRules.flatMap((rule) => rule.analyze(context));
}

export type { DiagnosticRule, DiagnosticRuleContext } from "./types";
