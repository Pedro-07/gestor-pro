import { Config } from '@remotion/cli/config'

Config.setVideoImageFormat('jpeg')
Config.setOverwriteOutput(true)
// Codec padrão H.264 (compatível com WhatsApp/celular)
Config.setCodec('h264')
