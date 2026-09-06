import { supabase } from '@/lib/supabase/client'

/**
 * Uploads an image under a name taken from its own bytes.
 *
 * Every admin modal used to name its upload `crypto.randomUUID()`. A random name
 * is a different name every time, so the same picture sent twice - one item
 * edited and saved again, or one photo used for two stations - landed in the
 * bucket as two identical objects, and nothing ever cleaned either up. Naming a
 * file after the hash of its contents makes one image one object: a second
 * upload of the same bytes resolves to the path already holding them.
 *
 * The trade is that an object is now shared by every row pointing at that image,
 * so deleting one row's picture must never delete the object - another item may
 * still be showing it. Nothing here deletes.
 */

export type ImageUploadResult = { url: string } | { error: string }

/**
 * Extension by declared type, so the stored name matches the actual format.
 *
 * The filename is only a fallback: a browser hands over the name from disk,
 * which can be missing, wrong, or absent an extension entirely.
 */
const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
}

/** The bytes' SHA-256, hex encoded. The same file always yields the same name. */
async function contentHash(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * A refusal because that object is already stored is the deduplication working.
 *
 * The path is the content hash, so whatever sits there is byte-for-byte the file
 * being uploaded - the caller wants its URL either way.
 */
function isAlreadyStored(error: { message: string; statusCode?: string }): boolean {
  return error.statusCode === '409' || /already exists|duplicate/i.test(error.message)
}

export async function uploadImage(bucket: string, file: File): Promise<ImageUploadResult> {
  const extension =
    EXTENSION_BY_TYPE[file.type] || file.name.split('.').pop()?.toLowerCase() || 'bin'

  let path: string
  try {
    // `crypto.subtle` exists only in a secure context. https and localhost both
    // qualify, but an admin reaching a dev server over plain http on the arena's
    // LAN does not, and there `crypto.subtle` is undefined. Reading the file can
    // fail too. Either way this has to come back as a message the caller can
    // show: thrown from inside the caller's startTransition it would reject
    // unhandled, leaving the save button spinning with nothing said.
    path = `${await contentHash(file)}.${extension}`
  } catch {
    return { error: 'Could not read that image. If you are not on https, try localhost.' }
  }

  // upsert stays off deliberately: an object at this path already holds these
  // exact bytes, so overwriting would re-send the file to reach the same result.
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false })

  if (error && !isAlreadyStored(error as { message: string; statusCode?: string })) {
    return { error: error.message }
  }

  return { url: supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl }
}
