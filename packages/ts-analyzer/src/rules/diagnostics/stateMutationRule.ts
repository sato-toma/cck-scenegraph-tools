import { TypeScriptCodeParser } from "../../analysis/typeScriptParser";
import { DiagnosticRule } from "./types";

export const stateMutationRule: DiagnosticRule = {
  id: "state-mutation",
  analyze({ source }) {
    return TypeScriptCodeParser.extractInvalidStateMutationsFromString(source).map(
      (mutation) => ({
        line: mutation.line,
        column: mutation.column,
        severity: "error",
        code: "INVALID_STATE_MUTATION",
        message: `Directly mutating $.state.${mutation.propertyName} with property assignment or array/object mutating methods does not update state. Use a temporary variable, modify it, and reassign it back to $.state.${mutation.propertyName}.`,
        apiCall: `$.state.${mutation.propertyName}.push`,
        requiredComponents: [],
        availableComponents: [],
      }),
    );
  },
};
