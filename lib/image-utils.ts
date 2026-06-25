// Client-side image downscaling. A phone photo can be 4000px+ and several MB,
// which makes both the network upload and (far more importantly) the AI image
// model dramatically slower. Shrinking the room photo to a sane max dimension
// before it enters the pipeline is the single biggest speed win for both the
// analyse-room and visualise-room calls, with no visible quality loss at the
// sizes we display.
export async function downscaleImageDataUrl(
  dataUrl: string,
  maxDimension = 1280,
  quality = 0.82,
): Promise<string> {
  // Guard for SSR / unsupported environments — just return the original.
  if (typeof document === "undefined") return dataUrl

  try {
    const img = await loadImage(dataUrl)
    const { width, height } = img

    // Already small enough — don't re-encode and risk growing the file.
    if (Math.max(width, height) <= maxDimension) return dataUrl

    const scale = maxDimension / Math.max(width, height)
    const targetW = Math.round(width * scale)
    const targetH = Math.round(height * scale)

    const canvas = document.createElement("canvas")
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext("2d")
    if (!ctx) return dataUrl

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(img, 0, 0, targetW, targetH)

    // JPEG keeps photos small; the room photo never needs transparency.
    return canvas.toDataURL("image/jpeg", quality)
  } catch {
    // Never block the flow on a resize failure — fall back to the original.
    return dataUrl
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
