import { beforeAll, describe, expect, it, vi } from "vitest";
import { Readability } from "@mozilla/readability";
import { WebCompressor } from "../compressors/web.js";

const compressor = new WebCompressor();

function getMeta(result: ReturnType<WebCompressor["compress"]>) {
  return result.metadata as Record<string, unknown>;
}

const articleHtml = `
<html>
  <body>
    <header><h1>Site Header</h1></header>
    <nav>Top navigation links</nav>
    <main>
      <article>
        <h1>Main Article Title</h1>
        <p>This is the first paragraph of the main article content with enough words to be meaningful for extraction.</p>
        <p>This is the second paragraph, providing additional context and details for the extractor.</p>
      </article>
    </main>
    <footer>Footer links and copyright</footer>
  </body>
</html>
`;

const longReadableHtml = `
<html>
  <body>
    <main>
      <article>
        <h1>Readable Story</h1>
        <p>${"This article body sentence is intentionally long for readability extraction. ".repeat(40)}</p>
        <p>${"Additional context reinforces that this is the main article section. ".repeat(25)}</p>
      </article>
      <aside>Ad panel</aside>
    </main>
  </body>
</html>
`;

let largeHtml = "";

beforeAll(() => {
  const chunk = `<section><p>${"large body content ".repeat(2500)}</p></section>`;
  const threshold = 5 * 1024 * 1024 + 200_000;
  let body = "";
  while (body.length < threshold) {
    body += chunk;
  }
  largeHtml = `<html><body>${body}</body></html>`;
});

describe("WebCompressor basic extraction", () => {
  it("extracts article text from simple HTML", () => {
    const result = compressor.compress(articleHtml);
    expect(result.output).toContain("Main Article Title");
    expect(result.output).toContain("first paragraph");
    expect(result.format).toBe("air-web");
  });

  it("removes navigation and footer sections", () => {
    const result = compressor.compress(articleHtml);
    expect(result.output).not.toContain("Top navigation links");
    expect(result.output).not.toContain("Footer links and copyright");
  });

  it("removes sidebar and ad selectors", () => {
    const html = `
    <html><body>
      <div class="sidebar">Sidebar content</div>
      <div class="ad">Buy now</div>
      <article><p>Real content text that should remain visible after extraction.</p></article>
    </body></html>`;
    const result = compressor.compress(html);
    expect(result.output).toContain("Real content text");
    expect(result.output).not.toContain("Sidebar content");
    expect(result.output).not.toContain("Buy now");
  });

  it("removes scripts, styles, noscript and iframes", () => {
    const html = `
    <html><body>
      <script>window.__bad = true</script>
      <style>.x { color: red; }</style>
      <noscript>noscript message</noscript>
      <iframe src="https://example.com/embed">iframe text</iframe>
      <article><p>Visible content only.</p></article>
    </body></html>`;
    const result = compressor.compress(html);
    expect(result.output).toContain("Visible content only");
    expect(result.output).not.toContain("window.__bad");
    expect(result.output).not.toContain("noscript message");
    expect(result.output).not.toContain("iframe text");
  });

  it("handles malformed HTML gracefully", () => {
    const html = "<html><body><article><h1>Broken<p>Still readable";
    const result = compressor.compress(html);
    expect(result.output.length).toBeGreaterThan(0);
    expect(result.output).toContain("Still readable");
  });

  it("handles empty HTML input", () => {
    const result = compressor.compress("");
    expect(result.output).toContain("--- air:");
    expect(result.originalSize).toBe(0);
  });

  it("handles HTML containing only script/style blocks", () => {
    const html = "<html><body><script>1</script><style>.a{}</style></body></html>";
    const result = compressor.compress(html);
    expect(result.output).toContain("--- air:");
    expect(result.output).not.toContain("<script>");
  });

  it("preserves unicode text content", () => {
    const html = "<html><body><article><h1>你好世界</h1><p>こんにちは and 🚀 emoji.</p></article></body></html>";
    const result = compressor.compress(html);
    expect(result.output).toContain("你好世界");
    expect(result.output).toContain("こんにちは");
    expect(result.output).toContain("🚀");
  });
});

