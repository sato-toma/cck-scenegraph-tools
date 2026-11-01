import { SceneGraph, ValidationIssue } from "../../domain/types";

export interface DiagnosticRuleContext {
  source: string;
  sourceFilePath: string;
  sceneGraphPath: string;
  sceneGraph: SceneGraph;
}

export interface DiagnosticRule {
  id: string;
  analyze(context: DiagnosticRuleContext): ValidationIssue[];
}
