import * as fs from "fs";

/**
 * TypeScript コードの簡易パーサー（静的解析用）
 * 注: 完全なTypeScript ASTパーサーではなく、正規表現ベースの簡易実装です。
 * より正確な解析が必要な場合は typescript コンパイラAPIの使用を推奨します。
 */
export class TypeScriptCodeParser {
  /**
   * ファイルからすべてのメソッドチェーンと関数呼び出しを抽出
   */
  static extractApiCalls(filePath: string): Array<{
    line: number;
    column: number;
    methodName: string;
    receiver: string;
    fullExpression: string;
  }> {
    const content = fs.readFileSync(filePath, "utf-8");
    return this.extractApiCallsFromString(content);
  }

  /**
   * コード文字列からAPIコールを抽出
   */
  static extractApiCallsFromString(content: string): Array<{
    line: number;
    column: number;
    methodName: string;
    receiver: string;
    fullExpression: string;
  }> {
    const results: Array<{
      line: number;
      column: number;
      methodName: string;
      receiver: string;
      fullExpression: string;
    }> = [];

    const lines = content.split("\n");

    // パターン: receiver.methodName(...)
    // receiver には $, player, item など
    const methodCallPattern = /(\w+\.)*\$\.(\w+)\s*\(/g;
    const propertyAccessPattern = /(\w+\.)*\$\.(\w+)(?!\s*\()/g;

    lines.forEach((line: string, lineIndex: number) => {
      let match: RegExpExecArray | null;

      // メソッド呼び出しを検出
      while ((match = methodCallPattern.exec(line)) !== null) {
        results.push({
          line: lineIndex + 1,
          column: match.index,
          methodName: match[2]!,
          receiver: "$",
          fullExpression: match[0].trim(),
        });
      }

      // プロパティアクセスを検出（メソッドではない）
      const tempPattern = new RegExp(propertyAccessPattern.source, "g");
      while ((match = tempPattern.exec(line)) !== null) {
        // メソッド呼び出しかどうか再確認
        const nextChar = line[match.index + match[0].length];
        if (nextChar !== "(") {
          results.push({
            line: lineIndex + 1,
            column: match.index,
            methodName: match[2]!,
            receiver: "$",
            fullExpression: match[0].trim(),
          });
        }
      }
    });

    return results;
  }

  /**
   * TypeScriptコードからコンポーネント制約が関連するAPIを抽出
   */
  static extractConstraintRelevantCalls(
    filePath: string,
    relevantApiNames: string[],
  ): Array<{
    line: number;
    column: number;
    methodName: string;
    receiver: string;
    fullExpression: string;
  }> {
    const allCalls = this.extractApiCalls(filePath);
    const apiSet = new Set(relevantApiNames);

    return allCalls.filter((call) => apiSet.has(call.methodName));
  }

  /**
   * `$.state.*.push(...)` のようなstateの直接ミューテーションを検出
   */
  static extractInvalidStateMutationsFromString(content: string): Array<{
    line: number;
    column: number;
    propertyName: string;
    fullExpression: string;
  }> {
    const lines = content.split("\n");
    const results: Array<{
      line: number;
      column: number;
      propertyName: string;
      fullExpression: string;
    }> = [];

    const mutatingMethodPattern =
      /\$\s*\.\s*state\s*(?:\.\s*([A-Za-z_$][\w$]*)|\[\s*['"]([^'"]+)['"]\s*\])(?:\s*(?:\.\s*[A-Za-z_$][\w$]*|\[\s*['"][^'"]+['"]\s*\]))*\s*\.(push|splice|pop|shift|unshift|sort|reverse)\s*\(/g;
    const nestedAssignmentPattern =
      /\$\s*\.\s*state\s*(?:\.\s*([A-Za-z_$][\w$]*)|\[\s*['"]([^'"]+)['"]\s*\])(?:\s*(?:\.\s*[A-Za-z_$][\w$]*|\[\s*['"][^'"]+['"]\s*\]))+\s*(?:[+\-*/%&|^]?=|--|\+\+)/g;

    lines.forEach((line: string, lineIndex: number) => {
      let match: RegExpExecArray | null;

      while ((match = mutatingMethodPattern.exec(line)) !== null) {
        results.push({
          line: lineIndex + 1,
          column: match.index,
          propertyName: match[1] ?? match[2] ?? "",
          fullExpression: match[0].trim(),
        });
      }

      while ((match = nestedAssignmentPattern.exec(line)) !== null) {
        results.push({
          line: lineIndex + 1,
          column: match.index,
          propertyName: match[1] ?? match[2] ?? "",
          fullExpression: match[0].trim(),
        });
      }
    });

    return results;
  }

  static extractInvalidStateMutations(filePath: string): Array<{
    line: number;
    column: number;
    propertyName: string;
    fullExpression: string;
  }> {
    const content = fs.readFileSync(filePath, "utf-8");
    return this.extractInvalidStateMutationsFromString(content);
  }

  /**
   * コンポーネント取得呼び出しを検出
   * 例: $.getUnityComponent("UnityEngine.Rigidbody")
   */
  static extractGetUnityComponentCalls(content: string): Array<{
    line: number;
    column: number;
    componentType: string;
  }> {
    const results: Array<{
      line: number;
      column: number;
      componentType: string;
    }> = [];

    const lines = content.split("\n");
    const pattern = /\$\.getUnityComponent\s*\(\s*["\']([^"\']+)["\']\s*\)/g;

    lines.forEach((line: string, lineIndex: number) => {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line)) !== null) {
        results.push({
          line: lineIndex + 1,
          column: match.index,
          componentType: match[1]!,
        });
      }
    });

    return results;
  }

  /**
   * オブジェクト定義やコンポーネント参照の取得
   */
  static extractVariableAssignments(
    content: string,
    pattern: RegExp = /const\s+(\w+)\s*=\s*\$\.(\w+)/g,
  ): Array<{
    line: number;
    variableName: string;
    apiMethod: string;
  }> {
    const results: Array<{
      line: number;
      variableName: string;
      apiMethod: string;
    }> = [];

    const lines = content.split("\n");

    lines.forEach((line: string, lineIndex: number) => {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line)) !== null) {
        results.push({
          line: lineIndex + 1,
          variableName: match[1]!,
          apiMethod: match[2]!,
        });
      }
    });

