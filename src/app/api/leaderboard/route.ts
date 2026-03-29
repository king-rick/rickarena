import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureLeaderboardTable } from "@/lib/db";

export async function GET() {
  try {
    await ensureLeaderboardTable();
    const sql = getDb();
    const rows = await sql`
      SELECT id, name, kills, wave, character_id, created_at
      FROM leaderboard
      ORDER BY kills DESC, wave DESC
      LIMIT 20
    `;
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Leaderboard GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureLeaderboardTable();

    const body = await request.json();
    const { name, kills, wave, character_id } = body;

    // Validate name: 3-5 alphanumeric characters
    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const trimmed = name.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,5}$/.test(trimmed)) {
      return NextResponse.json(
        { error: "Name must be 3-5 alphanumeric characters" },
        { status: 400 }
      );
    }

    if (typeof kills !== "number" || kills < 0) {
      return NextResponse.json(
        { error: "Kills must be a non-negative number" },
        { status: 400 }
      );
    }

    if (typeof wave !== "number" || wave < 1) {
      return NextResponse.json(
        { error: "Wave must be a positive number" },
        { status: 400 }
      );
    }

    if (!character_id || typeof character_id !== "string") {
      return NextResponse.json(
        { error: "character_id is required" },
        { status: 400 }
      );
    }

    const sql = getDb();
    const rows = await sql`
      INSERT INTO leaderboard (name, kills, wave, character_id)
      VALUES (${trimmed}, ${kills}, ${wave}, ${character_id})
      RETURNING id, name, kills, wave, character_id, created_at
    `;

    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    console.error("Leaderboard POST error:", error);
    return NextResponse.json(
      { error: "Failed to submit score" },
      { status: 500 }
    );
  }
}
