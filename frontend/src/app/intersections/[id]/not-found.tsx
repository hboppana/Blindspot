import Link from "next/link";

export default function NotFound() {
  return (
    <div className="p-6">
      <p className="font-medium">No intersection with that id.</p>
      <Link href="/map" className="road-link mt-2 inline-block text-sm font-semibold">
        Back to the city
      </Link>
    </div>
  );
}
