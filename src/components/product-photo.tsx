"use client";
import Image from "next/image";
import { placeholderImage, type MenuCategory } from "@/lib/menu";
export function ProductPhoto({
  imageUrl,
  category,
}: {
  imageUrl: string;
  category: MenuCategory;
}) {
  const fallback = placeholderImage(category);
  return (
    <Image
      className="product-photo"
      src={imageUrl || fallback}
      alt=""
      width={100}
      height={145}
      unoptimized
      referrerPolicy="no-referrer"
      onError={(e) => {
        if (!e.currentTarget.src.endsWith(fallback))
          e.currentTarget.src = fallback;
      }}
    />
  );
}
