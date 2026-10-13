/**
 * SceneGraph TOML型定義
 */

export type ComponentPropertyValue =
  | string
  | number
  | boolean
  | ComponentPropertyValue[];

export interface ComponentProperty {
  [key: string]: ComponentPropertyValue;
}

export interface Component {
  id: string;
  type: string;
  enabled: boolean;
  properties?: ComponentProperty;
}

export interface GameObject {
  id: string;
  path: string;
  name: string;
  parent: string;
  components: Component[];
}

export interface SceneGraph {
  project: string;
  gameObjects: GameObject[];
}

/**
 * ClusterScript コンポーネント制約
 */

export type ComponentRequirement = "required" | "optional" | "forbidden";

export interface ComponentConstraint {
  /** A single Unity component full name, or an array meaning "any of these types". */
  componentType: string | string[];
  requirement: ComponentRequirement;
  properties?: {
    [key: string]: {
      type: string;
      value?: any;
      values?: any[];
    };
  };
}

export interface ApiMethod {
  name: string;
  requiredComponents: ComponentConstraint[];
  parameterTypes?: string[];
  returnType?: string;
  description?: string;
}

export interface ApiProperty {
  name: string;
  requiredComponents: ComponentConstraint[];
  type?: string;
  readable?: boolean;
  writable?: boolean;
  description?: string;
}

export interface ClusterScriptDefinition {
  methods: Map<string, ApiMethod>;
  properties: Map<string, ApiProperty>;
}

/**
 * 静的解析結果
 */

export interface AnalysisResult {
  filePath: string;
  issues: ValidationIssue[];
  componentRequests: ComponentRequirementRequest[];
  summary: {
    totalIssues: number;
    errorCount: number;
    warningCount: number;
  };
}

export interface ComponentRequirementRequest {
  id: string;
  api: string;
  componentTypes: string[];
  componentMatch: "all" | "any" | "unknown";
  target: ComponentRequirementTarget;
  verificationStatus:
    | "satisfied"
    | "missing"
    | "ambiguous"
    | "unsupported"
    | "unverified";
  verificationReason?: string;
  validation: {
    presentComponentTypes: string[];
    missingComponentTypes: string[];
    matchedComponents: MatchedSceneComponent[];
  };
  occurrences: ComponentRequirementOccurrence[];
}

export interface ComponentRequirementTarget {
  kind: "current-scriptable-item";
  resolution: "resolved" | "ambiguous" | "unresolved";
  gameObjectId?: string;
  gameObjectPath?: string;
  candidates?: Array<{
    gameObjectId: string;
    gameObjectPath: string;
  }>;
}

export interface MatchedSceneComponent {
  gameObjectId: string;
  gameObjectPath: string;
  componentId: string;
  componentType: string;
}

export interface ComponentRequirementOccurrence {
  source: {
    filePath: string;
    line: number;
    column: number;
  };
  condition: {
    kind: "unconditional" | "conditional" | "unknown";
    expression?: string;
  };
  evidence: string;
  confidence: "high" | "low";
}

export interface ValidationIssue {
  line: number;
  column: number;
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  apiCall: string;
  requiredComponents: string[];
  availableComponents: string[];
}

/**
 * コンポーネント分析キャッシュ
 */

export interface ComponentAnalysisCache {
  gameObjectId: string;
  gameObjectPath: string;
  components: Map<string, Component>;
  missingRequired: string[];
  extraForbidden: string[];
}
