import {
  ApiMethod,
  ApiProperty,
  ClusterScriptDefinition,
  ComponentConstraint,
} from "../domain/types";
import { ruleSets } from "./index";

/**
 * ClusterScript APIの定義と制約を管理
 * 参考: https://docs.cluster.mu/script/interfaces/ClusterScript.html
 */

export class ClusterScriptDefinitions {
  private static definitions: ClusterScriptDefinition | null = null;

  /**
   * ClusterScript定義をシングルトンで取得
   */
  static getDefinitions(): ClusterScriptDefinition {
    if (!this.definitions) {
      this.definitions = this.buildDefinitions();
    }
    return this.definitions;
  }

  /**
   * 定義を構築
   */
  private static buildDefinitions(): ClusterScriptDefinition {
    const methods = new Map<string, ApiMethod>();
    const properties = new Map<string, ApiProperty>();

    for (const ruleSet of Object.values(ruleSets)) {
      for (const method of ruleSet.methods) {
        methods.set(method.name, method);
      }
      for (const property of ruleSet.properties) {
        properties.set(property.name, property);
      }
    }

    return {
      methods,
      properties,
    };
  }

  /**
   * メソッドの必須コンポーネントを取得
   */
  static getMethodConstraints(methodName: string): ComponentConstraint[] {
    const method = this.getDefinitions().methods.get(methodName);
    return method ? method.requiredComponents : [];
  }

  /**
   * プロパティの必須コンポーネントを取得
   */
  static getPropertyConstraints(propertyName: string): ComponentConstraint[] {
    const property = this.getDefinitions().properties.get(propertyName);
    return property ? property.requiredComponents : [];
  }

  /**
   * 利用可能なすべてのメソッド名を取得
   */
  static getAllMethodNames(): string[] {
    return Array.from(this.getDefinitions().methods.keys());
  }

  /**
   * 利用可能なすべてのプロパティ名を取得
   */
  static getAllPropertyNames(): string[] {
    return Array.from(this.getDefinitions().properties.keys());
  }
}
