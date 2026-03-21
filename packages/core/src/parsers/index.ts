export { detectLanguage, isLineComment, isImportLine } from "./file.js";
export type { LanguageInfo } from "./file.js";

export {
  tryLoadTreeSitter,
  isTreeSitterAvailable,
  clearLanguageCache,
  setWasmLocator,
} from "./tree-sitter.js";
export type {
  SignatureInfo,
  TreeSitterApi,
  TreeSitterUnavailable,
  TreeSitterResult,
} from "./tree-sitter.js";
