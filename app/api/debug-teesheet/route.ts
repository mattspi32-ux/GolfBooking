import { NextRequest, NextResponse } from "next/server";
import { BRSClient } from "@/lib/brs-client";

/**
 * Debug endpoint: returns the raw BRS JSON API response for the tee sheet
 * plus one sample booking page HTML so we can inspect the actual data
 * structure and fix the parser.
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
      // Get first 3 entries to show structure
      const keys = Object.keys(parsed.times ?? parsed).slice(0, 3);
      parsedSample = {};
      for (const k of keys) {
        parsedSample[k] = (parsed.times ?? parsed)[k];
      }
    } catch {
      parsedSample = "Could not parse as JSON";
    }

    // If we have slots with hrefs, try fetching the first booking page
    let bookingPageSample: string | null = null;
    const firstBookable = slots.find((s) => s.bookable);
    if (firstBookable?.href) {
      try {
        bookingPageSample = await client.debugFetchPage(firstBookable.href);
      } catch (e: any) {
        bookingPageSample = `Error fetching ${firstBookable.href}: ${e.message}`;
      }
    }

    return NextResponse.json({
      totalSlots: slots.length,
      availableCount: slots.filter((s) => s.available).length,
      bookableCount: slots.filter((s) => s.bookable).length,
      sampleApiResponse: parsedSample,
      sampleSlots: slots.slice(0, 5),
      bookingPageUrl: firstBookable?.href ?? "none",
      bookingPageSnippet: bookingPageSample?.substring(0, 3000) ?? "none",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: 500 }
    );
  }
}
