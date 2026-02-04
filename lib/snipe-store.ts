/**
 * Snipe job storage using Vercel Blob.
 *
 * Stores pending snipe configurations as JSON blobs so they persist
 * between requests. The cron endpoint reads these to fire bookings
 * at the scheduled time.
 */

import { put, list, del, head } from "@vercel/blob";

export interface SnipeJob {
  id: string;
  clubName: string;
  username: string;
  password: string;
  targetDate: string; // YYYY/MM/DD
  preferredTimes: string[];
  players: { p1: string; p2: string; p3: string; p4: string };
  holes: string;
  releaseHour: number; // 0-23
  releaseMinute: number; // 0-59
  status: "pending" | "fired" | "success" | "failed";
  createdAt: string;
  result?: string;
  firedAt?: string;
}

const BLOB_PREFIX = "snipes/";

function blobPath(id: string): string {
  return `${BLOB_PREFIX}${id}.json`;
}

/** Save a snipe job */
export async function saveSnipeJob(job: SnipeJob): Promise<void> {
  await put(blobPath(job.id), JSON.stringify(job), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
}

/** Get a single snipe job by ID */
export async function getSnipeJob(id: string): Promise<SnipeJob | null> {
  try {
    const blob = await head(blobPath(id));
    if (!blob) return null;
    const res = await fetch(blob.url);
    return res.json();
  } catch {
    return null;
  }
}

/** List all snipe jobs */
export async function listSnipeJobs(): Promise<SnipeJob[]> {
  const { blobs } = await list({ prefix: BLOB_PREFIX });
  const jobs: SnipeJob[] = [];
  for (const blob of blobs) {
    try {
      const res = await fetch(blob.url);
      const job: SnipeJob = await res.json();
      jobs.push(job);
    } catch {
      // skip corrupt blobs
    }
  }
  return jobs;
}

/** Delete a snipe job */
export async function deleteSnipeJob(id: string): Promise<void> {
  try {
    const blob = await head(blobPath(id));
    if (blob) {
      await del(blob.url);
    }
  } catch {
    // ignore
  }
}

/** Get all pending jobs that should fire now */
export async function getPendingSnipeJobs(): Promise<SnipeJob[]> {
  const jobs = await listSnipeJobs();
  const now = new Date();
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();

  return jobs.filter((job) => {
    if (job.status !== "pending") return false;
    // Check if it's time to fire (within a 60-minute window for Hobby plan cron imprecision)
    // The cron fires around the target hour, so we check if we're in the right window
    return (
      job.releaseHour === currentHour ||
      // Also check if we're up to 59 min late (Hobby plan variance)
      (job.releaseHour === (currentHour === 0 ? 23 : currentHour - 1) &&
        currentMinute < 59)
    );
  });
}
