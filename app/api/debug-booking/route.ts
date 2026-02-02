import { NextRequest, NextResponse } from "next/server";
import { BRSClient } from "@/lib/brs-client";

/**
 * Debug endpoint: performs a real booking attempt but returns detailed
 * diagnostics about every step - the POST status, redirects, response
 * page title and body text - so we can see exactly what BRS does.
 */
export async function POST(req: NextRequest) {
  try {
    const { clubName, username, password, date, time, players, holes } =
      await req.json();

    if (!clubName || !username || !password || !date) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const client = new BRSClient(clubName);

    // Step 1: Login
    const loginResult = await client.login(username, password);
    if (!loginResult.success) {
      return NextResponse.json({ error: loginResult.error }, { status: 401 });
    }

    // Step 2: Get fresh tee sheet
    const { slots } = await client.getTeeSheet(date);
    const available = slots.filter((s) => s.available && s.href);

    // Find the requested time
    const targetSlot = time
      ? available.find((s) => s.time === time) ?? available[0]
      : available[0];

    if (!targetSlot) {
      return NextResponse.json({ error: "No available slots found" });
    }

    // Step 3: Get booking page analysis (dump all form fields)
    const bookingPageAnalysis = await client.getBookingPageAnalysis(targetSlot.href);

    // Step 4: Get booking page tokens (fresh session - need to re-fetch)
    const tokens = await client.getBookingTokens(targetSlot.href);
    if (!tokens) {
      return NextResponse.json({
        error: "Could not get booking tokens",
        href: targetSlot.href,
        bookingPageAnalysis,
      });
    }

    // Step 5: Do the booking POST with full diagnostics
    const diagnostics = await client.debugBookSlot(
      date,
      targetSlot.time,
      tokens,
      {
        p1: players?.p1 ?? "",
        p2: players?.p2 ?? "",
        p3: players?.p3 ?? "",
        p4: players?.p4 ?? "",
      },
      holes ?? "18"
    );

    return NextResponse.json({
      targetSlot: { time: targetSlot.time, href: targetSlot.href },
      bookingPageAnalysis,
      tokens: {
        csrfToken: tokens.csrfToken.substring(0, 20) + "...",
        slotToken: tokens.slotToken || "(empty)",
        formAction: tokens.formAction,
        vendorTxCode: tokens.vendorTxCode,
      },
      diagnostics,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