describe("WebCompressor readability and fallbacks", () => {
  it("uses readability path on rich article pages", () => {
    const result = compressor.compress(longReadableHtml, { url: "https://example.com/post" });
    const meta = getMeta(result);
    expect(meta.extractionSource).toBe("readability");
    expect(result.output).toContain("Readable Story");
  });

  it("keeps URL in metadata when provided", () => {
    const url = "https://example.com/docs/page";
    const result = compressor.compress(longReadableHtml, { url });
    const meta = getMeta(result);
    expect(meta.urlUsed).toBe(url);
  });

  it("returns undefined for invalid URL", () => {
    const result = compressor.compress(longReadableHtml, { url: "not-a-valid-url" });
    const meta = getMeta(result);
    expect(meta.urlUsed).toBeUndefined();
  });

  it("falls back to density algorithm when readability returns null", () => {
    const spy = vi.spyOn(Readability.prototype, "parse").mockReturnValue(null);
    const html = `
      <html><body>
        <div>
          <p>${"Dense section text ".repeat(60)}</p>
        </div>
      </body></html>`;
    const result = compressor.compress(html);
    const meta = getMeta(result);
    expect(meta.extractionSource).toBe("density-fallback");
    expect(result.output).toContain("Dense section text");
    spy.mockRestore();
  });

  it("falls back when readability throws", () => {
    const spy = vi.spyOn(Readability.prototype, "parse").mockImplementation(() => {
      throw new Error("boom");
    });
    const html = `<html><body><div><p>${"Fallback should work ".repeat(40)}</p></div></body></html>`;
    const result = compressor.compress(html);
    const meta = getMeta(result);
    expect(["density-fallback", "raw-fallback"]).toContain(meta.extractionSource);
    expect(result.output).toContain("Fallback should work");
    spy.mockRestore();
  });

  it("prefers text-dense section over link-heavy section in fallback", () => {
    const spy = vi.spyOn(Readability.prototype, "parse").mockReturnValue(null);
    const html = `
    <html><body>
      <div>
        <a href="#">link one</a>
        <a href="#">link two</a>
        <a href="#">link three</a>
        <a href="#">link four</a>
      </div>
      <section>
        <h2>Deep Content</h2>
        <p>${"This section has meaningful prose and very little linking. ".repeat(35)}</p>
      </section>
    </body></html>`;
    const result = compressor.compress(html);
    expect(result.output).toContain("Deep Content");
    expect(result.output).toContain("meaningful prose");
    spy.mockRestore();
  });

  it("uses raw fallback when candidates are too short", () => {
    const spy = vi.spyOn(Readability.prototype, "parse").mockReturnValue(null);
    const html = "<html><body><div>tiny</div></body></html>";
    const result = compressor.compress(html);
    const meta = getMeta(result);
    expect(meta.extractionSource).toBe("raw-fallback");
    spy.mockRestore();
  });

  it("never throws for plain text input", () => {
    const result = compressor.compress("just plain text without html tags");
    expect(result.output.length).toBeGreaterThan(0);
    expect(result.output).toContain("just plain text");
  });
});

describe("WebCompressor formatting", () => {
  it("converts headings into markdown", () => {
    const html = "<html><body><article><h1>Heading One</h1><p>Body text.</p></article></body></html>";
    const result = compressor.compress(html, { format: "markdown" });
    expect(result.output).toContain("# Heading One");
  });

  it("converts links into markdown links", () => {
    const html = "<html><body><article><p>Visit <a href='https://openai.com'>OpenAI</a>.</p></article></body></html>";
    const result = compressor.compress(html, { format: "markdown" });
    expect(result.output).toContain("[OpenAI](https://openai.com");
  });

  it("converts lists into markdown list items", () => {
    const html = "<html><body><article><ul><li>alpha</li><li>beta</li></ul></article></body></html>";
    const result = compressor.compress(html, { format: "markdown" });
    expect(result.output).toMatch(/[-*]\s*alpha/);
    expect(result.output).toMatch(/[-*]\s*beta/);
  });

  it("converts code blocks to fenced markdown blocks", () => {
    const html = "<html><body><article><pre><code>const x = 1;\nconsole.log(x);</code></pre></article></body></html>";
    const result = compressor.compress(html, { format: "markdown" });
    expect(result.output).toContain("```");
    expect(result.output).toContain("const x = 1;");
  });

  it("keeps table text content", () => {
    const html = `
    <html><body><article>
      <table>
        <tr><th>Name</th><th>Score</th></tr>
        <tr><td>Alice</td><td>95</td></tr>
      </table>
    </article></body></html>`;
    const result = compressor.compress(html);
    expect(result.output).toContain("Name");
    expect(result.output).toContain("Alice");
    expect(result.output).toContain("95");
  });

  it("supports plain text output format", () => {
    const html = "<html><body><article><h1>Title</h1><p>Paragraph text.</p></article></body></html>";
    const result = compressor.compress(html, { format: "text" });
    expect(result.output).toContain("Title");
    expect(result.output).toContain("Paragraph text");
    expect(result.output).not.toContain("# Title");
  });

  it("uses markdown as default format", () => {
    const html = "<html><body><article><h2>Default Heading</h2></article></body></html>";
    const result = compressor.compress(html);
    expect(result.output).toContain("## Default Heading");
  });

  it("collapses repeated blank lines in text output", () => {
    const html = "<html><body><article><p>A</p><p></p><p></p><p>B</p></article></body></html>";
    const result = compressor.compress(html, { format: "text" });
    expect(result.output).not.toContain("\n\n\n");
  });

  it("suppresses stats footer when noStats is true", () => {
    const html = "<html><body><article><h1>Title</h1><p>Content text.</p></article></body></html>";
    const withStats = compressor.compress(html);
    const withoutStats = compressor.compress(html, { noStats: true });
    
    expect(withStats.output).toContain("--- air:");
    expect(withoutStats.output).not.toContain("--- air:");
    expect(withoutStats.output).toContain("Title");
    expect(withoutStats.output).toContain("Content text");
  });
});

