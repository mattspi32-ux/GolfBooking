/**
 * BRS Golf API Client
 *
 * Handles authentication, tee sheet parsing, and booking via the BRS Golf
 * members portal. Uses server-side fetch + cheerio (no browser needed on
 * Vercel serverless).
 */

import * as cheerio from "cheerio";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Safari/537.36";

const COMMON_HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9," +
    "image/avif,image/webp,image/apng,*/*;q=0.8," +
    "application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
};

/** Participant in a tee time slot (from BRS JSON API) */
export interface TeeTimeParticipant {
  name: string | null;
  golfer_id: string | null;
}

/** Parsed tee time slot */
export interface TeeTimeSlot {
  time: string;
  href: string;
  available: boolean;
  bookable: boolean;
  players: number;
  maxPlayers: number;
  participants: TeeTimeParticipant[];
}

/** Booking result */
export interface BookingResult {
  success: boolean;
  message: string;
  time?: string;
  date?: string;
}

/**
 * Manages cookies manually since Vercel serverless doesn't have a persistent
 * cookie jar. Extracts Set-Cookie headers and sends them back.
 */
class CookieJar {
  private cookies: Map<string, string> = new Map();

  addFromResponse(response: Response) {
    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const raw of setCookies) {
      const [pair] = raw.split(";");
      const eqIndex = pair.indexOf("=");
      if (eqIndex > 0) {
        const name = pair.substring(0, eqIndex).trim();
        const value = pair.substring(eqIndex + 1).trim();
        this.cookies.set(name, value);
      }
    }
  }

  toString(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  isEmpty(): boolean {
    return this.cookies.size === 0;
  }
}

export class BRSClient {
  private clubName: string;
  private cookies: CookieJar;

  constructor(clubName: string) {
    this.clubName = clubName;
    this.cookies = new CookieJar();
  }

  private get clubUrl(): string {
    return `https://brsgolf.com/${this.clubName}`;
  }

  private get membersUrl(): string {
    return "https://members.brsgolf.com/";
  }

  private get loginUrl(): string {
    return `https://members.brsgolf.com/${this.clubName}/login`;
  }

  /** Make a GET request, tracking cookies */
  private async get(
    url: string,
    extraHeaders?: Record<string, string>
  ): Promise<Response> {
    const headers: Record<string, string> = {
      ...COMMON_HEADERS,
      ...(extraHeaders ?? {}),
    };
    if (!this.cookies.isEmpty()) {
      headers["Cookie"] = this.cookies.toString();
    }
    const res = await fetch(url, {
      headers,
      redirect: "manual",
    });
    this.cookies.addFromResponse(res);

    // Follow redirects manually to capture cookies at each hop
    const location = res.headers.get("location");
    if (location && (res.status === 301 || res.status === 302)) {
      const absoluteUrl = location.startsWith("http")
        ? location
        : new URL(location, url).href;
      return this.get(absoluteUrl);
    }

    return res;
  }

