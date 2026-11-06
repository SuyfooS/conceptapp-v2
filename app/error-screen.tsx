"use client";

import { Button } from "@ui/button";
import { EmptyState } from "@ui/empty-state";
import { CloudOff } from "lucide-react";
import { CenteredScreen } from "./centered-screen";

/**
 * What a failure looks like: what happened and a way to try again. The strings
 * come from the caller, because global-error has no provider to read them from.
 * "Home" is a plain link: after a failure the router may be what is broken.
 */
export function ErrorScreen({
  title,
  body,
  retry,
  home,
  onRetry,
}: {
  title: string;
  body: string;
  retry: string;
  home: string;
  onRetry: () => void;
}) {
  return (
    <CenteredScreen>
      <EmptyState icon={<CloudOff />} title={title} body={body}>
        <Button size="lg" onClick={onRetry}>
          {retry}
        </Button>
        <Button asChild variant="ghost" size="lg">
          <a href="/home">{home}</a>
        </Button>
      </EmptyState>
    </CenteredScreen>
  );
}
