import { nativeImage, NativeImage } from 'electron'
import zlib from 'zlib'

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[n] = c
  }
  return table
})()

function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff]
  }
  return (crc ^ 0xffffffff) >>> 0
}

function makeChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcInput = Buffer.concat([typeBytes, data])
  const crcVal = crc32(crcInput)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crcVal, 0)
  return Buffer.concat([len, typeBytes, data, crcBuf])
}

function createCirclePNG(r: number, g: number, b: number, size = 16): Buffer {
  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(size, 0)
  ihdrData.writeUInt32BE(size, 4)
  ihdrData[8] = 8  // bit depth
  ihdrData[9] = 6  // RGBA color type

  const cx = size / 2
  const cy = size / 2
  const radius = size / 2 - 1.5

  const rawData = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    rawData[y * (size * 4 + 1)] = 0 // filter: None
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2)
      const alpha =
        dist <= radius ? 255 : dist <= radius + 1 ? Math.round((radius + 1 - dist) * 255) : 0
      const offset = y * (size * 4 + 1) + 1 + x * 4
      rawData[offset] = r
      rawData[offset + 1] = g
      rawData[offset + 2] = b
      rawData[offset + 3] = alpha
    }
  }

  const compressed = zlib.deflateSync(rawData)

  return Buffer.concat([
    PNG_SIGNATURE,
    makeChunk('IHDR', ihdrData),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ])
}

export type TrayIconStatus = 'sleeping' | 'checking' | 'awake' | 'paused'

export function createTrayIcons(): Record<TrayIconStatus, NativeImage> {
  return {
    sleeping: nativeImage.createFromBuffer(createCirclePNG(136, 136, 136)),
    checking: nativeImage.createFromBuffer(createCirclePNG(245, 158, 11)),
    awake: nativeImage.createFromBuffer(createCirclePNG(16, 185, 129)),
    paused: nativeImage.createFromBuffer(createCirclePNG(239, 68, 68)),
  }
}