  /** Make a POST request, tracking cookies */
  private async post(
    url: string,
    body: URLSearchParams,
    extraHeaders?: Record<string, string>
  ): Promise<Response> {
    const headers: Record<string, string> = {
      ...COMMON_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(extraHeaders ?? {}),
    };
    if (!this.cookies.isEmpty()) {
      headers["Cookie"] = this.cookies.toString();
    }
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: body.toString(),
      redirect: "manual",
    });
    this.cookies.addFromResponse(res);

    // Follow redirect after POST (BRS redirects on successful login)
    const location = res.headers.get("location");
    if (location && (res.status === 301 || res.status === 302)) {
      const absoluteUrl = location.startsWith("http")
        ? location
        : new URL(location, url).href;
      return this.get(absoluteUrl);
    }

    return res;
  }

  /** Make a POST request with multipart/form-data encoding, tracking cookies */
  private async postMultipart(
    url: string,
    formData: FormData,
    extraHeaders?: Record<string, string>
  ): Promise<Response> {
    const headers: Record<string, string> = {
      ...COMMON_HEADERS,
      // Don't set Content-Type — fetch will set it with the boundary
      ...(extraHeaders ?? {}),
    };
    if (!this.cookies.isEmpty()) {
      headers["Cookie"] = this.cookies.toString();
    }
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: formData,
      redirect: "manual",
    });
    this.cookies.addFromResponse(res);

    // Follow redirect after POST
    const location = res.headers.get("location");
    if (location && (res.status === 301 || res.status === 302 || res.status === 303)) {
      const absoluteUrl = location.startsWith("http")
        ? location
        : new URL(location, url).href;
      return this.get(absoluteUrl);
    }

    return res;
  }

  /**
   * Full login flow:
   * 1. GET club URL -> collect PHPSESSID
   * 2. GET members URL -> collect additional cookies
   * 3. GET login page -> extract CSRF token
   * 4. POST login credentials
   */
  async login(
    username: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Step 1: Collect session cookies
      await this.get(this.clubUrl);

      // Step 2: Collect members domain cookies
      await this.get(this.membersUrl);

      // Step 3: Get login page and extract CSRF token
      const loginPageRes = await this.get(this.loginUrl);
      const loginHtml = await loginPageRes.text();
      const $ = cheerio.load(loginHtml);
      const csrfToken = $('input[name="login_form[_token]"]').val() as string;

      if (!csrfToken) {
        return {
          success: false,
          error: "Could not find CSRF token on login page. Site structure may have changed.",
        };
      }

      // Step 4: POST login
      const payload = new URLSearchParams({
        "login_form[username]": username,
        "login_form[password]": password,
        "login_form[login]": "",
        "login_form[_token]": csrfToken,
      });

      const loginRes = await this.post(this.loginUrl, payload, {
        Origin: "https://members.brsgolf.com",
        Referer: this.loginUrl,
      });

      const responseText = await loginRes.text();

      // If we land back on the login page, credentials were wrong
      if (
        responseText.includes("login_form[username]") ||
        responseText.includes("Invalid credentials")
      ) {
        return { success: false, error: "Invalid username or password." };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message ?? "Login failed" };
    }
  }

  /**
   * Fetch the tee sheet for a given date using BRS's JSON API endpoint.
   * This returns structured data about every tee time slot including
   * bookable status, participants, and booking URLs.
   */
  async getTeeSheet(
    date: string
  ): Promise<{ slots: TeeTimeSlot[]; rawHtml: string }> {
    // BRS exposes a JSON API for tee sheet data, used by their frontend JS
    const cacheBust = Date.now();
    const url = `https://members.brsgolf.com/${this.clubName}/tee-sheet/data/1/${date}?_=${cacheBust}`;
    const res = await this.get(url, {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
    });
    const rawText = await res.text();

    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      // If JSON parse fails, we may have been redirected to login page
      return { slots: [], rawHtml: rawText };
    }

    const slots: TeeTimeSlot[] = [];
    const times = data.times ?? data;

    // The API returns an object keyed by time slot (e.g. "08:00")
    // Each entry contains tee_time info with bookable status and participants
    for (const [timeKey, timeData] of Object.entries(times)) {
      const teeInfo = (timeData as any)?.tee_time ?? timeData;

      const bookable = teeInfo?.bookable === true;
      const participants: TeeTimeParticipant[] = Array.isArray(
        teeInfo?.participants
      )
        ? teeInfo.participants.map((p: any) => ({
            name: p.name ?? null,
            golfer_id: p.golfer_id ?? null,
          }))
        : [];

      const namedPlayers = participants.filter((p) => p.name !== null).length;
      const totalSlots = participants.length || 4;
      const freeSlots = totalSlots - namedPlayers;

      // Build the booking href from the tee_time data or construct it
      let href = teeInfo?.book_url ?? teeInfo?.href ?? teeInfo?.url ?? "";

      // If no href from API, construct the standard BRS booking URL path
      if (!href && bookable) {
        href = `/${this.clubName}/tee-sheet/book/1/${date}/${timeKey}`;
      }

      slots.push({
        time: timeKey,
        href,
        available: bookable && freeSlots > 0,
        bookable,
        players: namedPlayers,
        maxPlayers: totalSlots,
        participants,
      });
    }

    // Sort by time
    slots.sort((a, b) => a.time.localeCompare(b.time));

    return { slots, rawHtml: rawText };
  }

  /**
   * Debug helper: fetch a page and return its raw HTML.
   */
  async debugFetchPage(href: string): Promise<string> {
    const url = href.startsWith("http")
      ? href
      : `https://members.brsgolf.com${href}`;
    const res = await this.get(url);
    return res.text();
  }

  /**
   * Fetch booking page and extract the CSRF token, form action, and
   * vendor-tx-code from the server-rendered HTML.
   *
   * Actual BRS form structure (as of 2026):
   *   - CSRF token: <input name="_token" type="hidden" value="...">
   *   - Players:    <select name="member_booking_form[player_1]">
   *   - Form action: <form action="/club/bookings/store/1/YYYYMMDD/HHMM">
   *   - Vendor code: <input name="member_booking_form[vendor-tx-code]">
   */
  async getBookingTokens(
    href: string
  ): Promise<{
    csrfToken: string;
    slotToken: string;
    formAction: string;
    vendorTxCode: string;
  } | null> {
    const url = href.startsWith("http")
      ? href
      : `https://members.brsgolf.com${href}`;
    const res = await this.get(url);
    const html = await res.text();
    const $ = cheerio.load(html);

    // CSRF token: standalone hidden input OR inside form namespace
    const csrfToken =
      ($('input[name="_token"]').val() as string) ||
      ($('input[name="member_booking_form[_token]"]').val() as string);

    // Slot-specific booking token (separate from CSRF)
    const slotToken =
      ($('input[name="member_booking_form[token]"]').val() as string) ?? "";

    // The form action is on the first form (the booking form)
    const formAction = $("form").first().attr("action") ?? "";

    // Vendor tx code (usually empty)
    const vendorTxCode =
      ($('input[name="member_booking_form[vendor-tx-code]"]').val() as string) ?? "";

    if (!csrfToken) return null;
    return { csrfToken, slotToken, formAction, vendorTxCode };
  }

  /**
   * Book a tee time slot by POSTing to the BRS booking store endpoint.
   *
   * The form payload matches what the BRS booking page submits:
   *   _token, member_booking_form[player_1..4], vendor-tx-code
   */
  async bookSlot(
    date: string,
    time: string,
    tokens: { csrfToken: string; slotToken: string; formAction: string; vendorTxCode: string },
    players: { p1: string; p2?: string; p3?: string; p4?: string },
    holes: string = "18"
  ): Promise<BookingResult> {
    // Use the form action extracted from the booking page
    let url: string;
    if (tokens.formAction) {
      url = tokens.formAction.startsWith("http")
        ? tokens.formAction
        : `https://members.brsgolf.com${tokens.formAction}`;
    } else {
      const compactDate = date.replace(/\//g, "");
      const compactTime = time.replace(/:/g, "");
      url = `https://members.brsgolf.com/${this.clubName}/bookings/store/1/${compactDate}/${compactTime}`;
    }

    // Build multipart/form-data payload matching the real BRS form structure
    const formData = new FormData();
    formData.append("member_booking_form[token]", tokens.slotToken);
    formData.append("member_booking_form[holes]", holes);
    formData.append("member_booking_form[player_1]", players.p1);
    formData.append("member_booking_form[player_2]", players.p2 ?? "");
    formData.append("member_booking_form[guest-rate-2]", "");
    formData.append("member_booking_form[player_3]", players.p3 ?? "");
    formData.append("member_booking_form[guest-rate-3]", "");
    formData.append("member_booking_form[player_4]", players.p4 ?? "");
    formData.append("member_booking_form[guest-rate-4]", "");
    formData.append("member_booking_form[vendor-tx-code]", tokens.vendorTxCode);
    formData.append("member_booking_form[_token]", tokens.csrfToken);

    try {
      const res = await this.postMultipart(url, formData, {
        Origin: "https://members.brsgolf.com",
        Referer: `https://members.brsgolf.com${tokens.formAction}`,
      });
      const text = await res.text();
      const $ = cheerio.load(text);

      // Extract the page title and visible body text for detection
      const title = $("title").text().toLowerCase();
      const bodyText = $("body").text();

      // Specific BRS failure messages (not generic words like "error")
      const failurePatterns = [
        "no longer available",
        "already booked",
        "could not be completed",
        "booking failed",
        "slot is unavailable",
        "session has expired",
        "tee time is no longer",
      ];
      const hasSpecificFailure = failurePatterns.some((p) =>
        bodyText.toLowerCase().includes(p)
      );

      if (hasSpecificFailure) {
        return {
          success: false,
          message: `Booking rejected by BRS for ${time} on ${date}. The slot may have been taken.`,
          time,
          date,
        };
      }

      // If the response page is the login page, the session expired
      if (
        title.includes("login") ||
        text.includes("login_form[username]")
      ) {
        return {
          success: false,
          message: `Session expired during booking for ${time} on ${date}.`,
          time,
          date,
        };
      }

      // If we reach here, the POST went through without a specific
      // rejection — treat as success (user should verify on BRS)
      return {
        success: true,
        message: `Tee time booked: ${time} on ${date}`,
        time,
        date,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message ?? "Booking request failed",
        time,
        date,
      };
    }
  }

  /**
   * Debug version of bookSlot that returns raw diagnostics about the
   * POST request and response instead of just success/failure.
   */
  async debugBookSlot(
    date: string,
    time: string,
    tokens: { csrfToken: string; slotToken: string; formAction: string; vendorTxCode: string },
    players: { p1: string; p2?: string; p3?: string; p4?: string },
    holes: string = "18"
  ): Promise<Record<string, unknown>> {
    let url: string;
    if (tokens.formAction) {
      url = tokens.formAction.startsWith("http")
        ? tokens.formAction
        : `https://members.brsgolf.com${tokens.formAction}`;
    } else {
      const compactDate = date.replace(/\//g, "");
      const compactTime = time.replace(/:/g, "");
      url = `https://members.brsgolf.com/${this.clubName}/bookings/store/1/${compactDate}/${compactTime}`;
    }

    // Build multipart/form-data matching the real BRS form
    const formData = new FormData();
    formData.append("member_booking_form[token]", tokens.slotToken);
    formData.append("member_booking_form[holes]", holes);
    formData.append("member_booking_form[player_1]", players.p1);
    formData.append("member_booking_form[player_2]", players.p2 ?? "");
    formData.append("member_booking_form[guest-rate-2]", "");
    formData.append("member_booking_form[player_3]", players.p3 ?? "");
    formData.append("member_booking_form[guest-rate-3]", "");
    formData.append("member_booking_form[player_4]", players.p4 ?? "");
    formData.append("member_booking_form[guest-rate-4]", "");
    formData.append("member_booking_form[vendor-tx-code]", tokens.vendorTxCode);
    formData.append("member_booking_form[_token]", tokens.csrfToken);

    // Capture the payload for debug output
    const payloadEntries: Record<string, string> = {};
    formData.forEach((value, key) => {
      payloadEntries[key] = String(value);
    });

    const headers: Record<string, string> = {
      "User-Agent": COMMON_HEADERS["User-Agent"],
      Accept: COMMON_HEADERS["Accept"],
      "Accept-Language": COMMON_HEADERS["Accept-Language"],
      // Don't set Content-Type — fetch sets it with boundary for FormData
      Origin: "https://members.brsgolf.com",
      Referer: `https://members.brsgolf.com${tokens.formAction}`,
    };
    if (!this.cookies.isEmpty()) {
      headers["Cookie"] = this.cookies.toString();
    }

    // Do the POST without following redirects so we can inspect raw response
    const rawRes = await fetch(url, {
      method: "POST",
      headers,
      body: formData,
      redirect: "manual",
    });
    this.cookies.addFromResponse(rawRes);

    const rawStatus = rawRes.status;
    const rawLocation = rawRes.headers.get("location");
    const rawBody = await rawRes.text();

    const $ = cheerio.load(rawBody);

    // If there's a redirect, follow it and capture that too
    let redirectResult: Record<string, unknown> | null = null;
    if (
      rawLocation &&
      (rawStatus === 301 || rawStatus === 302 || rawStatus === 303)
    ) {
      const redirectUrl = rawLocation.startsWith("http")
        ? rawLocation
        : new URL(rawLocation, url).href;
      const redirectRes = await this.get(redirectUrl);
      const redirectBody = await redirectRes.text();
      const $r = cheerio.load(redirectBody);
      redirectResult = {
        url: redirectUrl,
        status: redirectRes.status,
        title: $r("title").text(),
        bodySnippet: $r("body")
          .text()
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 1500),
      };
    }

    return {
      postUrl: url,
      postPayload: payloadEntries,
      rawStatus,
      rawLocation,
      rawTitle: $("title").text(),
      rawBodyLength: rawBody.length,
      rawBodySnippet: $("body")
        .text()
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 1500),
      redirect: redirectResult,
    };
  }
}
