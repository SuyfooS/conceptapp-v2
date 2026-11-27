import { Suspense } from "react";
import { JoinView } from "../../../(auth)/join/[token]/join-view";
import { business, staff } from "../../shell/data";
import { demoJoin } from "../actions";
import { captchaTwinOf } from "../captcha-twin";
import { refusalTwinOf } from "../refusal-twin";

type Props = { searchParams: Promise<{ captcha?: string; error?: string }> };

// The real join screen for a mock invite, with a stand-in action.
// `?captcha=` the "אני לא רובוט" check in a state of its stand-in, or
// Cloudflare's own test widget (`captchaTwinOf`). `?error=` the invite
// step refused (`refusalTwinOf`): `network`, too many codes from this
// network (closing the pilot, PR 2), or `captcha`.
export default function JoinDemo({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { captcha, error } = await searchParams;
  const refused = refusalTwinOf(error);
  return (
    <JoinView
      invite={{
        phone: "+972531234567",
        role: "worker",
        name: staff[6]?.name ?? null,
        business: { name: business.name, accent: "#8b2635" },
      }}
      join={demoJoin}
      captcha={captchaTwinOf(captcha)}
      start={refused ? { step: "invite", ...refused } : undefined}
    />
  );
}
