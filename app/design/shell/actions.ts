"use server";

// Stand-in for signing out on the design demo, where nobody is signed in:
// nowhere to go.
export async function demoSignOut(): Promise<null> {
  return null;
}

// Stand-in for marking every notification read: the demo's lines stay as they are.
export async function demoReadAllNotifications(): Promise<void> {}

// Stand-in for switching business on the design demo, where nobody is signed
// in: the demo stays where it is.
export async function demoChooseBusiness(_form: FormData): Promise<void> {}
