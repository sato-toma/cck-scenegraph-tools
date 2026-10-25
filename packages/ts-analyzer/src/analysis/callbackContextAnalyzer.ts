interface Token {
  text: string;
  start: number;
  end: number;
}

interface SourceRange {
  start: number;
  end: number;
}

export type CallbackContextStatus = "inside" | "outside" | "unverified";

export class CallbackContextAnalyzer {
  static analyze(
    content: string,
    methodName: string,
    callbackName: string,
  ): Map<string, CallbackContextStatus> {
    const tokens = this.tokenize(content);
    const matchingDelimiters = this.findMatchingDelimiters(tokens);
    const namedCallbacks = this.findNamedCallbacks(tokens, matchingDelimiters);
    const functionRanges = this.findFunctionRanges(tokens, matchingDelimiters);
    const physicsCallbacks: SourceRange[] = [];
    const otherCallbacks: SourceRange[] = [];

    for (let index = 0; index + 3 < tokens.length; index += 1) {
      if (
        tokens[index]?.text !== "$" ||
        tokens[index + 1]?.text !== "." ||
        !tokens[index + 2]?.text?.startsWith("on") ||
        tokens[index + 3]?.text !== "("
      ) {
        continue;
      }

      const calledCallback = tokens[index + 2]!.text;
      const callEnd = matchingDelimiters.get(index + 3);
      if (callEnd === undefined) {
        continue;
      }
      const argumentStart = index + 4;
      const argumentEnd = this.findFirstArgumentEnd(
        tokens,
        matchingDelimiters,
        argumentStart,
        callEnd,
      );
      const callbackRange = this.findCallbackRange(
        tokens,
        matchingDelimiters,
        argumentStart,
        argumentEnd,
        namedCallbacks,
      );
      if (callbackRange) {
        (calledCallback === callbackName
          ? physicsCallbacks
          : otherCallbacks
        ).push(callbackRange);
      }
    }

    const results = new Map<string, CallbackContextStatus>();
    for (let index = 0; index + 3 < tokens.length; index += 1) {
      if (
        tokens[index]?.text !== "$" ||
        tokens[index + 1]?.text !== "." ||
        tokens[index + 2]?.text !== methodName ||
        tokens[index + 3]?.text !== "("
      ) {
        continue;
      }

      const callOffset = tokens[index]!.start;
      const lineStart = content.lastIndexOf("\n", callOffset - 1) + 1;
      const line = content.slice(0, lineStart).split("\n").length;
      const column = callOffset - lineStart;
      const key = `${line}:${column}`;
      const containingPhysicsCallbacks = physicsCallbacks
        .filter((range) => this.contains(range, callOffset))
        .sort((left, right) => left.end - left.start - (right.end - right.start));
      const physicsCallback = containingPhysicsCallbacks[0];

      if (physicsCallback) {
        const isNestedFunction = functionRanges.some(
          (range) =>
            range.start >= physicsCallback.start &&
            range.end <= physicsCallback.end &&
            this.contains(range, callOffset) &&
            (range.start !== physicsCallback.start ||
              range.end !== physicsCallback.end),
        );
        results.set(key, isNestedFunction ? "unverified" : "inside");
      } else if (
        otherCallbacks.some((range) => this.contains(range, callOffset))
      ) {
        results.set(key, "outside");
      } else if (functionRanges.some((range) => this.contains(range, callOffset))) {
        results.set(key, "unverified");
      } else {
        results.set(key, "outside");
      }
    }

    return results;
  }

