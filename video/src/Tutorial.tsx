import {
  AbsoluteFill, Sequence, OffthreadVideo, staticFile,
  useCurrentFrame, useVideoConfig, interpolate, spring,
} from 'remotion'

export const FPS = 30
export const INTRO = 75
export const OUTRO = 75
const LEAD_MS = 800 // folga antes da 1ª legenda
const BRAND = '#2563eb'
const APP = 'Stok Master'

// Apara a tela de carregamento inicial (pre-roll) antes da 1ª ação.
export const trimMs = (chapters: Chapters) => Math.max(0, (chapters.captions[0]?.startMs ?? 0) - LEAD_MS)

export interface Chapters {
  videoDurationMs: number
  captions: { caption: string; startMs: number; endMs: number }[]
}
export interface TutorialProps {
  src: string
  title: string
  subtitle: string
  chapters: Chapters
}

export const framesFor = (chapters: Chapters) => INTRO + Math.ceil(((chapters.videoDurationMs - trimMs(chapters)) / 1000) * FPS) + OUTRO

const Caption: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const appear = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 10 })
  const fadeOut = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', padding: 48 }}>
      <div style={{
        opacity: Math.min(appear, fadeOut), transform: `translateY(${interpolate(appear, [0, 1], [40, 0])}px)`,
        maxWidth: '86%', background: 'rgba(10,15,25,0.86)', border: `1px solid ${BRAND}`, borderLeft: `6px solid ${BRAND}`,
        borderRadius: 16, padding: '18px 26px', color: 'white', fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 34, fontWeight: 600, lineHeight: 1.25, boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
      }}>{text}</div>
    </AbsoluteFill>
  )
}

const Card: React.FC<{ title: string; sub: string; big: string }> = ({ title, sub, big }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame, fps, config: { damping: 200 } })
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(135deg,#0b1220,#14213d)', justifyContent: 'center', alignItems: 'center', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ transform: `scale(${interpolate(s, [0, 1], [0.9, 1])})`, opacity: s, textAlign: 'center' }}>
        <div style={{ display: 'inline-block', background: BRAND, color: 'white', fontWeight: 800, fontSize: 26, padding: '8px 18px', borderRadius: 12, letterSpacing: 1 }}>{APP}</div>
        <div style={{ color: 'white', fontSize: 64, fontWeight: 800, marginTop: 28 }}>{title}</div>
        <div style={{ color: '#93a4c3', fontSize: 30, marginTop: 12 }}>{big || sub}</div>
      </div>
    </AbsoluteFill>
  )
}

export const Tutorial: React.FC<TutorialProps> = ({ src, title, subtitle, chapters }) => {
  const { fps } = useVideoConfig()
  const trim = trimMs(chapters)
  const videoFrames = Math.ceil(((chapters.videoDurationMs - trim) / 1000) * fps)
  return (
    <AbsoluteFill style={{ backgroundColor: '#0b1220' }}>
      <Sequence durationInFrames={INTRO}><Card title={`Tutorial: ${title}`} sub={subtitle} big={subtitle} /></Sequence>
      <Sequence from={INTRO} durationInFrames={videoFrames}>
        <AbsoluteFill style={{ backgroundColor: 'black' }}><OffthreadVideo src={staticFile(src)} startFrom={Math.round((trim / 1000) * fps)} /></AbsoluteFill>
        {chapters.captions.map((c, i) => {
          const from = Math.max(0, Math.round(((c.startMs - trim) / 1000) * fps))
          const dur = Math.max(15, Math.round(((c.endMs - c.startMs) / 1000) * fps))
          return <Sequence key={i} from={from} durationInFrames={dur}><Caption text={c.caption} /></Sequence>
        })}
      </Sequence>
      <Sequence from={INTRO + videoFrames} durationInFrames={OUTRO}><Card title="É isso! 🎉" sub={`${title} — feito.`} big={`${title} — feito.`} /></Sequence>
    </AbsoluteFill>
  )
}
