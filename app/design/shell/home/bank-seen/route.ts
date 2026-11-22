// The demo's stand-in for /home/bank-seen, where nobody is signed in: the
// bank change's card goes on screen, nothing is kept and the demo's data
// stays as it is.
export async function POST(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
