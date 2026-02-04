import { NextRequest, NextResponse } from "next/server";
import { BRSClient } from "@/lib/brs-client";
import { listSnipeJobs, saveSnipeJob, type SnipeJob } from "@/lib/snipe-store";

/**
 * Cron endpoint: checks for pending snipe jobs and fires them.
 * Called by Vercel Cron on a schedule (configured in vercel.json).
 *
 * Secured with CRON_SECRET env var — Vercel sends it in the Authorization header.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret if configured
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const allJobs = await listSnipeJobs();
    const pendingJobs = allJobs.filter((j) => j.status === "pending");

    if (pendingJobs.length === 0) {
      return NextResponse.json({
        message: "No pending snipe jobs",
        totalJobs: allJobs.length,
      });
    }

    const results: { id: string; status: string; message: string }[] = [];

    for (const job of pendingJobs) {
      const result = await fireSnipeJob(job);
      results.push(result);
    }

    return NextResponse.json({
      message: `Processed ${results.length} snipe job(s)`,
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function fireSnipeJob(
  job: SnipeJob
): Promise<{ id: string; status: string; message: string }> {
  const startTime = Date.now();

  try {
    const client = new BRSClient(job.clubName);

    // Login
    const loginResult = await client.login(job.username, job.password);
    if (!loginResult.success) {
      job.status = "failed";
      job.result = `Login failed: ${loginResult.error}`;
      job.firedAt = new Date().toISOString();
      await saveSnipeJob(job);
      return { id: job.id, status: "failed", message: job.result };
    }

    // Get tee sheet
    const { slots } = await client.getTeeSheet(job.targetDate);
    const available = slots.filter((s) => s.available && s.href);

    if (available.length === 0) {
      job.status = "failed";
      job.result = "No available tee times found";
      job.firedAt = new Date().toISOString();
      await saveSnipeJob(job);
      return { id: job.id, status: "failed", message: job.result };
    }

    // Order by preference
    let slotsToTry: { time: string; href: string }[] = [];
    if (job.preferredTimes.length > 0) {
      for (const wanted of job.preferredTimes) {
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

    // Try booking
    for (const slot of slotsToTry) {
      const tokens = await client.getBookingTokens(slot.href);
      if (!tokens) continue;

      const result = await client.bookSlot(
        job.targetDate,
        slot.time,
        tokens,
        job.players,
        job.holes
      );

      if (result.success) {
        job.status = "success";
        job.result = `Booked ${slot.time} (${Date.now() - startTime}ms)`;
        job.firedAt = new Date().toISOString();
        await saveSnipeJob(job);
        return { id: job.id, status: "success", message: job.result };
      }
    }

    job.status = "failed";
    job.result = `All ${slotsToTry.length} slots failed (${Date.now() - startTime}ms)`;
    job.firedAt = new Date().toISOString();
    await saveSnipeJob(job);
    return { id: job.id, status: "failed", message: job.result };
  } catch (err: any) {
    job.status = "failed";
    job.result = err.message;
    job.firedAt = new Date().toISOString();
    await saveSnipeJob(job);
    return { id: job.id, status: "failed", message: err.message };
  }
}
