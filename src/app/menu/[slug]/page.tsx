import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DietaryBadges } from "@/components/menu/DietaryBadges";
import { ItemCustomizer } from "@/components/menu/ItemCustomizer";
import { formatPrice, getAllSlugs, getItemBySlug } from "@/lib/menu";
import { COURSE_LABELS } from "@/lib/types";

/**
 * Menu items only change at seed time (the DB ships baked into the image),
 * so every item page is statically generated at build and unknown slugs
 * 404 via dynamicParams = false.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

type Props = { params: { slug: string } };

export function generateMetadata({ params }: Props): Metadata {
  const item = getItemBySlug(params.slug);
  if (!item) return {};
  return {
    title: item.name,
    description: item.description,
  };
}

export default function MenuItemPage({ params }: Props) {
  const item = getItemBySlug(params.slug);
  if (!item) notFound();

  return (
    <main className="mx-auto max-w-site px-6 pb-16">
      <nav className="py-6 text-sm">
        <Link
          href={`/menu#${item.course}`}
          className="text-harbor-teal hover:text-harbor-coral"
        >
          &larr; Back to the menu
        </Link>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        {item.photoUrl && (
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-warm-lg">
            <Image
              src={item.photoUrl}
              alt={item.name}
              fill
              priority
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
        )}

        <div className={item.photoUrl ? "" : "lg:col-span-2 lg:max-w-2xl"}>
          <p className="text-xs font-medium uppercase tracking-widest text-harbor-ink-soft">
            {COURSE_LABELS[item.course]}
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl">{item.name}</h1>
          <p className="mt-3 text-2xl text-harbor-teal">
            {formatPrice(item.priceCents)}
            <span className="ml-3 align-middle">
              <DietaryBadges item={item} />
            </span>
          </p>
          <p className="mt-4 max-w-prose text-harbor-ink-soft">
            {item.description}
          </p>
          <ItemCustomizer item={item} />
        </div>
      </div>
    </main>
  );
}
