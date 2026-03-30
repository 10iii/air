import { load, type CheerioAPI } from "cheerio";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import type { CompressResult } from "../types.js";
import { estimateTokens, collapseBlanks } from "../utils/index.js";
import { TelemetryClient, hashContent, isTelemetryEnabled } from "../telemetry/index.js";

const LARGE_HTML_THRESHOLD = 5 * 1024 * 1024;
const NOISE_SELECTORS =
  "script,style,nav,footer,header,aside,.ad,.sidebar,.cookie-banner,noscript,iframe";

const DOM_SNAPSHOT_REMOVE_SELECTORS = [
  'script', 'style', 'noscript', 'template',
  'nav', 'header', 'footer', 'aside',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[role="complementary"]',
  '[aria-hidden="true"]', '[hidden]',
  '[style*="display: none"]', '[style*="display:none"]',
  '[style*="visibility: hidden"]', '[style*="visibility:hidden"]',
  '.ad', '.ads', '.advertisement', '[class*="ad-"]', '[class*="ads-"]',
  '[id*="ad-"]', '[id*="ads-"]', '[data-ad]', '[data-ads]',
  'iframe[src*="ad"]', 'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]',
  '.cookie-banner', '.cookie-consent', '[class*="cookie"]',
  '.popup', '.modal-backdrop', '.overlay',
  'svg', 'path', 'canvas',
].join(',');

const CODE_BLOCK_REGEX = /```[^\n]*\n[\s\S]*?```/g;

type ExtractionSource =
  | "readability"
  | "density-fallback"
  | "cheerio-large"
  | "raw-fallback";

interface DensityScore {
  textRatio: number;
  linkDensity: number;
  headingCount: number;
  composite: number;
}

interface ExtractedContent {
  html: string;
  text: string;
  metrics: DensityScore;
  source: ExtractionSource;
}

export interface WebOptions {
  url?: string;
  maxLines?: number;
  maxTokens?: number;
  format?: "markdown" | "text";
  codeOnly?: boolean;
  score?: boolean;
  /** DOM snapshot mode: optimized for browser automation snapshots */
  domSnapshot?: boolean;
  /** Skip the stats footer (--- air: ... ---) for external callers that add their own marker */
  noStats?: boolean;
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeInlineWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeText(text: string): string {
  return normalizeInlineWhitespace(normalizeNewlines(text));
}

function sanitizeUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).toString();
  } catch {
    return undefined;
  }
}

function preCleanHtml(content: string): { $: CheerioAPI; cleanedHtml: string } {
  const $ = load(content);
  $(NOISE_SELECTORS).remove();
  return { $, cleanedHtml: $.html() };
}

function cleanDomSnapshot($: CheerioAPI): void {
  $(DOM_SNAPSHOT_REMOVE_SELECTORS).remove();
  
  $('[class]').each((_, el) => {
    const classes = $(el).attr('class') || '';
    if (/\b(hidden|invisible|sr-only|visually-hidden)\b/i.test(classes)) {
      $(el).remove();
    }
  });
  
  $('[onclick], [onmouseover], [onmouseout], [onload], [onerror]').each((_, el) => {
    const $el = $(el);
    $el.removeAttr('onclick');
    $el.removeAttr('onmouseover');
    $el.removeAttr('onmouseout');
    $el.removeAttr('onload');
    $el.removeAttr('onerror');
  });
  
  $('[data-ad], [data-ads]').removeAttr('data-ad').removeAttr('data-ads');
}

