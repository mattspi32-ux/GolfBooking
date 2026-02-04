"use client";

import { useState } from "react";
import Link from "next/link";

/** Known BRS Golf clubs for the dropdown */
const POPULAR_CLUBS = [
  { value: "newcastleunited", label: "Newcastle United Golf Club" },
  { value: "", label: "Other (enter manually)" },
];

type Step = "login" | "configure" | "tee-times" | "result";

interface TeeTimeSlot {
  time: string;
  href: string;
  available: boolean;
  bookable: boolean;
  players: number;
  maxPlayers: number;
}

interface BookingConfig {
  clubName: string;
  username: string;
  password: string;
  date: string;
  preferredTimes: string[];
  players: { p1: string; p2: string; p3: string; p4: string };
  holes: string;
}

export default function Home() {
  const [step, setStep] = useState<Step>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  // Login state
  const [clubName, setClubName] = useState("newcastleunited");
  const [customClub, setCustomClub] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Config state
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  });
  const [timesInput, setTimesInput] = useState("08:00, 08:10, 08:20, 08:30");
  const [player1, setPlayer1] = useState("");
  const [player2, setPlayer2] = useState("");
  const [player3, setPlayer3] = useState("");
  const [player4, setPlayer4] = useState("");
  const [holes, setHoles] = useState("18");

  // Tee times state
  const [slots, setSlots] = useState<TeeTimeSlot[]>([]);
  const [bookingResult, setBookingResult] = useState<any>(null);
  const [playerName, setPlayerName] = useState("");

  const effectiveClub = clubName || customClub;

  /** Step 1: Test login credentials */
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clubName: effectiveClub,
          username,
          password,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setStep("configure");
      } else {
        setError(data.error || "Login failed. Check your credentials.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  /** Step 2: Check available tee times */
  async function handleCheckTimes(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setStatusMsg("Logging in and fetching tee sheet...");

    const formattedDate = date.replace(/-/g, "/");

    try {
      const res = await fetch("/api/tee-times", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clubName: effectiveClub,
          username,
          password,
          date: formattedDate,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setSlots(data.slots);
        // Auto-populate player 1 with the logged-in user's ID
        if (data.playerInfo?.playerId) {
          setPlayer1(data.playerInfo.playerId);
          setPlayerName(data.playerInfo.playerName || "");
        }
        setStep("tee-times");
      } else {
        setError(data.error || "Failed to fetch tee times.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
      setStatusMsg("");
    }
  }

  /** Step 3: Book a tee time */
  async function handleBook() {
    setError("");
    setLoading(true);
    setStatusMsg("Booking your tee time...");

    const formattedDate = date.replace(/-/g, "/");
    const preferredTimes = timesInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    // Pass the actual available slot data from the tee-times step so the
    // book endpoint doesn't need to re-fetch + string-match time formats.
    // Filter to available slots that match preferences (in preference order),
    // or if none match preferences, send all available slots.
    const available = slots.filter((s) => s.available && s.href);
    let orderedSlots = preferredTimes
      .map((t) => available.find((s) => s.time === t || s.time.startsWith(t) || t.startsWith(s.time)))
      .filter(Boolean)
      .map((s) => ({ time: s!.time, href: s!.href }));
    if (orderedSlots.length === 0) {
      // No preference match — just send all available slots
      orderedSlots = available.map((s) => ({ time: s.time, href: s.href }));
    }

    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clubName: effectiveClub,
          username,
          password,
          date: formattedDate,
          preferredTimes,
          availableSlots: orderedSlots,
          players: {
            p1: player1,
            p2: player2 || undefined,
            p3: player3 || undefined,
            p4: player4 || undefined,
          },
          holes,
        }),
      });
      const data = await res.json();
      setBookingResult(data);
      setStep("result");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
      setStatusMsg("");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-50">
      {/* Header */}
      <header className="bg-green-800 text-white shadow-lg">
        <div className="max-w-3xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Golf Booking Bot
            </h1>
            <p className="text-green-200 text-sm mt-1">
              Auto-book BRS Golf tee times
            </p>
          </div>
          <Link
            href="/snipe"
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Tee Time Sniper
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8 gap-2">
          {(
            [
              ["login", "Login"],
              ["configure", "Configure"],
              ["tee-times", "Tee Times"],
              ["result", "Result"],
            ] as [Step, string][]
          ).map(([key, label], i) => (
            <div key={key} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold
                  ${
                    step === key
                      ? "bg-green-600 text-white"
                      : stepIndex(step) > i
                        ? "bg-green-200 text-green-800"
                        : "bg-gray-200 text-gray-500"
                  }`}
              >
                {i + 1}
              </div>
              <span
                className={`text-sm hidden sm:inline ${
                  step === key
                    ? "text-green-800 font-semibold"
                    : "text-gray-500"
                }`}
              >
                {label}
              </span>
              {i < 3 && (
                <div className="w-8 h-px bg-gray-300 hidden sm:block" />
              )}
            </div>
          ))}
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Status Message */}
        {statusMsg && (
          <div className="mb-6 bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg flex items-center gap-3">
            <svg
              className="animate-spin h-5 w-5 text-blue-600"
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
            {statusMsg}
          </div>
        )}

        {/* Step 1: Login */}
        {step === "login" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              BRS Golf Login
            </h2>
            <p className="text-gray-600 text-sm mb-6">
              Enter your BRS Golf member credentials. These are only used to
              authenticate with BRS and are not stored.
            </p>

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Club Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Golf Club
                </label>
                <select
                  value={clubName}
                  onChange={(e) => setClubName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  {POPULAR_CLUBS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {clubName === "" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Club BRS Identifier
                  </label>
                  <input
                    type="text"
                    value={customClub}
                    onChange={(e) => setCustomClub(e.target.value)}
                    placeholder="e.g. newcastleunited"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Found in your club&apos;s BRS URL:
                    brsgolf.com/<strong>clubname</strong>
                  </p>
                </div>
              )}

              {/* Username */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username / Membership No.
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your BRS username"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  required
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your BRS password"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Verifying..." : "Verify & Continue"}
              </button>
            </form>
          </div>
        )}

        {/* Step 2: Configure Booking */}
        {step === "configure" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Booking Configuration
            </h2>
            <p className="text-gray-600 text-sm mb-6">
              Set your preferred date, times, and player details.
            </p>

            <form onSubmit={handleCheckTimes} className="space-y-5">
              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  required
                />
              </div>

              {/* Preferred Times */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Preferred Tee Times
                </label>
                <input
                  type="text"
                  value={timesInput}
                  onChange={(e) => setTimesInput(e.target.value)}
                  placeholder="08:00, 08:10, 08:20"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Comma-separated, in order of preference (first = most wanted)
                </p>
              </div>

              {/* Holes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Holes
                </label>
                <div className="flex gap-4">
                  {["18", "9"].map((h) => (
                    <label key={h} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="holes"
                        value={h}
                        checked={holes === h}
                        onChange={(e) => setHoles(e.target.value)}
                        className="text-green-600 focus:ring-green-500"
                      />
                      <span className="text-gray-700">{h} Holes</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Players */}
              <div className="border-t pt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  Players
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  Player 1 is auto-detected when you check available times.
                  Additional players are optional.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Player 1 (You){player1 ? "" : " — detected on next step"}
                    </label>
                    {player1 ? (
                      <div className="w-full border border-green-300 bg-green-50 rounded-lg px-3 py-2 text-sm text-gray-900">
                        {playerName || `ID: ${player1}`}
                        <span className="text-xs text-gray-500 ml-2">(#{player1})</span>
                      </div>
                    ) : (
                      <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-400 italic">
                        Auto-detected after checking times
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Player 2
                    </label>
                    <input
                      type="text"
                      value={player2}
                      onChange={(e) => setPlayer2(e.target.value)}
                      placeholder="Optional"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Player 3
                    </label>
                    <input
                      type="text"
                      value={player3}
                      onChange={(e) => setPlayer3(e.target.value)}
                      placeholder="Optional"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Player 4
                    </label>
                    <input
                      type="text"
                      value={player4}
                      onChange={(e) => setPlayer4(e.target.value)}
                      placeholder="Optional"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep("login")}
                  className="px-4 py-2.5 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-green-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? "Checking..." : "Check Available Times"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Step 3: Tee Times */}
        {step === "tee-times" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Available Tee Times
            </h2>
            <p className="text-gray-600 text-sm mb-4">
              {date} &mdash; {slots.filter((s) => s.available).length} available
              slot(s) found
            </p>

            {slots.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No tee times found for this date. The tee sheet may not be open
                yet.
              </p>
            ) : (
              <div className="max-h-96 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
                {slots.map((slot, i) => {
                  const freeSlots = slot.maxPlayers - slot.players;
                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-between px-4 py-3 ${
                        slot.available
                          ? "bg-green-50"
                          : "bg-gray-50 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-semibold text-gray-900">
                          {slot.time}
                        </span>
                        {slot.available ? (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                            Available ({freeSlots}/{slot.maxPlayers} free)
                          </span>
                        ) : slot.bookable ? (
                          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                            Partially booked ({slot.players}/{slot.maxPlayers})
                          </span>
                        ) : (
                          <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                            {slot.players > 0
                              ? `Full (${slot.players}/${slot.maxPlayers})`
                              : "Not bookable"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setStep("configure")}
                className="px-4 py-2.5 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleBook}
                disabled={
                  loading || slots.filter((s) => s.available).length === 0
                }
                className="flex-1 bg-green-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {loading
                  ? "Booking..."
                  : "Book Best Available Time"}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Result */}
        {step === "result" && bookingResult && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            {bookingResult.success ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8 text-green-600"
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
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Booking Confirmed!
                </h2>
                <p className="text-gray-600 mb-1">
                  {bookingResult.booking?.message}
                </p>
                <p className="text-sm text-gray-500">
                  Check your BRS Golf account to verify the booking.
                </p>
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8 text-red-600"
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
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Booking Failed
                </h2>
                <p className="text-gray-600 mb-2">{bookingResult.error}</p>
                {bookingResult.details?.length > 0 && (
                  <div className="text-sm text-gray-500 mt-2 text-left max-w-md mx-auto">
                    <p className="font-medium mb-1">Details:</p>
                    <ul className="list-disc list-inside space-y-1">
                      {bookingResult.details.map((d: string, i: number) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {bookingResult.triedSlots?.length > 0 && (
                  <p className="text-sm text-gray-500 mt-2">
                    Tried times: {bookingResult.triedSlots.join(", ")}
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  setStep("configure");
                  setBookingResult(null);
                  setError("");
                }}
                className="flex-1 bg-green-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors"
              >
                Book Another Time
              </button>
            </div>
          </div>
        )}

        {/* Info Footer */}
        <div className="mt-8 text-center text-xs text-gray-400">
          <p>
            Your credentials are sent directly to BRS Golf servers and are not
            stored.
          </p>
          <p className="mt-1">
            BRS Golf Tee Booking System &middot; For personal use only
          </p>
        </div>
      </main>
    </div>
  );
}

function stepIndex(step: Step): number {
  return ["login", "configure", "tee-times", "result"].indexOf(step);
}
