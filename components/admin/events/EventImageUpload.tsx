'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { uploadImage } from '@/lib/storage/imageUpload'
import { toast } from 'sonner'

export function EventImageUpload({ defaultValue = '' }: { defaultValue?: string | null }) {
  const [imageUrl, setImageUrl] = useState(defaultValue || '')
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const chooseImage = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Image must be 8 MB or smaller')
      return
    }

    setUploading(true)
    try {
      const result = await uploadImage('event-images', file)
      if ('error' in result) {
        toast.error(`Image upload failed: ${result.error}`)
        return
      }
      setImageUrl(result.url)
      toast.success('Event image uploaded')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Image upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2 sm:col-span-2 xl:col-span-3">
      <input type="hidden" name="cover_image_url" value={imageUrl} />
      <span className="text-sm font-medium text-white">Event image (optional)</span>
      <div className="flex flex-wrap items-center gap-3">
        {imageUrl && <img src={imageUrl} alt="Event cover preview" className="h-16 w-28 rounded-lg border border-white/10 object-cover" />}
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" onChange={(event) => void chooseImage(event.target.files?.[0])} />
        <Button type="button" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
          {uploading ? 'Uploading image…' : imageUrl ? 'Change image' : 'Upload image'}
        </Button>
        {imageUrl && <Button type="button" variant="ghost" size="sm" onClick={() => setImageUrl('')}><X className="mr-1 h-4 w-4" />Remove</Button>}
        <p className="text-xs text-secondary-content">JPG, PNG, WebP, or AVIF · up to 8 MB</p>
      </div>
    </div>
  )
}