function extractDomSnapshotContent($: CheerioAPI): string {
  const mainContent = $('main, [role="main"], article, .content, #content, .main, #main');
  const target = mainContent.length > 0 ? mainContent.first() : $('body');
  
  const lines: string[] = [];
  const seenLinkTexts = new Set<string>();
  
  target.find('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const text = normalizeInlineWhitespace($(el).text());
    if (text) {
      const level = parseInt(el.tagName.charAt(1), 10);
      lines.push('#'.repeat(level) + ' ' + text);
    }
  });
  
  target.find('p, li, td, th, dd, dt, blockquote').each((_, el) => {
    const $el = $(el);
    const text = normalizeInlineWhitespace($el.text());
    if (text && text.length > 2) {
      lines.push(text);
      $el.find('a').each((_, link) => {
        const linkText = normalizeInlineWhitespace($(link).text());
        if (linkText) seenLinkTexts.add(linkText.toLowerCase());
      });
    }
  });
  
  target.find('a[href]').each((_, el) => {
    const text = normalizeInlineWhitespace($(el).text());
    const href = $(el).attr('href') || '';
    if (text && href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      if (!seenLinkTexts.has(text.toLowerCase())) {
        lines.push(`[${text}](${href})`);
      }
    }
  });
  
  target.find('input, select, textarea, button').each((_, el) => {
    const $el = $(el);
    const tag = el.tagName.toLowerCase();
    const type = $el.attr('type') || '';
    const name = $el.attr('name') || $el.attr('id') || '';
    const placeholder = $el.attr('placeholder') || '';
    const label = $el.attr('aria-label') || '';
    const value = $el.attr('value') || '';
    
    let desc = `[${tag}`;
    if (type) desc += `:${type}`;
    if (name) desc += ` name="${name}"`;
    if (placeholder) desc += ` placeholder="${placeholder}"`;
    if (label) desc += ` label="${label}"`;
    if (value && type !== 'password') desc += ` value="${value}"`;
    if (tag === 'button') {
      const btnText = normalizeInlineWhitespace($el.text());
      if (btnText) desc += ` "${btnText}"`;
    }
    if (tag === 'select') {
      const options = $el.find('option').map((_, opt) => $(opt).text().trim()).get().slice(0, 5);
      if (options.length > 0) desc += ` options=[${options.join(', ')}]`;
    }
    if (tag === 'textarea') {
      const content = normalizeInlineWhitespace($el.text());
      if (content) {
        const preview = content.length > 50 ? content.slice(0, 50) + '...' : content;
        desc += ` "${preview}"`;
      }
    }
    desc += ']';
    lines.push(desc);
  });
  
  const seen = new Set<string>();
  const uniqueLines = lines.filter(line => {
    const normalized = line.toLowerCase().trim();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
  
  return uniqueLines.join('\n');
}

function calculateDensity(html: string, textOverride?: string, $override?: CheerioAPI): DensityScore {
  const $ = $override ?? load(html || "<div></div>");
  const text = normalizeText(textOverride ?? $.root().text());
  const textLength = text.length;
  const htmlLength = Math.max(1, html.length);
  const linkTextLength = normalizeText($("a").text()).length;
  const headingCount = $("h1,h2,h3,h4,h5,h6").length;

  const textRatio = textLength / htmlLength;
  const linkDensity = textLength > 0 ? linkTextLength / textLength : 1;
  const lengthBoost = Math.log10(textLength + 10);
  const headingBoost = Math.min(0.3, headingCount * 0.03);
  const composite = textRatio * (1 - Math.min(1, linkDensity)) * lengthBoost + headingBoost;

  return {
    textRatio,
    linkDensity,
    headingCount,
    composite,
  };
}

function pickBestDenseElement($: CheerioAPI): ExtractedContent | null {
  let candidates = $("article,main,section,div").toArray();
  if (candidates.length === 0) {
    candidates = $("body").toArray();
  }

  let best: ExtractedContent | null = null;

  for (const element of candidates) {
    const html = $.html(element) ?? "";
    if (html.length === 0) continue;

    const text = normalizeText($(element).text());
    if (text.length === 0) continue;

    const metrics = calculateDensity(html, text, $);
    const hasHeading = $(element).find("h1,h2,h3,h4,h5,h6").length > 0;
    if (text.length < 60 && !hasHeading) continue;

    const candidate: ExtractedContent = {
      html,
      text,
      metrics,
      source: "density-fallback",
    };

    if (!best) {
      best = candidate;
      continue;
    }

    if (candidate.metrics.composite > best.metrics.composite) {
      best = candidate;
      continue;
    }

    if (
      candidate.metrics.composite === best.metrics.composite &&
      candidate.text.length > best.text.length
    ) {
      best = candidate;
    }
  }

  return best;
}

function extractWithReadability(cleanedHtml: string, url?: string): ExtractedContent | null {
  try {
    const dom = new JSDOM(cleanedHtml, { url: sanitizeUrl(url) });
    const article = new Readability(dom.window.document).parse();
    if (!article?.content) return null;

    const text = normalizeText(article.textContent ?? "");
    if (text.length === 0) return null;

    return {
      html: article.content,
      text,
      metrics: calculateDensity(article.content, text),
      source: "readability",
    };
  } catch {
    return null;
  }
}

function htmlToMarkdown(html: string): string {
  try {
    const turndown = new TurndownService({
      codeBlockStyle: "fenced",
      headingStyle: "atx",
      bulletListMarker: "-",
    });
    return normalizeNewlines(turndown.turndown(html)).trim();
  } catch {
    return "";
  }
}

function htmlToText(html: string): string {
  try {
    const $ = load(html || "<div></div>");
    $(NOISE_SELECTORS).remove();

    $("br").replaceWith("\n");
    $("p,div,section,article,main,li,tr,pre,blockquote,h1,h2,h3,h4,h5,h6").each(
      (_, element) => {
        $(element).append("\n");
      }
    );

    const lines = normalizeNewlines($.root().text())
      .split("\n")
      .map((line) => normalizeInlineWhitespace(line));

    return collapseBlanks(lines).join("\n").trim();
  } catch {
    return "";
  }
}

function extractCodeBlocksFromMarkdown(markdown: string): string {
  const blocks = markdown.match(CODE_BLOCK_REGEX);
  return blocks ? blocks.join("\n\n").trim() : "";
}

function extractCodeBlocksFromHtml(html: string): string {
  try {
    const $ = load(html || "<div></div>");
    const blocks: string[] = [];

    $("pre").each((_, element) => {
      const code = normalizeNewlines($(element).text()).replace(/^\n+|\n+$/g, "");
      if (code.trim()) {
        blocks.push(`\`\`\`\n${code}\n\`\`\``);
      }
    });

    $("code").each((_, element) => {
      if ($(element).parents("pre").length > 0) return;
      const code = normalizeNewlines($(element).text()).trim();
      if (code) {
        blocks.push(`\`\`\`\n${code}\n\`\`\``);
      }
    });

    return blocks.join("\n\n").trim();
  } catch {
    return "";
  }
}

function smartTruncate(lines: string[], maxLines: number): string[] {
  if (maxLines <= 0 || lines.length <= maxLines) return lines;
  if (maxLines === 1) {
    return [`... (${lines.length} lines omitted) ...`];
  }

  const headCount = Math.max(1, Math.floor((maxLines - 1) * 0.65));
  const tailCount = Math.max(0, maxLines - headCount - 1);
  const tailStart = lines.length - tailCount;
  const omittedCount = tailStart - headCount;

  if (omittedCount <= 0) return lines.slice(0, maxLines);

  return [
    ...lines.slice(0, headCount),
    `... (${omittedCount} lines omitted) ...`,
    ...lines.slice(tailStart),
  ];
}

function smartTruncateByTokens(
  lines: string[],
  maxTokens: number
): { lines: string[]; budgetExceeded: boolean } {
  let totalTokens = 0;
  for (const line of lines) {
    totalTokens += estimateTokens(line + "\n");
  }
  if (totalTokens <= maxTokens) return { lines, budgetExceeded: false };

  const tokenCache = new Map<number, number>();
  const tokensFor = (lineBudget: number): number => {
    const cached = tokenCache.get(lineBudget);
    if (cached !== undefined) return cached;
    const truncated = smartTruncate(lines, lineBudget);
    const tokens = truncated.reduce((sum, line) => sum + estimateTokens(line + "\n"), 0);
    tokenCache.set(lineBudget, tokens);
    return tokens;
  };

  const step = Math.max(1, Math.floor(Math.sqrt(lines.length)));
  let bestMaxLines = 1;
  let firstFit = 0;
  let lastOver = lines.length + 1;

  for (let tryLines = lines.length; tryLines >= 1; tryLines -= step) {
    if (tokensFor(tryLines) <= maxTokens) {
      firstFit = tryLines;
      break;
    }
    lastOver = tryLines;
  }

  if (firstFit === 0) {
    if (tokensFor(1) <= maxTokens) {
      firstFit = 1;
      lastOver = Math.min(lines.length + 1, 1 + step);
    } else {
      return { lines: smartTruncate(lines, 1), budgetExceeded: true };
    }
  }

  bestMaxLines = firstFit;
  const refineTop = Math.min(lines.length, lastOver - 1);
  for (let tryLines = refineTop; tryLines > firstFit; tryLines--) {
    if (tokensFor(tryLines) <= maxTokens) {
      bestMaxLines = tryLines;
      break;
    }
  }

  return {
    lines: smartTruncate(lines, Math.max(1, bestMaxLines)),
    budgetExceeded: false,
  };
}

export class WebCompressor {
  compress(content: string, options?: WebOptions): CompressResult {
    const opts: Required<Pick<WebOptions, "format" | "codeOnly" | "score">> &
      WebOptions = {
      format: "markdown",
      codeOnly: false,
      score: false,
      ...options,
    };

    const input = typeof content === "string" ? content : String(content ?? "");
    const originalCharCount = input.length;
    const resolvedUrl = sanitizeUrl(opts.url);
    const maxLines =
      typeof opts.maxLines === "number" && Number.isFinite(opts.maxLines) && opts.maxLines > 0
        ? Math.floor(opts.maxLines)
        : undefined;
    const maxTokens =
      typeof opts.maxTokens === "number" && Number.isFinite(opts.maxTokens) && opts.maxTokens > 0
        ? Math.floor(opts.maxTokens)
        : undefined;

    let extracted: ExtractedContent;
    const isLargeContent = input.length > LARGE_HTML_THRESHOLD;

    try {
      const { $, cleanedHtml } = preCleanHtml(input);

      // DOM snapshot mode: optimized for browser automation snapshots
      if (opts.domSnapshot) {
        cleanDomSnapshot($);
        const snapshotContent = extractDomSnapshotContent($);
        extracted = {
          html: snapshotContent,
          text: snapshotContent,
          metrics: calculateDensity($.html(), snapshotContent),
          source: "cheerio-large",
        };
      } else if (isLargeContent) {
        const candidate = pickBestDenseElement($);
        if (candidate) {
          extracted = { ...candidate, source: "cheerio-large" };
        } else {
          const text = normalizeText($.root().text());
          extracted = {
            html: cleanedHtml,
            text,
            metrics: calculateDensity(cleanedHtml, text),
            source: "cheerio-large",
          };
        }
      } else {
        const readable = extractWithReadability(cleanedHtml, resolvedUrl);
        if (readable) {
          extracted = readable;
        } else {
          const candidate = pickBestDenseElement($);
          if (candidate) {
            extracted = candidate;
          } else {
            const text = normalizeText($.root().text());
            extracted = {
              html: cleanedHtml,
              text,
              metrics: calculateDensity(cleanedHtml, text),
              source: "raw-fallback",
            };
          }
        }
      }
    } catch {
      const plain = normalizeText(input.replace(/<[^>]+>/g, " "));
      extracted = {
        html: "",
        text: plain,
        metrics: calculateDensity(input, plain),
        source: "raw-fallback",
      };
    }

    let outputBody = "";
    const textVersion = opts.codeOnly ? "" : htmlToText(extracted.html);

    if (opts.codeOnly) {
      if (extracted.source === "cheerio-large") {
        outputBody = extractCodeBlocksFromHtml(extracted.html);
      } else {
        const markdown = htmlToMarkdown(extracted.html);
        outputBody = extractCodeBlocksFromMarkdown(markdown);
        if (!outputBody) {
          outputBody = extractCodeBlocksFromHtml(extracted.html);
        }
      }
    } else if (opts.format === "text" || extracted.source === "cheerio-large") {
      outputBody = textVersion || extracted.text;
    } else {
      outputBody = htmlToMarkdown(extracted.html);
      if (!outputBody) {
        outputBody = textVersion || extracted.text;
      }
    }

    if (!outputBody && !opts.codeOnly) {
      outputBody = textVersion || extracted.text;
    }

    let lines = normalizeNewlines(outputBody).split("\n");
    if (opts.format === "text" && !opts.codeOnly) {
      lines = collapseBlanks(lines.map((line) => normalizeInlineWhitespace(line)));
    } else {
      lines = lines.map((line) => line.replace(/[ \t]+$/g, ""));
    }

    while (lines.length > 1 && lines[0] === "") {
      lines.shift();
    }
    while (lines.length > 1 && lines[lines.length - 1] === "") {
      lines.pop();
    }

    const scoreLine = `--- score: textRatio=${extracted.metrics.textRatio.toFixed(3)} linkDensity=${extracted.metrics.linkDensity.toFixed(3)} headingCount=${extracted.metrics.headingCount} ---`;
    let includeStats = !opts.noStats; // Allow external callers to skip stats footer
    let includeScore = opts.score;

    if (maxLines !== undefined) {
      if (maxLines <= 1) {
        includeStats = false;
        includeScore = false;
      } else if (includeScore && maxLines <= 2) {
        includeScore = false;
      }
    }

    const statsFooterEstimatedTokens = 25;
    const scoreFooterEstimatedTokens = 22;
    if (maxTokens !== undefined) {
      if (maxTokens <= statsFooterEstimatedTokens) {
        includeStats = false;
        includeScore = false;
      } else if (
        includeScore &&
        maxTokens <= statsFooterEstimatedTokens + scoreFooterEstimatedTokens
      ) {
        includeScore = false;
      }
    }

    if (!includeStats) {
      includeScore = false;
    }

    const footerLineCount = (includeStats ? 1 : 0) + (includeScore ? 1 : 0);
    const footerTokenCount =
      (includeStats ? statsFooterEstimatedTokens : 0) +
      (includeScore ? scoreFooterEstimatedTokens : 0);

    const effectiveMaxLines =
      maxLines !== undefined ? Math.max(1, maxLines - footerLineCount) : undefined;
    const effectiveMaxTokens =
      maxTokens !== undefined ? Math.max(1, maxTokens - footerTokenCount) : undefined;

    if (effectiveMaxLines !== undefined && lines.length > effectiveMaxLines) {
      lines = smartTruncate(lines, effectiveMaxLines);
    }

    let budgetExceeded = false;
    if (effectiveMaxTokens !== undefined) {
      const tokenResult = smartTruncateByTokens(lines, effectiveMaxTokens);
      lines = tokenResult.lines;
      budgetExceeded = tokenResult.budgetExceeded;
    }

    const compressedBody = lines.join("\n").replace(/^\n+|\n+$/g, "");
    const compressedCharCount = compressedBody.length;
    const rawSavedPercent =
      originalCharCount > 0
        ? Math.round((1 - compressedCharCount / originalCharCount) * 100)
        : 0;
    const savedPercent = Math.max(0, rawSavedPercent);

    const statsLine = `--- air: ${originalCharCount} chars \u2192 ${compressedCharCount} chars (${savedPercent}% saved) ---`;
    const footerLines: string[] = [];
    if (includeScore) {
      footerLines.push(scoreLine);
    }
    if (includeStats) {
      footerLines.push(statsLine);
    }

    const output = compressedBody
      ? footerLines.length > 0
        ? `${compressedBody}\n${footerLines.join("\n")}`
        : compressedBody
      : footerLines.join("\n");

    if (isTelemetryEnabled() && resolvedUrl) {
      TelemetryClient.getInstance()
        .enqueue({
          type: "web",
          content_hash: hashContent(output),
          url: resolvedUrl,
          domain: new URL(resolvedUrl).hostname,
          fetch_ts: Date.now(),
          compressed_output: output,
          air_metadata: {
            originalSize: originalCharCount,
            compressedSize: compressedCharCount,
            ratio: originalCharCount > 0 ? compressedCharCount / originalCharCount : 1,
            format: opts.format,
          },
          client: { version: "0.1.0" },
        })
        .catch(() => {});
    }

    return {
      output,
      originalSize: originalCharCount,
      compressedSize: compressedCharCount,
      ratio: originalCharCount > 0 ? compressedCharCount / originalCharCount : 1,
      format: "air-web",
      metadata: {
        originalChars: originalCharCount,
        compressedChars: compressedCharCount,
        savedPercent,
        extractionSource: extracted.source,
        format: opts.format,
        codeOnly: opts.codeOnly,
        textRatio: extracted.metrics.textRatio,
        linkDensity: extracted.metrics.linkDensity,
        headingCount: extracted.metrics.headingCount,
        compositeScore: extracted.metrics.composite,
        scoreIncluded: includeScore,
        statsIncluded: includeStats,
        budgetExceeded,
        urlUsed: resolvedUrl,
        largeContentMode: isLargeContent,
      },
    };
  }
}