  private static tokenize(content: string): Token[] {
    const tokenPattern =
      /\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|=>|[A-Za-z_$][\w$]*|./g;
    const tokens: Token[] = [];

    for (const match of content.matchAll(tokenPattern)) {
      const text = match[0];
      if (/^(?:\/\/|\/\*|["'`])/.test(text) || /^\s+$/.test(text)) {
        continue;
      }
      const start = match.index;
      tokens.push({ text, start, end: start + text.length });
    }

    return tokens;
  }

  private static findMatchingDelimiters(tokens: Token[]): Map<number, number> {
    const openToClose = new Map([
      ["(", ")"],
      ["[", "]"],
      ["{", "}"],
    ]);
    const stack: Array<{ index: number; close: string }> = [];
    const pairs = new Map<number, number>();

    tokens.forEach((token, index) => {
      const close = openToClose.get(token.text);
      if (close) {
        stack.push({ index, close });
      } else if (token.text === ")" || token.text === "]" || token.text === "}") {
        const opening = stack[stack.length - 1];
        if (opening?.close === token.text) {
          stack.pop();
          pairs.set(opening.index, index);
          pairs.set(index, opening.index);
        }
      }
    });

    return pairs;
  }

  private static findNamedCallbacks(
    tokens: Token[],
    pairs: Map<number, number>,
  ): Map<string, SourceRange> {
    const callbacks = new Map<string, SourceRange>();

    for (let index = 0; index + 1 < tokens.length; index += 1) {
      if (tokens[index]?.text !== "function") {
        continue;
      }
      let cursor = index + 1;
      if (tokens[cursor]?.text === "*") {
        cursor += 1;
      }
      const name = tokens[cursor]?.text;
      while (cursor < tokens.length && tokens[cursor]?.text !== "(") {
        cursor += 1;
      }
      const parametersEnd = pairs.get(cursor);
      if (!name || parametersEnd === undefined) {
        continue;
      }
      const bodyStart = this.findNextToken(tokens, parametersEnd + 1, "{");
      const bodyEnd = bodyStart === undefined ? undefined : pairs.get(bodyStart);
      if (bodyStart !== undefined && bodyEnd !== undefined) {
        callbacks.set(name, this.rangeFromTokens(tokens, bodyStart, bodyEnd));
      }
    }

    for (let index = 0; index + 3 < tokens.length; index += 1) {
      if (
        !["const", "let", "var"].includes(tokens[index]!.text) ||
        !this.isIdentifier(tokens[index + 1]!.text) ||
        tokens[index + 2]?.text !== "="
      ) {
        continue;
      }
      const name = tokens[index + 1]!.text;
      const statementEnd = this.findStatementEnd(tokens, pairs, index + 3);
      const range = this.findCallbackRange(
        tokens,
        pairs,
        index + 3,
        statementEnd,
        callbacks,
      );
      if (range) {
        callbacks.set(name, range);
      }
    }

    return callbacks;
  }

  private static findFunctionRanges(
    tokens: Token[],
    pairs: Map<number, number>,
  ): SourceRange[] {
    const ranges: SourceRange[] = [];

    for (let index = 0; index < tokens.length; index += 1) {
      if (tokens[index]?.text === "function") {
        let parametersStart = index + 1;
        if (tokens[parametersStart]?.text === "*") {
          parametersStart += 1;
        }
        while (parametersStart < tokens.length && tokens[parametersStart]?.text !== "(") {
          parametersStart += 1;
        }
        const parametersEnd = pairs.get(parametersStart);
        if (parametersEnd !== undefined) {
          const bodyStart = this.findNextToken(tokens, parametersEnd + 1, "{");
          const bodyEnd = bodyStart === undefined ? undefined : pairs.get(bodyStart);
          if (bodyStart !== undefined && bodyEnd !== undefined) {
            ranges.push(this.rangeFromTokens(tokens, bodyStart, bodyEnd));
          }
        }
      }

      if (tokens[index]?.text === "=>") {
        const range = this.findArrowBodyRange(tokens, pairs, index, tokens.length);
        if (range) {
          ranges.push(range);
        }
      }
    }

    return ranges;
  }

  private static findCallbackRange(
    tokens: Token[],
    pairs: Map<number, number>,
    start: number,
    end: number,
    namedCallbacks: Map<string, SourceRange>,
  ): SourceRange | undefined {
    let first = start;
    let last = end;
    while (
      tokens[first]?.text === "(" &&
      pairs.get(first) === last - 1
    ) {
      first += 1;
      last -= 1;
    }
    if (first >= last) {
      return undefined;
    }
    if (tokens[first]?.text === "async") {
      first += 1;
    }
    if (tokens[first]?.text === "function") {
      let parametersStart = first + 1;
      if (tokens[parametersStart]?.text === "*") {
        parametersStart += 1;
      }
      while (parametersStart < last && tokens[parametersStart]?.text !== "(") {
        parametersStart += 1;
      }
      const parametersEnd = pairs.get(parametersStart);
      const bodyStart =
        parametersEnd === undefined
          ? undefined
          : this.findNextToken(tokens, parametersEnd + 1, "{");
      const bodyEnd = bodyStart === undefined ? undefined : pairs.get(bodyStart);
      return bodyStart !== undefined && bodyEnd !== undefined
        ? this.rangeFromTokens(tokens, bodyStart, bodyEnd)
        : undefined;
    }
    if (
      last === first + 1 &&
      this.isIdentifier(tokens[first]!.text)
    ) {
      return namedCallbacks.get(tokens[first]!.text);
    }

    let cursor = first;
    while (cursor < last) {
      if (["(", "[", "{"].includes(tokens[cursor]!.text)) {
        const close = pairs.get(cursor);
        if (close !== undefined && close < last) {
          cursor = close + 1;
          continue;
        }
      }
      if (tokens[cursor]?.text === "=>") {
        return this.findArrowBodyRange(tokens, pairs, cursor, last);
      }
      cursor += 1;
    }

    return undefined;
  }

  private static findArrowBodyRange(
    tokens: Token[],
    pairs: Map<number, number>,
    arrowIndex: number,
    end: number,
  ): SourceRange | undefined {
    const bodyStart = arrowIndex + 1;
    if (tokens[bodyStart]?.text === "{") {
      const bodyEnd = pairs.get(bodyStart);
      return bodyEnd === undefined
        ? undefined
        : this.rangeFromTokens(tokens, bodyStart, bodyEnd);
    }

    const expressionEnd = this.findExpressionEnd(tokens, pairs, bodyStart, end);
    return bodyStart < expressionEnd
      ? this.rangeFromTokens(tokens, bodyStart, expressionEnd - 1)
      : undefined;
  }

  private static findExpressionEnd(
    tokens: Token[],
    pairs: Map<number, number>,
    start: number,
    end: number,
  ): number {
    let cursor = start;
    while (cursor < end) {
      if (["(", "[", "{"].includes(tokens[cursor]!.text)) {
        const close = pairs.get(cursor);
        if (close !== undefined && close < end) {
          cursor = close + 1;
          continue;
        }
      }
      if ([",", ";", ")", "]", "}"].includes(tokens[cursor]!.text)) {
        break;
      }
      cursor += 1;
    }
    return cursor;
  }

  private static findStatementEnd(
    tokens: Token[],
    pairs: Map<number, number>,
    start: number,
  ): number {
    let cursor = start;
    while (cursor < tokens.length) {
      if (["(", "[", "{"].includes(tokens[cursor]!.text)) {
        const close = pairs.get(cursor);
        if (close !== undefined) {
          cursor = close + 1;
          continue;
        }
      }
      if (tokens[cursor]?.text === ";") {
        return cursor;
      }
      cursor += 1;
    }
    return tokens.length;
  }

  private static findFirstArgumentEnd(
    tokens: Token[],
    pairs: Map<number, number>,
    start: number,
    callEnd: number,
  ): number {
    let cursor = start;
    while (cursor < callEnd) {
      if (["(", "[", "{"].includes(tokens[cursor]!.text)) {
        const close = pairs.get(cursor);
        if (close !== undefined && close < callEnd) {
          cursor = close + 1;
          continue;
        }
      }
      if (tokens[cursor]?.text === ",") {
        return cursor;
      }
      cursor += 1;
    }
    return callEnd;
  }

  private static findNextToken(
    tokens: Token[],
    start: number,
    text: string,
  ): number | undefined {
    for (let index = start; index < tokens.length; index += 1) {
      if (tokens[index]?.text === text) {
        return index;
      }
    }
    return undefined;
  }

  private static rangeFromTokens(
    tokens: Token[],
    start: number,
    end: number,
  ): SourceRange {
    return { start: tokens[start]!.start, end: tokens[end]!.end };
  }

  private static contains(range: SourceRange, offset: number): boolean {
    return range.start <= offset && offset < range.end;
  }

  private static isIdentifier(text: string): boolean {
    return /^[A-Za-z_$][\w$]*$/.test(text);
  }
}
