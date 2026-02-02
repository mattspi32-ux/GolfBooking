import { NextRequest, NextResponse } from "next/server";
import { BRSClient } from "@/lib/brs-client";

export async function POST(req: NextRequest) {
  try {
    const { clubName, username, password, date, debug } = await req.json();

    if (!clubName || !username || !password || !date) {
      return NextResponse.json(
        { success: false, error: "All fields are required." },
        { status: 400 }
      );
    }

    const client = new BRSClient(clubName);
    const loginResult = await client.login(username, password);

    if (!loginResult.success) {
      return NextResponse.json(
        { success: false, error: loginResult.error ?? "Login failed" },
        { status: 401 }
      );
    }

    const { slots, rawHtml } = await client.getTeeSheet(date);

    const response: Record<string, unknown> = {
      success: true,
      slots,
      date,
    };

    // Include raw HTML snippet for debugging if requested
    if (debug) {
      response.rawHtmlLength = rawHtml.length;
      response.rawHtmlSnippet = rawHtml.substring(0, 5000);
    }

    return NextResponse.json(response);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message ?? "Server error" },
      { status: 500 }
    );
  }
}
