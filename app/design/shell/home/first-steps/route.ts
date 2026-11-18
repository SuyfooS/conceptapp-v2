// The demo's stand-in for /home/first-steps, where nobody is signed in: the
// card goes on screen, nothing is kept and the demo's data stays as it is.
export async function POST(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
