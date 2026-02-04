"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

const POPULAR_CLUBS = [
  { value: "newcastleunited", label: "Newcastle United Golf Club" },
  { value: "", label: "Other (enter manually)" },
];

type SnipeStatus = "setup" | "armed" | "firing" | "result";

export default function SnipePage() {
  // Credentials
  const [clubName, setClubName] = useState("newcastleunited");
  const [customClub, setCustomClub] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Snipe config
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  });
  const [releaseTime, setReleaseTime] = useState("00:00");
  const [timesInput, setTimesInput] = useState("08:00, 08:10, 08:20, 08:30");
  const [player2, setPlayer2] = useState("");
  const [player3, setPlayer3] = useState("");
  const [player4, setPlayer4] = useState("");

  // Snipe state
  const [status, setStatus] = useState<SnipeStatus>("setup");
  const [countdown, setCountdown] = useState("");
  const [snipeLog, setSnipeLog] = useState<string[]>([]);
  const [result, setResult] = useState<any>(null);
  const [attempts, setAttempts] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const firingRef = useRef(false);
  const maxRetries = 5;

  const effectiveClub = clubName || customClub;

  const getReleaseDate = useCallback((): Date => {
    // Release time is tonight (or the chosen time) — the moment tee times open.
    // BRS typically releases times at midnight, 7 days before the play date.
    // The user sets the date they want to PLAY and the time it becomes available.
    const today = new Date();
    const [hours, minutes] = releaseTime.split(":").map(Number);
    const release = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      hours,
      minutes,
      0,
      0
    );
    // If the release time has already passed today, assume tomorrow
    if (release.getTime() < Date.now()) {
      release.setDate(release.getDate() + 1);
    }
    return release;
  }, [releaseTime]);

  const addLog = useCallback((msg: string) => {
    setSnipeLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const fireSnipe = useCallback(async (attempt: number): Promise<boolean> => {
    const formattedDate = targetDate.replace(/-/g, "/");
    const preferredTimes = timesInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    addLog(`Attempt ${attempt}/${maxRetries}: Sending booking request...`);

    try {
      const res = await fetch("/api/snipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clubName: effectiveClub,
          username,
          password,
          date: formattedDate,
          preferredTimes,
          players: {
            p1: "",
            p2: player2 || undefined,
            p3: player3 || undefined,
            p4: player4 || undefined,
          },
          holes: "18",
        }),
      });
      const data = await res.json();

      // Append server-side timing log
      if (data.log) {
        data.log.forEach((l: string) => addLog(`  ${l}`));
      }

      if (data.success) {
        addLog(`BOOKED! ${data.booking?.message || "Success"} (${data.elapsed}ms)`);
        setResult(data);
        setStatus("result");
        return true;
      }

      addLog(`Attempt ${attempt} failed: ${data.error} (${data.elapsed}ms)`);

      // If tee sheet not available yet, retry
      if (
        data.error?.includes("No available") ||
        data.error?.includes("not be open")
      ) {
        return false;
      }

      // Other failures — still retry in case it's a timing issue
      if (attempt >= maxRetries) {
        setResult(data);
        setStatus("result");
        return true; // stop retrying
      }
      return false;
    } catch (err: any) {
      addLog(`Attempt ${attempt} network error: ${err.message}`);
      return false;
    }
  }, [targetDate, timesInput, effectiveClub, username, password, player2, player3, player4, addLog]);

  const startFiring = useCallback(async () => {
    if (firingRef.current) return;
    firingRef.current = true;
    setStatus("firing");
    addLog("Release time reached! Starting booking attempts...");

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      setAttempts(attempt);
      const done = await fireSnipe(attempt);
      if (done) {
        firingRef.current = false;
        return;
      }
      // Wait before retry — 1s, 2s, 3s, etc.
      if (attempt < maxRetries) {
        const delay = attempt * 1000;
        addLog(`Waiting ${delay / 1000}s before retry...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    addLog("All attempts exhausted.");
    setResult({ success: false, error: "All snipe attempts failed after retries." });
    setStatus("result");
    firingRef.current = false;
  }, [addLog, fireSnipe]);

  // Countdown timer
  useEffect(() => {
    if (status !== "armed") return;

    const tick = () => {
      const release = getReleaseDate();
      const diff = release.getTime() - Date.now();

      if (diff <= 0) {
        setCountdown("00:00:00");
        if (timerRef.current) clearInterval(timerRef.current);
        startFiring();
        return;
      }

      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(
        `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
      );
    };

    tick();
    timerRef.current = setInterval(tick, 200);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status, getReleaseDate, startFiring]);

  function handleArm(e: React.FormEvent) {
    e.preventDefault();
    setSnipeLog([]);
    setResult(null);
    setAttempts(0);
    firingRef.current = false;

    const release = getReleaseDate();
    addLog(`Sniper armed. Target: ${targetDate} at times ${timesInput}`);
    addLog(`Release time: ${release.toLocaleString()}`);
    addLog("Waiting for release...");

    setStatus("armed");
  }

  function handleDisarm() {
    if (timerRef.current) clearInterval(timerRef.current);
    firingRef.current = false;
    setStatus("setup");
    setSnipeLog([]);
    setCountdown("");
  }

  function handleFireNow() {
    if (timerRef.current) clearInterval(timerRef.current);
    startFiring();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-900/80 border-b border-gray-700">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Tee Time Sniper</h1>
            <p className="text-gray-400 text-xs mt-0.5">
              Auto-book the instant tee times are released
            </p>
          </div>
          <Link
            href="/"
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Manual Booking
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Setup Form */}
        {status === "setup" && (
          <form onSubmit={handleArm} className="space-y-6">
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
              <h2 className="text-lg font-semibold mb-4">Login Details</h2>
              <div className="space-y-3">
                <select
                  value={clubName}
                  onChange={(e) => setClubName(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-red-500"
                >
                  {POPULAR_CLUBS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                {clubName === "" && (
                  <input
                    type="text"
                    value={customClub}
                    onChange={(e) => setCustomClub(e.target.value)}
                    placeholder="Club BRS identifier"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                    required
                  />
                )}
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username / Membership No."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                  required
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                  required
                />
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
              <h2 className="text-lg font-semibold mb-4">Snipe Configuration</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Date to Play
                  </label>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-red-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Booking Release Time
                  </label>
                  <input
                    type="time"
                    value={releaseTime}
                    onChange={(e) => setReleaseTime(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-red-500"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    The time when BRS releases these tee times (usually 00:00 midnight).
                    The sniper will fire at this exact moment.
                  </p>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Preferred Tee Times (in order of priority)
                  </label>
                  <input
                    type="text"
                    value={timesInput}
                    onChange={(e) => setTimesInput(e.target.value)}
                    placeholder="08:00, 08:10, 08:20"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-red-500"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Comma-separated. First choice is tried first. If unavailable, falls through to next.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
              <h2 className="text-lg font-semibold mb-4">Additional Players (Optional)</h2>
              <p className="text-xs text-gray-500 mb-3">
                Player 1 (you) is auto-detected. Add others if needed.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={player2}
                  onChange={(e) => setPlayer2(e.target.value)}
                  placeholder="Player 2 ID"
                  className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                />
                <input
                  type="text"
                  value={player3}
                  onChange={(e) => setPlayer3(e.target.value)}
                  placeholder="Player 3 ID"
                  className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                />
                <input
                  type="text"
                  value={player4}
                  onChange={(e) => setPlayer4(e.target.value)}
                  placeholder="Player 4 ID"
                  className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-red-600 text-white py-3 px-4 rounded-xl font-bold text-lg hover:bg-red-700 transition-colors"
            >
              Arm Sniper
            </button>
          </form>
        )}

        {/* Armed / Countdown */}
        {(status === "armed" || status === "firing") && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-8 text-center">
              {status === "armed" ? (
                <>
                  <p className="text-gray-400 text-sm uppercase tracking-wider mb-2">
                    Sniper Armed — Waiting for Release
                  </p>
                  <div className="text-6xl font-mono font-bold text-red-500 my-6">
                    {countdown}
                  </div>
                  <p className="text-gray-400 text-sm">
                    Target: <span className="text-white font-medium">{targetDate}</span>
                    {" | "}
                    Times: <span className="text-white font-medium">{timesInput}</span>
                  </p>
                  <p className="text-gray-500 text-xs mt-2">
                    Keep this page open. The booking fires automatically at release time.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-yellow-400 text-sm uppercase tracking-wider mb-2">
                    Firing — Attempting to Book
                  </p>
                  <div className="flex items-center justify-center gap-3 my-6">
                    <svg
                      className="animate-spin h-8 w-8 text-yellow-400"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    <span className="text-2xl font-bold">
                      Attempt {attempts}/{maxRetries}
                    </span>
                  </div>
                </>
              )}

              <div className="flex gap-3 justify-center mt-6">
                {status === "armed" && (
                  <button
                    onClick={handleFireNow}
                    className="bg-yellow-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-yellow-700 transition-colors"
                  >
                    Fire Now
                  </button>
                )}
                <button
                  onClick={handleDisarm}
                  className="bg-gray-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-gray-500 transition-colors"
                >
                  Disarm
                </button>
              </div>
            </div>

            {/* Live Log */}
            <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Live Log</h3>
              <div className="max-h-64 overflow-y-auto font-mono text-xs space-y-0.5">
                {snipeLog.map((line, i) => (
                  <div
                    key={i}
                    className={
                      line.includes("BOOKED")
                        ? "text-green-400 font-bold"
                        : line.includes("failed") || line.includes("error")
                          ? "text-red-400"
                          : "text-gray-400"
                    }
                  >
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Result */}
        {status === "result" && result && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-8 text-center">
              {result.success ? (
                <>
                  <div className="w-16 h-16 bg-green-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg
                      className="w-8 h-8 text-green-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Sniped!</h2>
                  <p className="text-gray-400">{result.booking?.message}</p>
                  {result.elapsed && (
                    <p className="text-xs text-gray-500 mt-2">
                      Completed in {result.elapsed}ms
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="w-16 h-16 bg-red-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg
                      className="w-8 h-8 text-red-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Snipe Failed</h2>
                  <p className="text-gray-400">{result.error}</p>
                  {result.details?.length > 0 && (
                    <div className="text-sm text-gray-500 mt-3 text-left max-w-md mx-auto">
                      <ul className="list-disc list-inside space-y-1">
                        {result.details.map((d: string, i: number) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Log */}
            <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Snipe Log</h3>
              <div className="max-h-64 overflow-y-auto font-mono text-xs space-y-0.5">
                {snipeLog.map((line, i) => (
                  <div
                    key={i}
                    className={
                      line.includes("BOOKED")
                        ? "text-green-400 font-bold"
                        : line.includes("failed") || line.includes("error")
                          ? "text-red-400"
                          : "text-gray-400"
                    }
                  >
                    {line}
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                setStatus("setup");
                setResult(null);
                setSnipeLog([]);
              }}
              className="w-full bg-red-600 text-white py-3 px-4 rounded-xl font-bold hover:bg-red-700 transition-colors"
            >
              Set Up Another Snipe
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
