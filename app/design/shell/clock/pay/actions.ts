"use server";

// A stand-in for the demo: a pay screen on the demo notes nothing.
export async function demoNotePayView(
  _month: string,
  _kind: "month" | "person" | "access",
): Promise<void> {}
