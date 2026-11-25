import { createFileRoute } from "@tanstack/react-router";

import { CatalogDownloadManager } from "@/features/catalog-offline/catalog-download-manager";

export const Route = createFileRoute("/setting/catalog-images")({ component: CatalogDownloadManager });
