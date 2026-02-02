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
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function handleDebug(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

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
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">BRS API Debug</h1>
      <form onSubmit={handleDebug} className="space-y-3 mb-6">
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
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:bg-gray-400"
        >
          {loading ? "Loading..." : "Fetch Debug Data"}
        </button>
      </form>

      {result && (
        <pre className="bg-gray-900 text-green-400 p-4 rounded overflow-auto max-h-[70vh] text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
