import {
  CallbackContextAnalyzer,
  TopLevelApiCallStatus,
} from "./callbackContextAnalyzer";

export { TopLevelApiCallStatus } from "./callbackContextAnalyzer";

export class TopLevelApiCallAnalyzer {
  static analyze(
    content: string,
    methodName: string,
  ): Map<string, TopLevelApiCallStatus> {
    return CallbackContextAnalyzer.analyzeTopLevelApiCalls(content, methodName);
  }
}
