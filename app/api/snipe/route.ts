import { NextRequest, NextResponse } from "next/server";
import { BRSClient } from "@/lib/brs-client";

/**
 * Sniper endpoint: performs the fastest possible booking attempt.
 * Designed to be called at exactly the moment tee times become available.
 * Logs in, fetches tee sheet, and immediately books the best matching slot.
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const { clubName, username, password, date, preferredTimes, players, holes } =
      await req.json();

    if (!clubName || !username || !password || !date) {
      return NextResponse.json(
        { success: false, error: "All fields are required." },
        { status: 400 }
      );
    }

    const times: string[] = Array.isArray(preferredTimes) ? preferredTimes : [];
    const log: string[] = [];
    const ts = () => `${Date.now() - startTime}ms`;

    const client = new BRSClient(clubName);

    // Step 1: Login
    log.push(`[${ts()}] Logging in...`);
    const loginResult = await client.login(username, password);
    if (!loginResult.success) {
      return NextResponse.json({
        success: false,
        error: loginResult.error ?? "Login failed",
        log,
        elapsed: Date.now() - startTime,
      });
    }
    log.push(`[${ts()}] Login successful`);

    // Step 2: Fetch tee sheet
    log.push(`[${ts()}] Fetching tee sheet for ${date}...`);
    const { slots } = await client.getTeeSheet(date);
    const available = slots.filter((s) => s.available && s.href);
    log.push(`[${ts()}] Found ${available.length} available slots`);

    if (available.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No available tee times found. Tee sheet may not be open yet.",
        log,
        elapsed: Date.now() - startTime,
      });
    }

    // Step 3: Order by preference
    let slotsToTry: { time: string; href: string }[] = [];
    if (times.length > 0) {
      for (const wanted of times) {
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
    if (slotsToTry.length === 0) {
      slotsToTry = available.map((s) => ({ time: s.time, href: s.href }));
    }

    // Step 4: Try booking each slot — stop at first success
    const errors: string[] = [];
    for (const slot of slotsToTry) {
      log.push(`[${ts()}] Trying ${slot.time}...`);

      const tokens = await client.getBookingTokens(slot.href);
      if (!tokens) {
        const msg = `${slot.time}: could not obtain booking tokens`;
        errors.push(msg);
        log.push(`[${ts()}] ${msg}`);
        continue;
      }
      log.push(`[${ts()}] Got tokens for ${slot.time} (player: ${tokens.autoPlayerId})`);

      const result = await client.bookSlot(
        date,
        slot.time,
        tokens,
        {
          p1: players?.p1 || "",
          p2: players?.p2 || "",
          p3: players?.p3 || "",
          p4: players?.p4 || "",
        },
        holes ?? "18"
      );

      if (result.success) {
        log.push(`[${ts()}] BOOKED: ${slot.time}`);
        return NextResponse.json({
          success: true,
          booking: result,
          log,
          elapsed: Date.now() - startTime,
        });
      }

      const msg = `${slot.time}: ${result.message}`;
      errors.push(msg);
      log.push(`[${ts()}] Failed: ${result.message}`);
    }

    return NextResponse.json({
      success: false,
      error: "All booking attempts failed.",
      details: errors,
      triedSlots: slotsToTry.map((s) => s.time),
      log,
      elapsed: Date.now() - startTime,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message ?? "Server error", elapsed: Date.now() - startTime },
      { status: 500 }
    );
  }
}
