"use client";

import { useState } from "react";

export default function DebugPage() {
  const [clubName, setClubName] = useState("newcastleunited");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  });
  const [time, setTime] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeTest, setActiveTest] = useState<string | null>(null);

  async function handleDebug(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setActiveTest("teesheet");

    try {
      const res = await fetch("/api/debug-teesheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clubName,
          username,
          password,
          date: date.replace(/-/g, "/"),
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
      setActiveTest(null);
    }
  }

  async function handleBookingDebug(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setActiveTest("booking");

    try {
      const res = await fetch("/api/debug-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clubName,
          username,
          password,
          date: date.replace(/-/g, "/"),
          time: time || undefined,
          players: { p1: playerId },
          holes: "18",
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
      setActiveTest(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">BRS API Debug</h1>

      <div className="space-y-3 mb-6">
        <input
          type="text"
          value={clubName}
          onChange={(e) => setClubName(e.target.value)}
          placeholder="Club name"
          className="border px-3 py-2 rounded w-full text-gray-900"
        />
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          className="border px-3 py-2 rounded w-full text-gray-900"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="border px-3 py-2 rounded w-full text-gray-900"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border px-3 py-2 rounded w-full text-gray-900"
        />

        <div className="flex gap-3">
          <button
            onClick={handleDebug}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded disabled:bg-gray-400"
          >
            {loading && activeTest === "teesheet"
              ? "Loading..."
              : "Debug Tee Sheet"}
          </button>
        </div>

        <hr className="my-4 border-gray-600" />

        <h2 className="text-lg font-semibold">Booking Debug</h2>
        <p className="text-sm text-gray-400">
          This will attempt an actual booking and return raw POST diagnostics
          (status code, redirects, response body).
        </p>
        <input
          type="text"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          placeholder="Time (e.g. 08:20) — leave blank for first available"
          className="border px-3 py-2 rounded w-full text-gray-900"
        />
        <input
          type="text"
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
          placeholder="Player 1 ID (numeric member ID)"
          className="border px-3 py-2 rounded w-full text-gray-900"
        />
        <button
          onClick={handleBookingDebug}
          disabled={loading || !playerId}
          className="bg-orange-600 text-white px-4 py-2 rounded disabled:bg-gray-400"
        >
          {loading && activeTest === "booking"
            ? "Booking..."
            : "Debug Booking POST"}
        </button>
      </div>

      {result && (
        <pre className="bg-gray-900 text-green-400 p-4 rounded overflow-auto max-h-[70vh] text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
