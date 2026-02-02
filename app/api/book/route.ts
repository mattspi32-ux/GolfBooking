import { NextRequest, NextResponse } from "next/server";
import { BRSClient } from "@/lib/brs-client";

export async function POST(req: NextRequest) {
  try {
    const {
      clubName,
      username,
      password,
      date,
      preferredTimes,
      players,
      holes,
    } = await req.json();

    if (!clubName || !username || !password || !date || !preferredTimes?.length) {
      return NextResponse.json(
        { success: false, error: "All fields are required." },
        { status: 400 }
      );
    }

    if (!players?.p1) {
      return NextResponse.json(
        { success: false, error: "Player 1 ID is required." },
        { status: 400 }
      );
    }

    const client = new BRSClient(clubName);

    // Step 1: Login
    const loginResult = await client.login(username, password);
    if (!loginResult.success) {
      return NextResponse.json(
        { success: false, error: loginResult.error ?? "Login failed" },
        { status: 401 }
      );
    }

    // Step 2: Get tee sheet
    const slots = await client.getTeeSheet(date);
    const availableSlots = slots.filter((s) => s.available);

    // Step 3: Find best matching slot from preferences
    let bookedSlot = null;

    for (const preferred of preferredTimes) {
      const match = availableSlots.find((s) => s.time === preferred);
      if (!match || !match.href) continue;

      // Step 4: Get booking tokens
      const tokens = await client.getBookingTokens(match.href);
      if (!tokens) continue;

      // Step 5: Book it
      const result = await client.bookSlot(
        date,
        match.time,
        tokens,
        players,
        holes ?? "18"
      );

      if (result.success) {
        bookedSlot = result;
        break;
      }
    }

    if (bookedSlot) {
      return NextResponse.json({
        success: true,
        booking: bookedSlot,
      });
    }

    return NextResponse.json({
      success: false,
      error:
        "None of your preferred times could be booked. They may already be taken.",
      availableSlots: availableSlots.map((s) => s.time),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message ?? "Server error" },
      { status: 500 }
    );
  }
}
