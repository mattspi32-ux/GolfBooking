import { NextRequest, NextResponse } from "next/server";
import {
  saveSnipeJob,
  listSnipeJobs,
  deleteSnipeJob,
  type SnipeJob,
} from "@/lib/snipe-store";

/** GET: List all snipe jobs */
export async function GET() {
  try {
    const jobs = await listSnipeJobs();
    // Sort by creation date, newest first
    jobs.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    // Don't return passwords to the frontend
    const safe = jobs.map((j) => ({ ...j, password: "***" }));
    return NextResponse.json({ jobs: safe });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** POST: Create a new snipe job */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      clubName,
      username,
      password,
      targetDate,
      preferredTimes,
      players,
      holes,
      releaseHour,
      releaseMinute,
    } = body;

    if (!clubName || !username || !password || !targetDate) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const job: SnipeJob = {
      id: `snipe-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      clubName,
      username,
      password,
      targetDate,
      preferredTimes: Array.isArray(preferredTimes) ? preferredTimes : [],
      players: players ?? { p1: "", p2: "", p3: "", p4: "" },
      holes: holes ?? "18",
      releaseHour: releaseHour ?? 0,
      releaseMinute: releaseMinute ?? 0,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    await saveSnipeJob(job);

    return NextResponse.json({
      success: true,
      job: { ...job, password: "***" },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** DELETE: Remove a snipe job */
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "Missing job ID" }, { status: 400 });
    }
    await deleteSnipeJob(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
