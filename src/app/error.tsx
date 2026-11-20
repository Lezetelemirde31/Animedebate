"use client";

import Link from "next/link";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { ErrorState } from "@/components/ui/primitives";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="pt-10">
      <ErrorState
        title={t.errors.wrongTitle}
        description={error.digest ? t.errors.wrongDescRef(error.digest) : t.errors.wrongDesc}
        action={
          <>
            <button className="btn btn-primary" onClick={reset}>
              {t.errors.tryAgain}
            </button>
            <Link href="/" className="btn btn-ghost">
              {t.errors.goHome}
            </Link>
          </>
        }
      />
    </div>
  );
}
