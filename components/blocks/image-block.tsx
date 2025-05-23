/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Loader2, AlertCircle, Upload, Link as LinkIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import UpLoader from "@/components/uploading";
import { useBlocksStore } from "@/store/blocks-store";
import { useSupabase } from "@/components/providers/supabase-provider";
import { useDrop } from "react-dnd";
import { ItemTypes } from "@/lib/dnd/itemTypes";
import type { MediaItemInput } from "@/components/media/draggable-media-item";

// Props für die neue, interaktive Komponente
interface ImageBlockProps {
  blockId: string;
  layoutId: string;
  zoneId: string;
  content: string | null; // Bild-URL oder null
  isSelected?: boolean;
  onSelect?: () => void;
  altText?: string;
}

export function ImageBlock({
  blockId,
  layoutId,
  zoneId,
  content,
  isSelected,
  onSelect,
  altText,
}: ImageBlockProps) {
  // --- State für Interaktion und Status ---
  const dragRef = useRef<HTMLDivElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [placeholderError, setPlaceholderError] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    content ? "loading" : "error"
  );
  const [internalSrc, setInternalSrc] = useState<string | null>(
    content ?? null
  );

  // Store und Supabase
  const { updateBlockContent } = useBlocksStore();
  const { supabase: supabaseClient, user } = useSupabase();

  // --- DnD: MediaItem-Drop auf leeren Bildblock ---
  const [{ isOver, canDrop }, drop] = useDrop<
    MediaItemInput,
    void,
    { isOver: boolean; canDrop: boolean }
  >({
    accept: ItemTypes.MEDIA_ITEM,
    canDrop: (item) => {
      // Nur erlauben, wenn Block leer ist und es ein Bild ist
      return (
        !internalSrc &&
        !!item.file_type &&
        item.file_type.startsWith("image/") &&
        !!item.url
      );
    },
    drop: (item) => {
      // MediaItem-Drop: Bild-URL im Block speichern
      if (item.url && item.file_type.startsWith("image/")) {
        updateBlockContent(blockId, layoutId, zoneId, item.url);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  // Kombiniere dragRef und dropRef
  const setCombinedRef = (node: HTMLDivElement | null) => {
    drop(node);
    // dragRef.current = node; // Nicht mehr nötig, da Drag für Placeholder nicht verwendet wird
  };

  // --- Effekt: Aktualisiere internen State, wenn content-Prop sich ändert ---
  useEffect(() => {
    setInternalSrc(content ?? null);
    setStatus(content ? "loading" : "error");
  }, [content]);

  // --- Drag & Drop Handler ---
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    // Debug: Logge alle DataTransfer-Items und Files beim Drop
    console.log(
      "[ImageBlock] Drop-Event: DataTransfer.items:",
      e.dataTransfer.items
    );
    console.log(
      "[ImageBlock] Drop-Event: DataTransfer.files:",
      e.dataTransfer.files
    );
    for (let i = 0; i < e.dataTransfer.items.length; i++) {
      const item = e.dataTransfer.items[i];
      console.log(
        `[ImageBlock] Item #${i}: kind=`,
        item.kind,
        ", type=",
        item.type
      );
    }
    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      const file = e.dataTransfer.files[i];
      console.log(
        `[ImageBlock] File #${i}: name=`,
        file.name,
        ", type=",
        file.type,
        ", size=",
        file.size,
        file
      );
    }
    // 1. Datei-Upload wie bisher
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
      return;
    }
    // 2. Link/Text-Drop (z.B. Bild-URL, data:image oder Google-Redirect-Link)
    let url = e.dataTransfer.getData("text/plain");
    // --- MCP: Google-Redirect-Link erkennen und echte Bild-URL extrahieren ---
    // Beispiel: https://www.google.de/imgres?...&imgurl=https%3A%2F%2Fexample.com%2Fbild.jpg&...
    if (url && url.includes("/imgres") && url.includes("imgurl=")) {
      try {
        const parsed = new URL(url);
        const imgurlParam = parsed.searchParams.get("imgurl");
        if (imgurlParam) {
          url = decodeURIComponent(imgurlParam);
        }
      } catch {
        // Falls Parsing fehlschlägt, bleibt url wie sie ist
      }
    }
    if (url && isSupportedImageUrl(url)) {
      setPlaceholderError(null);
      handleUrlSubmit(undefined, url);
      return;
    }
    // 3. Fehler, falls kein unterstützter Link
    setPlaceholderError(
      "Nur Bilddateien, http(s)-Bild-Links oder data:image-Links werden akzeptiert."
    );
  };

  // --- Datei-Upload Handler ---
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // Debug: Logge alle Files beim Upload
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(
        `[ImageBlock] Upload File #${i}: name=`,
        file.name,
        ", type=",
        file.type,
        ", size=",
        file.size,
        file
      );
    }
    if (!user || !supabaseClient) {
      setPlaceholderError("Login erforderlich für Upload.");
      toast.error("Du musst eingeloggt sein, um Bilder hochzuladen.");
      return;
    }
    const file = files[0];
    if (!file.type.startsWith("image/")) {
      setPlaceholderError("Bitte nur Bilddateien hochladen.");
      toast.error("Nur Bilddateien werden unterstützt.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      // Prüft, ob das Bild größer als 50MB ist
      setPlaceholderError("Bild zu groß (max. 50MB).");
      toast.error("Das Bild überschreitet das Limit von 50MB.");
      return;
    }
    setIsUploading(true);
    setPlaceholderError(null);
    setUploadProgress(0);
    const loadingToastId = toast.loading(`Lade ${file.name} hoch...`);
    try {
      const formData = new FormData();
      formData.append("image", file); // Key muss zum API-Endpoint passen
      formData.append("userId", user.id);
      // Debug: Logge alle FormData-Einträge vor dem Upload
      Array.from(formData.entries()).forEach(([key, value]) => {
        console.log(
          `[ImageBlock] FormData: key=`,
          key,
          ", value=",
          value,
          value instanceof File ? value.type : typeof value
        );
      });
      // Upload an /api/optimize-image
      const response = await fetch("/api/optimize-image", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const result = await response.json();
      if (!response.ok) {
        const errorMessage =
          result?.error || `Upload fehlgeschlagen (Status: ${response.status})`;
        throw new Error(errorMessage);
      }
      const imageUrl = result.storageUrl ?? result.publicUrl;
      if (!imageUrl) {
        throw new Error("Upload erfolgreich, aber keine Bild-URL erhalten.");
      }
      // Update im Store
      updateBlockContent(blockId, layoutId, zoneId, imageUrl);
      toast.dismiss(loadingToastId);
      toast.success("Bild erfolgreich hochgeladen!");
    } catch {
      const message = "Fehler beim Hochladen des Bildes.";
      setPlaceholderError(message);
      toast.dismiss(loadingToastId);
      toast.error(message);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // --- URL-Eingabe Handler ---
  const handleUrlSubmit = (
    e?: React.FormEvent<HTMLFormElement>,
    overrideUrl?: string
  ) => {
    e?.preventDefault();
    setPlaceholderError(null);
    const url = (overrideUrl ?? imageUrlInput).trim();
    if (!url) {
      setPlaceholderError("Bitte gib eine gültige Bild-URL ein.");
      return;
    }
    // Erweiterte Bild-URL-Validierung: http(s) ODER data:image/...
    if (!isSupportedImageUrl(url)) {
      setPlaceholderError(
        "Nur Bild-URLs mit gängigen Formaten oder data:image-Links werden unterstützt."
      );
      return;
    }
    updateBlockContent(blockId, layoutId, zoneId, url);
    setImageUrlInput("");
  };

  // --- Hilfsfunktion: Prüft, ob eine URL eine unterstützte Bild-URL ist (http(s) oder data:image) ---
  function isSupportedImageUrl(url: string): boolean {
    // Akzeptiere alle http(s)-Links (auch ohne Bild-Endung), da viele Bilddienste (z.B. Google Images) keine klassische Endung haben
    if (/^https?:\/\//i.test(url)) return true;
    // Data-URL mit Bild-MIME-Typ
    if (
      /^data:image\/(jpeg|png|webp|gif|bmp|svg\+xml|heic);base64,[a-z0-9+/=]+$/i.test(
        url
      )
    )
      return true;
    return false;
  }

  // --- Hilfsfunktion: Prüft, ob eine URL eine externe Bild-URL ist (http(s), aber keine Data-URL, kein lokaler Pfad und kein Supabase-Storage) ---
  function getProxiedImageUrl(src: string | null): string | null {
    if (!src) return null;
    // Data-URLs und lokale Bilder (z.B. /images/logo.png) direkt verwenden
    if (src.startsWith("data:") || src.startsWith("/") || src.startsWith("./"))
      return src;
    // Supabase-Storage-URLs direkt verwenden (nicht durch den Proxy leiten)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl && src.startsWith(supabaseUrl)) {
      // MCP: Bilder aus der eigenen Supabase-Instanz werden wie lokale behandelt
      return src;
    }
    // Externe http(s)-Bilder über den Proxy leiten
    if (src.startsWith("http://") || src.startsWith("https://")) {
      // encodeURIComponent, damit Sonderzeichen in der URL korrekt übertragen werden
      return `/api/proxy-image?url=${encodeURIComponent(src)}`;
    }
    // Fallback: direkt verwenden
    return src;
  }

  // --- Platzhalter-UI, wenn kein Bild vorhanden ---
  if (!internalSrc) {
    return (
      <div
        ref={setCombinedRef}
        className={cn(
          "group relative rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md min-h-[200px] flex flex-col justify-center",
          isSelected && "ring-2 ring-blue-500",
          canDrop && "border-primary",
          isOver && canDrop && "bg-primary/10"
        )}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onSelect?.();
          }
        }}
      >
        {/* Drag & Drop/Upload-Zone */}
        <div
          className={cn(
            "flex-grow border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors duration-200 flex flex-col items-center justify-center relative",
            isDraggingOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground/50",
            isUploading && "opacity-50 pointer-events-none"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() =>
            document.getElementById(`image-upload-${blockId}`)?.click()
          }
        >
          {isUploading && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center rounded-lg z-10">
              <div className="text-center">
                <UpLoader />
                <p className="text-sm text-muted-foreground mt-2">
                  {uploadProgress > 0
                    ? `${uploadProgress}% hochgeladen`
                    : "Verarbeite..."}
                </p>
              </div>
            </div>
          )}
          <Upload className="h-10 w-10 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Bild hierher ziehen oder{" "}
            <span className="text-primary font-medium">auswählen</span>
          </p>
          <input
            id={`image-upload-${blockId}`}
            type="file"
            className="hidden"
            accept="image/*"
            onChange={(e) => handleFileUpload(e.target.files)}
            disabled={isUploading}
          />
          <p className="text-xs text-muted-foreground mt-1">Max. 50MB</p>
        </div>
        {/* OR Separator */}
        <div className="my-4 flex items-center justify-center">
          <div className="flex-grow border-t border-border"></div>
          <span className="px-2 text-xs text-muted-foreground uppercase">
            Oder
          </span>
          <div className="flex-grow border-t border-border"></div>
        </div>
        {/* URL Input */}
        <form
          onSubmit={(e) => handleUrlSubmit(e)}
          className="flex gap-2 items-center"
        >
          <LinkIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <Input
            type="url"
            placeholder="Bild-URL einfügen (z.B. https://... .jpg)"
            value={imageUrlInput}
            onChange={(e) => setImageUrlInput(e.target.value)}
            className="flex-grow"
            disabled={isUploading}
          />
          <Button
            type="submit"
            size="sm"
            disabled={isUploading || !imageUrlInput.trim()}
          >
            Hinzufügen
          </Button>
        </form>
        {/* Fehleranzeige */}
        {placeholderError && (
          <p className="mt-2 text-center text-sm text-red-500">
            {placeholderError}
          </p>
        )}
      </div>
    );
  }

  // --- Bildanzeige mit Lade- und Fehlerstatus ---
  return (
    <div
      ref={dragRef}
      className={cn(
        "group relative rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md",
        isSelected && "ring-2 ring-blue-500"
      )}
      onClick={onSelect}
    >
      {/* Ladeindikator */}
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      )}
      {/* Fehleranzeige */}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-destructive/10 text-destructive p-4">
          <AlertCircle className="w-8 h-8 mb-2" />
          <span>Bild konnte nicht geladen werden</span>
        </div>
      )}
      {/* Das eigentliche Bild */}
      <Image
        key={internalSrc}
        width={1920}
        height={1080}
        src={getProxiedImageUrl(internalSrc) ?? ""}
        alt={altText || "Bild"}
        className={cn(
          "transition-opacity duration-300 ease-in-out object-cover w-full h-auto",
          status === "loading" ? "opacity-50" : "opacity-100",
          status === "error" ? "opacity-0" : "opacity-100"
        )}
        onLoad={() => {
          setStatus("success");
        }}
        onError={() => {
          setStatus("error");
        }}
      />
    </div>
  );
}
