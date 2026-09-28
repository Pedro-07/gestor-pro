// Compressão/redimensionamento de imagem no navegador (antes do upload).
// Reduz fotos de 2–3 MB (direto da câmera) para ~100–300 KB sem perda visível,
// convertendo para WebP (menor que JPEG na mesma qualidade). Se algo falhar
// (ex.: HEIC que o browser não decodifica), devolve o arquivo original.

export interface CompressResult {
  blob: Blob
  ext: string
  type: string
}

function lerComoDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function canvasParaBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality))
}

function extDoArquivo(file: File): string {
  return (file.name.split('.').pop() || 'jpg').toLowerCase()
}

export async function compressImage(
  file: File,
  { maxDim = 1200, quality = 0.8 }: { maxDim?: number; quality?: number } = {},
): Promise<CompressResult> {
  // Não é imagem → não mexe
  if (!file.type.startsWith('image/')) {
    return { blob: file, ext: extDoArquivo(file), type: file.type || 'application/octet-stream' }
  }

  try {
    const dataUrl = await lerComoDataURL(file)
    const img = await carregarImagem(dataUrl)

    let { width, height } = img
    if (!width || !height) throw new Error('Dimensões inválidas')

    if (width > maxDim || height > maxDim) {
      const escala = Math.min(maxDim / width, maxDim / height)
      width = Math.round(width * escala)
      height = Math.round(height * escala)
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Sem contexto 2D')
    ctx.drawImage(img, 0, 0, width, height)

    // Tenta WebP; se o browser não suportar toBlob webp, cai para JPEG.
    let blob = await canvasParaBlob(canvas, 'image/webp', quality)
    let type = 'image/webp'
    let ext = 'webp'
    if (!blob) {
      blob = await canvasParaBlob(canvas, 'image/jpeg', quality)
      type = 'image/jpeg'
      ext = 'jpg'
    }
    if (!blob) throw new Error('Falha ao gerar blob')

    // Se por acaso ficou maior que o original, mantém o original.
    if (blob.size >= file.size) {
      return { blob: file, ext: extDoArquivo(file), type: file.type }
    }

    return { blob, ext, type }
  } catch {
    // Qualquer falha de decodificação → envia o original sem quebrar o fluxo.
    return { blob: file, ext: extDoArquivo(file), type: file.type }
  }
}
