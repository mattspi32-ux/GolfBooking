import { NextRequest, NextResponse } from "next/server";
import { BRSClient } from "@/lib/brs-client";
import * as cheerio from "cheerio";

/**
 * Debug endpoint: thoroughly analyzes the BRS tee sheet API response
 * and the booking page HTML to diagnose token extraction issues.
 */
export async function POST(req: NextRequest) {
  try {
    const { clubName, username, password, date } = await req.json();

    if (!clubName || !username || !password || !date) {
      return NextResponse.json(
        { error: "All fields are required." },
        { status: 400 }
      );
    }

    const client = new BRSClient(clubName);
    const loginResult = await client.login(username, password);

    if (!loginResult.success) {
      return NextResponse.json(
        { error: loginResult.error ?? "Login failed" },
        { status: 401 }
      );
    }

    // Get raw tee sheet JSON
    const { slots, rawHtml: rawJson } = await client.getTeeSheet(date);

    // Try to parse first few entries to show structure
    let parsedSample: any = null;
    try {
      const parsed = JSON.parse(rawJson);
      const keys = Object.keys(parsed.times ?? parsed).slice(0, 3);
      parsedSample = {};
      for (const k of keys) {
        parsedSample[k] = (parsed.times ?? parsed)[k];
      }
    } catch {
      parsedSample = "Could not parse as JSON";
    }

    // Deep analysis of booking page HTML
    const firstBookable = slots.find((s) => s.bookable && s.href);
    let bookingPageAnalysis: any = { status: "no bookable slots found" };

    if (firstBookable?.href) {
      try {
        const html = await client.debugFetchPage(firstBookable.href);
        const $ = cheerio.load(html);

        // Collect ALL input elements
        const allInputs: any[] = [];
        $("input").each((_, el) => {
          const $el = $(el);
          allInputs.push({
            name: $el.attr("name") ?? "(no name)",
            type: $el.attr("type") ?? "(no type)",
            value: ($el.attr("value") ?? "").substring(0, 100),
            id: $el.attr("id") ?? "",
          });
        });

        // Collect ALL form elements
        const allForms: any[] = [];
        $("form").each((_, el) => {
          const $el = $(el);
          allForms.push({
            action: $el.attr("action") ?? "(no action)",
            method: $el.attr("method") ?? "(no method)",
            id: $el.attr("id") ?? "",
            class: $el.attr("class") ?? "",
          });
        });

        // Collect ALL select elements
        const allSelects: any[] = [];
        $("select").each((_, el) => {
          const $el = $(el);
          allSelects.push({
            name: $el.attr("name") ?? "(no name)",
            id: $el.attr("id") ?? "",
          });
        });

        // Search for token-related strings in raw HTML
        const tokenMatches: string[] = [];
        const tokenPatterns = [
          /member_booking_form\[[\w_]+\]/g,
          /name="[^"]*token[^"]*"/gi,
          /name="[^"]*booking[^"]*"/gi,
          /_token['"]/gi,
          /csrf/gi,
        ];
        for (const pattern of tokenPatterns) {
          const matches = html.match(pattern);
          if (matches) {
            tokenMatches.push(...matches.slice(0, 5));
          }
        }

        // Check for JavaScript-rendered content indicators
        const hasVueApp = html.includes("vue") || html.includes("Vue");
        const hasReactApp =
          html.includes("__NEXT_DATA__") || html.includes("react");
        const hasDataAttributes = (html.match(/data-[\w-]+=/g) || []).slice(
          0,
          10
        );
        const scriptTags = $("script")
          .map((_, el) => {
            const src = $(el).attr("src") ?? "";
            const inline = $(el).html()?.substring(0, 200) ?? "";
            return { src, inlineSnippet: inline };
          })
          .get()
          .slice(0, 10);

        // Look for booking-related data in script tags
        const bookingScriptData: string[] = [];
        $("script").each((_, el) => {
          const content = $(el).html() ?? "";
          if (
            content.includes("booking") ||
            content.includes("token") ||
            content.includes("player")
          ) {
            bookingScriptData.push(content.substring(0, 500));
          }
        });

        bookingPageAnalysis = {
          url: firstBookable.href,
          htmlLength: html.length,
          title: $("title").text(),
          formsFound: allForms.length,
          forms: allForms,
          inputsFound: allInputs.length,
          inputs: allInputs,
          selectsFound: allSelects.length,
          selects: allSelects,
          tokenRegexMatches: Array.from(new Set(tokenMatches)),
          hasVueApp,
          hasReactApp,
          dataAttributes: hasDataAttributes,
          scriptTags,
          bookingScriptData,
          // Show the body content (stripped of scripts/styles) for structure
          bodyText: $("body").text().replace(/\s+/g, " ").trim().substring(0, 2000),
          // Show raw HTML around form/input areas
          rawHtmlMiddle: html.substring(
            Math.max(0, Math.floor(html.length / 3)),
            Math.min(html.length, Math.floor(html.length / 3) + 5000)
          ),
        };
      } catch (e: any) {
        bookingPageAnalysis = {
          error: `Error fetching ${firstBookable.href}: ${e.message}`,
        };
      }
    }

    return NextResponse.json({
      totalSlots: slots.length,
      availableCount: slots.filter((s) => s.available).length,
      bookableCount: slots.filter((s) => s.bookable).length,
      sampleApiResponse: parsedSample,
      sampleSlots: slots.slice(0, 3),
      bookingPageAnalysis,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: 500 }
    );
  }
}
