"use server";

// Stand-in for signing out on the design demo, where nobody is signed in.
export async function demoSignOut(): Promise<void> {}

// Stand-in for marking every notification read: the demo's lines stay as they are.
export async function demoReadAllNotifications(): Promise<void> {}
