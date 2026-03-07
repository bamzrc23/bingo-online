import fs from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

type MediaAssetKind = 'letter' | 'slide'

type MediaAsset = {
  id: string
  src: string
  name: string
  kind: MediaAssetKind
}

type FolderConfig = {
  folder: string
  kind: MediaAssetKind
}

const IMAGE_EXTENSIONS = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.webp',
])

const FOLDERS: FolderConfig[] = [
  { folder: 'letters', kind: 'letter' },
  { folder: 'slides', kind: 'slide' },
]

const toMediaAsset = (folder: string, kind: MediaAssetKind, fileName: string): MediaAsset => {
  const parsed = path.parse(fileName)
  return {
    id: `${folder}/${fileName}`,
    src: `/${folder}/${fileName}`,
    name: parsed.name,
    kind,
  }
}

const readFolderAssets = async (
  publicDir: string,
  config: FolderConfig
): Promise<MediaAsset[]> => {
  const folderPath = path.join(publicDir, config.folder)
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile())
      .filter((entry) => IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      )
      .map((entry) => toMediaAsset(config.folder, config.kind, entry.name))
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return []
    throw error
  }
}

export async function GET() {
  const publicDir = path.join(process.cwd(), 'public')

  try {
    const assetsByFolder = await Promise.all(
      FOLDERS.map((config) => readFolderAssets(publicDir, config))
    )
    return NextResponse.json({ assets: assetsByFolder.flat() })
  } catch {
    return NextResponse.json({ assets: [], error: 'Failed to read assets' }, { status: 500 })
  }
}
