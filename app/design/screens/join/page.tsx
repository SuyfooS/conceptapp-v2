import { Suspense } from "react";
import { JoinView } from "../../../(auth)/join/[token]/join-view";
import { business, staff } from "../../shell/data";
import { demoJoin } from "../actions";
import { captchaTwinOf } from "../captcha-twin";

type Props = { searchParams: Promise<{ captcha?: string }> };

// The real join screen for a mock invite, with a stand-in action.
// `?captcha=` the "אני לא רובוט" check in a state of its stand-in, or
// Cloudflare's own test widget (`captchaTwinOf`).
export default function JoinDemo({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { captcha } = await searchParams;
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
    />
  );
}