describe("WebCompressor codeOnly mode", () => {
  it("extracts only fenced code blocks", () => {
    const html = `
    <html><body><article>
      <h1>Guide</h1>
      <p>Some explanation text.</p>
      <pre><code>npm install</code></pre>
    </article></body></html>`;
    const result = compressor.compress(html, { codeOnly: true });
    expect(result.output).toContain("```");
    expect(result.output).toContain("npm install");
    expect(result.output).not.toContain("Some explanation text");
  });

  it("handles multiple code blocks", () => {
    const html = `
    <html><body><article>
      <pre><code>const a = 1;</code></pre>
      <pre><code>const b = 2;</code></pre>
    </article></body></html>`;
    const result = compressor.compress(html, { codeOnly: true });
    const count = (result.output.match(/```/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(4);
    expect(result.output).toContain("const a = 1;");
    expect(result.output).toContain("const b = 2;");
  });

  it("captures inline code when no pre block exists", () => {
    const html = "<html><body><article><p>Run <code>pnpm test</code> now.</p></article></body></html>";
    const result = compressor.compress(html, { codeOnly: true });
    expect(result.output).toContain("pnpm test");
    expect(result.output).toContain("```");
  });

  it("returns minimal output when no code exists", () => {
    const html = "<html><body><article><p>Only text content here.</p></article></body></html>";
    const result = compressor.compress(html, { codeOnly: true });
    expect(result.output).toContain("--- air:");
    expect(result.output).not.toContain("Only text content here");
  });

  it("works with markdown format in codeOnly mode", () => {
    const html = "<html><body><article><pre><code>echo hello</code></pre></article></body></html>";
    const result = compressor.compress(html, { codeOnly: true, format: "markdown" });
    expect(result.output).toContain("echo hello");
  });

  it("works with text format in codeOnly mode", () => {
    const html = "<html><body><article><pre><code>print('x')</code></pre></article></body></html>";
    const result = compressor.compress(html, { codeOnly: true, format: "text" });
    expect(result.output).toContain("print('x')");
  });
});

describe("WebCompressor scoring and stats", () => {
  it("adds score line when score=true", () => {
    const result = compressor.compress(articleHtml, { score: true });
    expect(result.output).toMatch(/--- score: textRatio=\d+\.\d{3} linkDensity=\d+\.\d{3} headingCount=\d+ ---/);
  });

  it("does not add score line when score=false", () => {
    const result = compressor.compress(articleHtml, { score: false });
    expect(result.output).not.toContain("--- score:");
  });

  it("includes density metrics in metadata", () => {
    const result = compressor.compress(articleHtml, { score: true });
    const meta = getMeta(result);
    expect(typeof meta.textRatio).toBe("number");
    expect(typeof meta.linkDensity).toBe("number");
    expect(typeof meta.headingCount).toBe("number");
  });

  it("tracks heading count in metadata", () => {
    const result = compressor.compress(articleHtml, { score: true });
    const meta = getMeta(result);
    expect((meta.headingCount as number) > 0).toBe(true);
  });

  it("reports higher link density for link-heavy content", () => {
    const linkHeavy = "<html><body><article>" + "<a href='#'>link</a> ".repeat(40) + "</article></body></html>";
    const textHeavy = "<html><body><article><p>" + "plain text ".repeat(120) + "</p></article></body></html>";

    const linkMeta = getMeta(compressor.compress(linkHeavy, { score: true }));
    const textMeta = getMeta(compressor.compress(textHeavy, { score: true }));

    expect((linkMeta.linkDensity as number) >= (textMeta.linkDensity as number)).toBe(true);
  });

  it("appends char-based stats footer", () => {
    const result = compressor.compress(articleHtml);
    expect(result.output).toMatch(/--- air: \d+ chars → \d+ chars \(\d+% saved\) ---/);
  });

  it("never reports negative saved percent", () => {
    const result = compressor.compress("<html><body><article><p>x</p></article></body></html>");
    const meta = getMeta(result);
    expect((meta.savedPercent as number) >= 0).toBe(true);
  });
});

describe("WebCompressor truncation", () => {
  const longHtml = `
  <html><body><article>
    <h1>Long Content</h1>
    ${Array.from({ length: 120 }, (_, i) => `<p>Paragraph ${i + 1} with enough content to matter for output size control.</p>`).join("")}
  </article></body></html>
  `;

  it("applies maxLines truncation", () => {
    const result = compressor.compress(longHtml, { maxLines: 12, format: "text" });
    const lines = result.output.split("\n");
    expect(lines.length).toBeLessThanOrEqual(12);
    expect(result.output).toContain("lines omitted");
  });

  it("omits stats when maxLines is too small", () => {
    const result = compressor.compress(longHtml, { maxLines: 1, format: "text" });
    expect(result.output).not.toContain("--- air:");
    const meta = getMeta(result);
    expect(meta.statsIncluded).toBe(false);
  });

  it("drops score line when maxLines budget is tight", () => {
    const result = compressor.compress(longHtml, { maxLines: 2, score: true, format: "text" });
    expect(result.output).toContain("--- air:");
    expect(result.output).not.toContain("--- score:");
  });

  it("keeps score line when maxLines budget allows", () => {
    const result = compressor.compress(longHtml, { maxLines: 3, score: true, format: "text" });
    expect(result.output).toContain("--- air:");
    expect(result.output).toContain("--- score:");
  });

  it("applies maxTokens truncation", () => {
    const result = compressor.compress(longHtml, { maxTokens: 120, format: "text" });
    expect(result.output.length).toBeGreaterThan(0);
    expect(result.output).toContain("--- air:");
  });

  it("flags budgetExceeded when token budget is extremely small", () => {
    const result = compressor.compress(longHtml, { maxTokens: 1, format: "text" });
    const meta = getMeta(result);
    expect(meta.budgetExceeded).toBe(true);
    expect(result.output.length).toBeGreaterThan(0);
  });

  it("disables stats when token budget is too small", () => {
    const result = compressor.compress(longHtml, { maxTokens: 10, format: "text" });
    const meta = getMeta(result);
    expect(meta.statsIncluded).toBe(false);
    expect(result.output).not.toContain("--- air:");
  });

  it("drops score line when token budget cannot fit both footers", () => {
    const result = compressor.compress(longHtml, { maxTokens: 30, score: true, format: "text" });
    expect(result.output).toContain("--- air:");
    expect(result.output).not.toContain("--- score:");
  });
});

describe("WebCompressor large HTML handling", () => {
  it("uses cheerio-only extraction for >5MB HTML", () => {
    const result = compressor.compress(largeHtml);
    const meta = getMeta(result);
    expect(meta.extractionSource).toBe("cheerio-large");
    expect(meta.largeContentMode).toBe(true);
  });

  it("skips readability parse on large HTML", () => {
    const spy = vi.spyOn(Readability.prototype, "parse");
    compressor.compress(largeHtml, { format: "text" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("returns useful output for large HTML without throwing", () => {
    const result = compressor.compress(largeHtml, { format: "text", maxLines: 8 });
    expect(result.output.length).toBeGreaterThan(0);
    expect(result.output).toContain("--- air:");
  });

  it("extracts code in large HTML codeOnly mode", () => {
    const html = `<html><body>${"<div>text</div>".repeat(500)}<pre><code>SELECT * FROM users;</code></pre></body></html>`;
    const result = compressor.compress(html, { codeOnly: true });
    expect(result.output).toContain("SELECT * FROM users;");
    expect(result.output).toContain("```");
  }, 30000);
});

describe("WebCompressor domSnapshot mode", () => {
  const snapshotHtml = `
  <html>
    <body>
      <script>window.analytics.track();</script>
      <style>.hidden { display: none }</style>
      <nav aria-label="main">Navigation Menu</nav>
      <header role="banner">Site Header</header>
      <div aria-hidden="true">Hidden accessibility content</div>
      <main role="main">
        <h1>Page Title</h1>
        <p>Main content paragraph with useful information.</p>
        <a href="/contact">Contact Us</a>
        <form>
          <input type="text" name="email" placeholder="Enter email" />
          <button type="submit">Submit</button>
        </form>
      </main>
      <footer role="contentinfo">Copyright 2024</footer>
      <div class="ad-banner">Advertisement</div>
      <iframe src="https://ads.doubleclick.net/frame"></iframe>
    </body>
  </html>`;

  it("removes script and style tags", () => {
    const result = compressor.compress(snapshotHtml, { domSnapshot: true });
    expect(result.output).not.toContain("window.analytics");
    expect(result.output).not.toContain(".hidden {");
  });

  it("removes navigation and header elements", () => {
    const result = compressor.compress(snapshotHtml, { domSnapshot: true });
    expect(result.output).not.toContain("Navigation Menu");
    expect(result.output).not.toContain("Site Header");
  });

  it("removes footer and ad elements", () => {
    const result = compressor.compress(snapshotHtml, { domSnapshot: true });
    expect(result.output).not.toContain("Copyright 2024");
    expect(result.output).not.toContain("Advertisement");
  });

  it("removes aria-hidden content", () => {
    const result = compressor.compress(snapshotHtml, { domSnapshot: true });
    expect(result.output).not.toContain("Hidden accessibility content");
  });

  it("removes ad iframes", () => {
    const result = compressor.compress(snapshotHtml, { domSnapshot: true });
    expect(result.output).not.toContain("doubleclick");
  });

  it("extracts main content headings", () => {
    const result = compressor.compress(snapshotHtml, { domSnapshot: true });
    expect(result.output).toContain("Page Title");
  });

  it("extracts paragraph content", () => {
    const result = compressor.compress(snapshotHtml, { domSnapshot: true });
    expect(result.output).toContain("Main content paragraph");
  });

  it("extracts links with markdown format", () => {
    const result = compressor.compress(snapshotHtml, { domSnapshot: true });
    expect(result.output).toContain("[Contact Us](/contact)");
  });

  it("extracts form elements", () => {
    const result = compressor.compress(snapshotHtml, { domSnapshot: true });
    expect(result.output).toContain("[input:text");
    expect(result.output).toContain("[button:submit");
  });

  it("uses cheerio-large extraction source", () => {
    const result = compressor.compress(snapshotHtml, { domSnapshot: true });
    const meta = getMeta(result);
    expect(meta.extractionSource).toBe("cheerio-large");
  });

  it("respects maxLines option", () => {
    const result = compressor.compress(snapshotHtml, { domSnapshot: true, maxLines: 3 });
    const lines = result.output.split("\n").filter((l) => l.trim() !== "");
    expect(lines.length).toBeLessThanOrEqual(3);
  });

  it("respects maxTokens option", () => {
    const result = compressor.compress(snapshotHtml, { domSnapshot: true, maxTokens: 50 });
    expect(result.output.length).toBeGreaterThan(0);
    expect(result.output).toContain("--- air:");
  });

  it("removes elements with hidden class patterns", () => {
    const html = `
    <html><body>
      <div class="sr-only">Screen reader only</div>
      <div class="visually-hidden">Visually hidden</div>
      <main><p>Visible content</p></main>
    </body></html>`;
    const result = compressor.compress(html, { domSnapshot: true });
    expect(result.output).not.toContain("Screen reader only");
    expect(result.output).not.toContain("Visually hidden");
    expect(result.output).toContain("Visible content");
  });

  it("handles empty HTML gracefully", () => {
    const result = compressor.compress("", { domSnapshot: true });
    expect(result.output).toContain("--- air:");
  });

  it("handles body-only HTML", () => {
    const html = "<body><p>Simple content</p></body>";
    const result = compressor.compress(html, { domSnapshot: true });
    expect(result.output).toContain("Simple content");
  });

  it("extracts select element options", () => {
    const html = `
    <html><body><main>
      <select name="country">
        <option>USA</option>
        <option>Canada</option>
        <option>UK</option>
      </select>
    </main></body></html>`;
    const result = compressor.compress(html, { domSnapshot: true });
    expect(result.output).toContain("[select");
    expect(result.output).toContain("options=[USA, Canada, UK]");
  });

  it("avoids duplicate link text when link is inside paragraph", () => {
    const html = `
    <html><body><main>
      <h1>Title</h1>
      <p>Click here to <a href="/page">visit page</a> for more info.</p>
    </main></body></html>`;
    const result = compressor.compress(html, { domSnapshot: true });
    const linkMatches = result.output.match(/\[visit page\]/g);
    expect(linkMatches).toBeNull();
  });

  it("extracts textarea content", () => {
    const html = `
    <html><body><main>
      <textarea name="message">Hello world this is a test message</textarea>
    </main></body></html>`;
    const result = compressor.compress(html, { domSnapshot: true });
    expect(result.output).toContain("[textarea");
    expect(result.output).toContain("Hello world");
  });
});
