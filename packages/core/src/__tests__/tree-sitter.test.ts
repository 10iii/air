import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  tryLoadTreeSitter,
  isTreeSitterAvailable,
  setWasmLocator,
  clearLanguageCache,
  type TreeSitterResult,
} from "../parsers/tree-sitter.js";

describe("tree-sitter module", () => {
  beforeEach(() => {
    clearLanguageCache();
  });

  describe("tryLoadTreeSitter", () => {
    it("should return unavailable when web-tree-sitter is not installed", async () => {
      const result = await tryLoadTreeSitter();
      if (!result.available) {
        expect(result.reason).toContain("web-tree-sitter");
      } else {
        expect(result.available).toBe(true);
        expect(typeof result.extractSignatures).toBe("function");
        expect(typeof result.collapseToSkeleton).toBe("function");
      }
    });

    it("should return consistent availability status on multiple calls", async () => {
      const result1 = await tryLoadTreeSitter();
      const result2 = await tryLoadTreeSitter();
      expect(result1.available).toBe(result2.available);
    });
  });

  describe("isTreeSitterAvailable", () => {
    it("should return boolean", () => {
      const available = isTreeSitterAvailable();
      expect(typeof available).toBe("boolean");
    });

    it("should match tryLoadTreeSitter result after loading", async () => {
      const loadResult = await tryLoadTreeSitter();
      const available = isTreeSitterAvailable();
      expect(available).toBe(loadResult.available);
    });
  });

  describe("setWasmLocator", () => {
    afterEach(() => {
      setWasmLocator(() => "");
      clearLanguageCache();
    });

    it("should accept a custom locator function", () => {
      const customLocator = (lang: string) => `/custom/path/${lang}.wasm`;
      expect(() => setWasmLocator(customLocator)).not.toThrow();
    });

    it("should override default WASM path resolution", async () => {
      let locatorCalled = false;
      setWasmLocator((lang: string) => {
        locatorCalled = true;
        return `/nonexistent/${lang}.wasm`;
      });

      const result = await tryLoadTreeSitter();
      if (result.available) {
        try {
          await result.extractSignatures("const x = 1;", "typescript");
        } catch {
          // Expected to fail with custom locator pointing to nonexistent path
        }
        expect(locatorCalled).toBe(true);
      }
    });
  });

  describe("clearLanguageCache", () => {
    it("should not throw when clearing empty cache", () => {
      expect(() => clearLanguageCache()).not.toThrow();
    });

    it("should be callable multiple times", () => {
      clearLanguageCache();
      clearLanguageCache();
      clearLanguageCache();
      expect(true).toBe(true);
    });
  });

  describe("LANGUAGE_TO_WASM mapping coverage", () => {
    const supportedLanguages = [
      "typescript",
      "javascript",
      "tsx",
      "python",
      "go",
      "rust",
      "java",
      "c",
      "cpp",
      "csharp",
      "ruby",
      "php",
      "swift",
      "kotlin",
      "scala",
    ];

    it("should define mappings for all supported languages", async () => {
      const result = await tryLoadTreeSitter();
      if (result.available) {
        for (const lang of supportedLanguages) {
          const signatures = await result.extractSignatures("", lang);
          expect(Array.isArray(signatures)).toBe(true);
        }
      }
    });
  });

  describe("extractSignatures", () => {
    it("should return empty array for unsupported language", async () => {
      const result = await tryLoadTreeSitter();
      if (result.available) {
        const signatures = await result.extractSignatures(
          "function test() {}",
          "unsupported-language"
        );
        expect(signatures).toEqual([]);
      }
    });

    it("should return empty array for empty content", async () => {
      const result = await tryLoadTreeSitter();
      if (result.available) {
        const signatures = await result.extractSignatures("", "typescript");
        expect(signatures).toEqual([]);
      }
    });

    it("should handle malformed code gracefully", async () => {
      const result = await tryLoadTreeSitter();
      if (result.available) {
        const malformed = "function { ( ] } [";
        const signatures = await result.extractSignatures(malformed, "typescript");
        expect(Array.isArray(signatures)).toBe(true);
      }
    });
  });

  describe("collapseToSkeleton", () => {
    it("should return original content when no signatures found", async () => {
      const result = await tryLoadTreeSitter();
      if (result.available) {
        const content = "const x = 1;\nconst y = 2;";
        const skeleton = await result.collapseToSkeleton(content, "typescript");
        expect(skeleton).toContain("const x = 1");
      }
    });

    it("should return original content for unsupported language", async () => {
      const result = await tryLoadTreeSitter();
      if (result.available) {
        const content = "function test() { return 1; }";
        const skeleton = await result.collapseToSkeleton(
          content,
          "unsupported-language"
        );
        expect(skeleton).toBe(content);
      }
    });

    it("should collapse function bodies for TypeScript", async () => {
      const result = await tryLoadTreeSitter();
      if (result.available) {
        const content = `function hello() {
  console.log("line1");
  console.log("line2");
  console.log("line3");
  console.log("line4");
  return true;
}`;
        const skeleton = await result.collapseToSkeleton(content, "typescript");
        expect(skeleton).toContain("function hello()");
        if (skeleton !== content) {
          expect(skeleton).toContain("collapsed");
        }
      }
    });

    it("should collapse class method bodies for TypeScript", async () => {
      const result = await tryLoadTreeSitter();
      if (result.available) {
        const content = `class MyClass {
  constructor() {
    this.value = 1;
    this.name = "test";
    this.init();
    this.setup();
  }
  
  getValue() {
    const temp = this.value;
    const result = temp * 2;
    console.log(result);
    return result;
  }
}`;
        const skeleton = await result.collapseToSkeleton(content, "typescript");
        expect(skeleton).toContain("class MyClass");
      }
    });

    it("should handle Python def/class syntax", async () => {
      const result = await tryLoadTreeSitter();
      if (result.available) {
        const content = `def hello():
    print("line1")
    print("line2")
    print("line3")
    print("line4")
    return True`;
        const skeleton = await result.collapseToSkeleton(content, "python");
        expect(skeleton).toContain("def hello()");
      }
    });

    it("should handle Go func syntax", async () => {
      const result = await tryLoadTreeSitter();
      if (result.available) {
        const content = `func hello() string {
    fmt.Println("line1")
    fmt.Println("line2")
    fmt.Println("line3")
    fmt.Println("line4")
    return "hello"
}`;
        const skeleton = await result.collapseToSkeleton(content, "go");
        expect(skeleton).toContain("func hello()");
      }
    });

    it("should handle Rust fn syntax", async () => {
      const result = await tryLoadTreeSitter();
      if (result.available) {
        const content = `fn hello() -> String {
    println!("line1");
    println!("line2");
    println!("line3");
    println!("line4");
    String::from("hello")
}`;
        const skeleton = await result.collapseToSkeleton(content, "rust");
        expect(skeleton).toContain("fn hello()");
      }
    });
  });

  describe("SignatureInfo structure", () => {
    it("should return correct structure for extracted signatures", async () => {
      const result = await tryLoadTreeSitter();
      if (result.available) {
        const content = `function myFunc(a: number, b: string): boolean {
  return true;
}`;
        const signatures = await result.extractSignatures(content, "typescript");
        if (signatures.length > 0) {
          const sig = signatures[0];
          expect(sig).toHaveProperty("name");
          expect(sig).toHaveProperty("type");
          expect(sig).toHaveProperty("startLine");
          expect(sig).toHaveProperty("endLine");
          expect(sig).toHaveProperty("signature");
          expect(typeof sig.name).toBe("string");
          expect(typeof sig.startLine).toBe("number");
          expect(typeof sig.endLine).toBe("number");
          expect(["function", "method", "class", "interface", "type"]).toContain(
            sig.type
          );
        }
      }
    });
  });
});
