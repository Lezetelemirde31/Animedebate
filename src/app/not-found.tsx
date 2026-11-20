import Link from "next/link";
import { ErrorState } from "@/components/ui/primitives";
import { getServerTranslations } from "@/lib/i18n-server";

export default async function NotFound() {
  const { t } = await getServerTranslations();
  return (
    <div className="pt-10">
      <ErrorState
        title={t.errors.notFoundTitle}
        description={t.errors.notFoundDesc}
        action={
          <>
            <Link href="/" className="btn btn-primary">
              {t.errors.goHome}
            </Link>
            <Link href="/play" className="btn btn-ghost">
              {t.errors.play}
            </Link>
          </>
        }
      />
    </div>
  );
}
