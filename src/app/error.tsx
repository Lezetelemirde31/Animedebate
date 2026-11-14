"use client";

import Link from "next/link";
import { ErrorState } from "@/components/ui/primitives";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="pt-10">
      <ErrorState
        title="Something went wrong"
        description={error.digest ? `An unexpected error occurred (ref ${error.digest}). Please try again.` : "An unexpected error occurred. Please try again."}
        action={
          <>
            <button className="btn btn-primary" onClick={reset}>
              Try again
            </button>
            <Link href="/" className="btn btn-ghost">
              Go home
            </Link>
          </>
        }
      />
    </div>
  );
}
