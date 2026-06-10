import { NextRequest, NextResponse } from "next/server";

type ParseBodyResult = [unknown, null] | [null, NextResponse];

export async function parseBody(req: NextRequest): Promise<ParseBodyResult> {
  try {
    return [await req.json(), null];
  } catch {
    return [null, NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })];
  }
}
