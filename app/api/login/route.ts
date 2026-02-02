import { NextRequest, NextResponse } from "next/server";
import { BRSClient } from "@/lib/brs-client";

export async function POST(req: NextRequest) {
  try {
    const { clubName, username, password } = await req.json();

    if (!clubName || !username || !password) {
      return NextResponse.json(
        { success: false, error: "Club name, username, and password are required." },
        { status: 400 }
      );
    }

    const client = new BRSClient(clubName);
    const result = await client.login(username, password);

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message ?? "Server error" },
      { status: 500 }
    );
  }
}
