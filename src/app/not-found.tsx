import Link from "next/link";
import { ErrorState } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <div className="pt-10">
      <ErrorState
        title="Page not found"
        description="This lot was never listed. The page you were looking for doesn't exist."
        action={
          <>
            <Link href="/" className="btn btn-primary">
              Go home
            </Link>
            <Link href="/play" className="btn btn-ghost">
              Play
            </Link>
          </>
        }
      />
    </div>
  );
}
