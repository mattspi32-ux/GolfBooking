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
      availableSlots: passedSlots,
      players,
      holes,
    } = await req.json();

    if (!clubName || !username || !password || !date) {
      return NextResponse.json(
        { success: false, error: "All fields are required." },
        { status: 400 }
      );
    }

    // Player 1 ID is optional — if not provided, it will be auto-detected
    // from the booking form (the logged-in user's ID)

    const client = new BRSClient(clubName);

    // Step 1: Login
    const loginResult = await client.login(username, password);
    if (!loginResult.success) {
      return NextResponse.json(
        { success: false, error: loginResult.error ?? "Login failed" },
        { status: 401 }
      );
    }

    // Step 2: Always fetch a fresh tee sheet in THIS session.
    // Booking URLs contain session-bound tokens that are only valid for the
    // session that requested the tee sheet. The URLs passed from the frontend
    // were fetched in a different session (the tee-times step) and won't work.
    const { slots } = await client.getTeeSheet(date);
    const available = slots.filter((s) => s.available && s.href);

    if (available.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No available tee times found for this date.",
      });
    }

    // Step 3: Order slots by preference.
    // Use the times the user selected (from passedSlots or preferredTimes)
    // to determine priority, but use the fresh hrefs from this session.
    const wantedTimes: string[] = [];
    if (Array.isArray(passedSlots) && passedSlots.length > 0) {
      wantedTimes.push(...passedSlots.map((s: any) => s.time));
    } else if (Array.isArray(preferredTimes)) {
      wantedTimes.push(...preferredTimes);
    }

    let slotsToTry: { time: string; href: string }[] = [];

    if (wantedTimes.length > 0) {
      // Match wanted times against fresh available slots
      for (const wanted of wantedTimes) {
        const match = available.find(
          (s) =>
            s.time === wanted ||
            s.time.startsWith(wanted) ||
            wanted.startsWith(s.time)
        );
        if (match) {
          slotsToTry.push({ time: match.time, href: match.href });
        }
      }
    }

    // If no preference matches, try all available slots
    if (slotsToTry.length === 0) {
      slotsToTry = available.map((s) => ({ time: s.time, href: s.href }));
    }

    // Step 4: Try booking each slot in order until one succeeds
    const errors: string[] = [];

    for (const slot of slotsToTry) {
      // Get the booking page tokens (same session = valid tokens)
      const tokens = await client.getBookingTokens(slot.href);
      if (!tokens) {
        errors.push(`${slot.time}: could not obtain booking tokens`);
        continue;
      }

      // Attempt the booking
      const result = await client.bookSlot(
        date,
        slot.time,
        tokens,
        players,
        holes ?? "18"
      );

      if (result.success) {
        return NextResponse.json({
          success: true,
          booking: result,
        });
      }

      errors.push(`${slot.time}: ${result.message}`);
    }

    return NextResponse.json({
      success: false,
      error: "All booking attempts failed.",
      details: errors,
      triedSlots: slotsToTry.map((s) => s.time),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message ?? "Server error" },
      { status: 500 }
    );
  }
}
