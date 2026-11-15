import { getServerTranslations } from "@/lib/i18n-server";

export default async function Loading() {
  const { t } = await getServerTranslations();
  return (
    <div className="space-y-6" aria-busy="true" aria-label={t.errors.loadingAria}>
      <div className="skeleton h-10 w-64 rounded-xl" />
      <div className="skeleton h-5 w-96 max-w-full rounded-lg" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton aspect-[3/4] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