    return results;
  }

  /**
   * 条件付きAPIコール（if文内）を検出
   */
  static extractConditionalApiCalls(content: string): Array<{
    line: number;
    condition: string;
    apiCall: string;
  }> {
    const results: Array<{
      line: number;
      condition: string;
      apiCall: string;
    }> = [];

    const lines = content.split("\n");
    let inConditional = false;
    let condition = "";

    for (let i = 0; i < lines.length; i++) {
      const line: string = lines[i]!;

      // if文の開始を検出
      const ifMatch = line.match(/if\s*\((.*?)\)\s*\{?/);
      if (ifMatch) {
        inConditional = true;
        condition = ifMatch[1]!;
      }

      // 括弧の閉じ検出
      if (inConditional && line.includes("}")) {
        inConditional = false;
      }

      if (inConditional) {
        const apiCallMatch = line.match(/\$\.(\w+)\s*\(/);
        if (apiCallMatch) {
          results.push({
            line: i + 1,
            condition: condition,
            apiCall: apiCallMatch[1]!,
          });
        }
      }
    }

    return results;
  }

  /**
   * コードの複雑度を計算（簡易）
   */
  static calculateCodeComplexity(content: string): number {
    let complexity = 1; // ベース値

    // 条件分岐の数
    complexity += (content.match(/if\s*\(/g) || []).length;
    complexity += (content.match(/\?.*:/g) || []).length;

    // ループの数
    complexity += (content.match(/for\s*\(/g) || []).length;
    complexity += (content.match(/while\s*\(/g) || []).length;

    // 関数呼び出しの深さ（簡易）
    complexity += (content.match(/\$\.\w+\s*\(/g) || []).length * 0.5;

    return Math.ceil(complexity);
  }

  /**
   * 関数定義を抽出
   */
  static extractFunctionDefinitions(content: string): Array<{
    name: string;
    line: number;
    params: string[];
  }> {
    const results: Array<{
      name: string;
      line: number;
      params: string[];
    }> = [];

    const lines = content.split("\n");
    const functionPattern =
      /(?:function|const)\s+(\w+)\s*(?:=\s*)?(?:\(\s*([^)]*)\s*\)|function)/g;

    lines.forEach((line: string, lineIndex: number) => {
      let match: RegExpExecArray | null;
      while ((match = functionPattern.exec(line)) !== null) {
        const params = (match[2] || "")
          .split(",")
          .map((p) => p.trim())
          .filter((p) => p);

        results.push({
          name: match[1]!,
          line: lineIndex + 1,
          params,
        });
      }
    });

    return results;
  }
}
