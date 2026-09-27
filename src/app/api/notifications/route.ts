import { NextResponse } from "next/server";
import { getNotifications } from "@/lib/notifications";

export const maxDuration = 60;

export async function GET() {
  const notifications = await getNotifications();
  return NextResponse.json(notifications);
}
