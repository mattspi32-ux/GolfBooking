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

    // Step 2: Get available slots to try booking
    // If the frontend passed the actual available slot data, use that directly
    // to avoid time-format mismatches from re-fetching + string matching.
    // Otherwise, fall back to re-fetching and matching by preferred times.
    let slotsToTry: { time: string; href: string }[] = [];

    if (Array.isArray(passedSlots) && passedSlots.length > 0) {
      // Use slots passed from the tee-times step (already validated as available)
      slotsToTry = passedSlots;
    } else if (Array.isArray(preferredTimes) && preferredTimes.length > 0) {
      // Fallback: re-fetch tee sheet and match by preferred time
      const { slots } = await client.getTeeSheet(date);
      const available = slots.filter((s) => s.available);

      for (const preferred of preferredTimes) {
        // Flexible matching: compare with and without leading zeros / seconds
        const normalised = preferred.replace(/^0/, "").replace(/:00$/, "");
        const match = available.find((s) => {
          const slotNorm = s.time.replace(/^0/, "").replace(/:00$/, "");
          return (
            s.time === preferred ||
            slotNorm === normalised ||
            s.time.startsWith(preferred) ||
            preferred.startsWith(s.time)
          );
        });
        if (match?.href) {
          slotsToTry.push({ time: match.time, href: match.href });
        }
      }
    }

    if (slotsToTry.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No available tee times to attempt booking.",
      });
    }

    // Step 3: Try booking each slot in order until one succeeds
    const errors: string[] = [];

    for (const slot of slotsToTry) {
      // Get the booking page tokens
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
