import {
  AbsoluteFill, Sequence, OffthreadVideo, staticFile,
  useCurrentFrame, useVideoConfig, interpolate, spring,
} from 'remotion'
import { trimMs, type TutorialProps, type Chapters } from './Tutorial'

export const M_FPS = 30
export const M_INTRO = 70
export const M_OUTRO = 70
const BRAND = '#2563eb'
const APP = 'Stok Master'

const SCREEN_W = 520
const SCREEN_H = Math.round(SCREEN_W * (932 / 430))
const BEZEL = 16
const DEV_W = SCREEN_W + BEZEL * 2
const DEV_H = SCREEN_H + BEZEL * 2
const DEV_X = (1080 - DEV_W) / 2
const DEV_Y = 210

export const mFramesFor = (chapters: Chapters) => M_INTRO + Math.ceil(((chapters.videoDurationMs - trimMs(chapters)) / 1000) * M_FPS) + M_OUTRO

const Phone: React.FC<{ src: string; startFromFrames: number }> = ({ src, startFromFrames }) => (
  <div style={{ position: 'absolute', left: DEV_X, top: DEV_Y, width: DEV_W, height: DEV_H, background: '#0a0a0f', borderRadius: 62, boxShadow: '0 30px 80px rgba(0,0,0,0.55), inset 0 0 0 2px #23232b' }}>
    <div style={{ position: 'absolute', left: BEZEL, top: BEZEL, width: SCREEN_W, height: SCREEN_H, borderRadius: 46, overflow: 'hidden', background: 'black' }}>
      <OffthreadVideo src={staticFile(src)} startFrom={startFromFrames} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
    <div style={{ position: 'absolute', left: '50%', top: BEZEL + 12, transform: 'translateX(-50%)', width: 118, height: 30, background: 'black', borderRadius: 20 }} />
  </div>
)

const Caption: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const appear = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 10 })
  const fadeOut = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 1440, display: 'flex', justifyContent: 'center', padding: '0 60px' }}>
      <div style={{
        opacity: Math.min(appear, fadeOut), transform: `translateY(${interpolate(appear, [0, 1], [30, 0])}px)`,
        maxWidth: 900, textAlign: 'center', background: 'rgba(10,15,25,0.9)', border: `1px solid ${BRAND}`, borderRadius: 22,
        padding: '26px 34px', color: 'white', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 42, fontWeight: 600, lineHeight: 1.28, boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
      }}>{text}</div>
    </div>
  )
}

const Card: React.FC<{ title: string; sub: string }> = ({ title, sub }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame, fps, config: { damping: 200 } })
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(160deg,#0b1220,#14213d)', justifyContent: 'center', alignItems: 'center', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ transform: `scale(${interpolate(s, [0, 1], [0.9, 1])})`, opacity: s, textAlign: 'center' }}>
        <div style={{ display: 'inline-block', background: BRAND, color: 'white', fontWeight: 800, fontSize: 34, padding: '10px 24px', borderRadius: 14, letterSpacing: 1 }}>{APP}</div>
        <div style={{ color: 'white', fontSize: 88, fontWeight: 800, marginTop: 40 }}>{title}</div>
        <div style={{ color: '#93a4c3', fontSize: 44, marginTop: 16 }}>{sub}</div>
      </div>
    </AbsoluteFill>
  )
}

export const TutorialMobile: React.FC<TutorialProps> = ({ src, title, subtitle, chapters }) => {
  const { fps } = useVideoConfig()
  const trim = trimMs(chapters)
  const videoFrames = Math.ceil(((chapters.videoDurationMs - trim) / 1000) * fps)
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(1200px 900px at 50% 20%, #16223f, #0b1220)' }}>
      <Sequence durationInFrames={M_INTRO}><Card title={`Tutorial: ${title}`} sub={`${subtitle} · no celular`} /></Sequence>
      <Sequence from={M_INTRO} durationInFrames={videoFrames}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 70, textAlign: 'center', color: 'white', fontFamily: 'Inter, system-ui, sans-serif' }}>
          <div style={{ fontSize: 54, fontWeight: 800 }}>{title}</div>
          <div style={{ fontSize: 30, color: '#93a4c3', marginTop: 6 }}>{APP}</div>
        </div>
        <Phone src={src} startFromFrames={Math.round((trim / 1000) * fps)} />
        {chapters.captions.map((c, i) => {
          const from = Math.max(0, Math.round(((c.startMs - trim) / 1000) * fps))
          const dur = Math.max(15, Math.round(((c.endMs - c.startMs) / 1000) * fps))
          return <Sequence key={i} from={from} durationInFrames={dur}><Caption text={c.caption} /></Sequence>
        })}
      </Sequence>
      <Sequence from={M_INTRO + videoFrames} durationInFrames={M_OUTRO}><Card title="É isso! 🎉" sub={`${title} — direto do celular.`} /></Sequence>
    </AbsoluteFill>
  )
}
