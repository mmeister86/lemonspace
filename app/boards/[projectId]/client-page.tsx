"use client";

import { PublicLayoutRenderer } from "@/components/public/export-renderer";
import type { LayoutBlockType } from "@/lib/types";
import Image from "next/image";

// Typen für Props der neuen Client-Komponente
interface ClientPageProps {
  projectContent: {
    title: string;
    layoutBlocks: LayoutBlockType[];
  };
  publishedBoard: {
    author_name: string;
    updated_at: string;
    is_published: boolean;
    project_id: string;
    user_id: string;
    title?: string;
  };
}

export function ClientPage({
  projectContent,
  publishedBoard,
}: ClientPageProps) {
  // Filtere leere Blöcke
  const renderableBlocks = projectContent.layoutBlocks.filter(
    (block: LayoutBlockType) =>
      block.zones.some((zone) => zone.blocks.length > 0)
  );

  if (renderableBlocks.length === 0) {
    return <div>Dieses Board hat keinen Inhalt.</div>;
  }

  return (
    <main className="w-full mt-10 min-h-screen flex flex-col items-center gap-8 py-8 px-0 sm:container sm:px-4 sm:mx-auto">
      {/* Logo */}
      <Image
        src="/images/lemonspace_logo_bl.svg"
        alt="Lemonspace Logo"
        width={300}
        height={58} // Automatisch berechnet basierend auf dem Seitenverhältnis des SVGs (86.1799/449.3611 * 300)
        priority
      />

      {/* Hauptinhalt */}
      <div className="w-full bg-white shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] sm:rounded-lg sm:max-w-[85rem]">
        <div className="board-content space-y-6 p-4 sm:p-8">
          {renderableBlocks.map((block: LayoutBlockType) => (
            <PublicLayoutRenderer key={block.id} layoutBlock={block} />
          ))}
        </div>
      </div>

      {/* Footer-Info */}
      <div className="text-center text-gray-400 text-sm">
        <p className="font-medium text-lg mb-1">{projectContent.title}</p>
        <p className="text-gray-500">
          {publishedBoard.author_name} |{" zuletzt geändert am "}
          {new Date(publishedBoard.updated_at).toLocaleDateString()}
        </p>
      </div>
    </main>
  );
}
