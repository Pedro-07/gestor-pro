import {
  AbsoluteFill, Sequence, OffthreadVideo, staticFile,
  useCurrentFrame, useVideoConfig, interpolate, spring, Easing,
} from 'remotion'
import { trimMs, type TutorialProps } from './Tutorial'

// Versão "Pro": mesmo conteúdo do mobile, porém com motion mais fluido
// (springs com overshoot, easing suave, celular flutuando, barra de progresso,
// legendas cinéticas). Tudo com o motion nativo do Remotion (determinístico).
export const MP_FPS = 30
export const MP_INTRO = 80
export const MP_OUTRO = 80
const BRAND = '#2563eb'
const APP = 'Stok Master'

const SCREEN_W = 520
const SCREEN_H = Math.round(SCREEN_W * (932 / 430))
const BEZEL = 16
const DEV_W = SCREEN_W + BEZEL * 2
const DEV_H = SCREEN_H + BEZEL * 2
const DEV_X = (1080 - DEV_W) / 2
const DEV_Y = 210

const ease = Easing.bezier(0.16, 1, 0.3, 1) // "easeOutExpo"-ish, bem fluido

export const mpFramesFor = (c: TutorialProps['chapters']) =>
  MP_INTRO + Math.ceil(((c.videoDurationMs - trimMs(c)) / 1000) * MP_FPS) + MP_OUTRO

// Celular com entrada por spring + flutuação contínua suave
const Phone: React.FC<{ src: string; startFromFrames: number }> = ({ src, startFromFrames }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = spring({ frame, fps, config: { damping: 14, mass: 0.8, stiffness: 110 } })
  const floatY = Math.sin(frame / 22) * 7
  const scale = interpolate(enter, [0, 1], [0.92, 1])
  const y = interpolate(enter, [0, 1], [60, 0]) + floatY
  return (
    <div style={{ position: 'absolute', left: DEV_X, top: DEV_Y, width: DEV_W, height: DEV_H, transform: `translateY(${y}px) scale(${scale})`, opacity: enter }}>
      <div style={{ position: 'absolute', inset: 0, background: '#0a0a0f', borderRadius: 62, boxShadow: '0 40px 90px rgba(0,0,0,0.6), inset 0 0 0 2px #23232b' }} />
      <div style={{ position: 'absolute', left: BEZEL, top: BEZEL, width: SCREEN_W, height: SCREEN_H, borderRadius: 46, overflow: 'hidden', background: 'black' }}>
        <OffthreadVideo src={staticFile(src)} startFrom={startFromFrames} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <div style={{ position: 'absolute', left: '50%', top: BEZEL + 12, transform: 'translateX(-50%)', width: 118, height: 30, background: 'black', borderRadius: 20 }} />
    </div>
  )
}

// Legenda cinética: sobe com easing suave, leve escala, e barra de tempo
const Caption: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const inT = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp', easing: ease })
  const outT = interpolate(frame, [durationInFrames - 9, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', easing: Easing.in(Easing.ease) })
  const op = Math.min(inT, outT)
  const y = interpolate(inT, [0, 1], [46, 0])
  const scale = interpolate(inT, [0, 1], [0.96, 1])
  const prog = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: 'clamp' })
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 1430, display: 'flex', justifyContent: 'center', padding: '0 60px' }}>
      <div style={{ opacity: op, transform: `translateY(${y}px) scale(${scale})`, maxWidth: 900, width: '100%' }}>
        <div style={{ textAlign: 'center', background: 'rgba(10,15,25,0.92)', border: `1px solid ${BRAND}`, borderRadius: 24, padding: '26px 34px 30px', color: 'white', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 42, fontWeight: 600, lineHeight: 1.28, boxShadow: '0 16px 50px rgba(0,0,0,0.5)' }}>
          {text}
          <div style={{ marginTop: 18, height: 5, borderRadius: 5, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${prog * 100}%`, background: BRAND, borderRadius: 5 }} />
          </div>
        </div>
      </div>
    </div>
  )
}

const Card: React.FC<{ title: string; sub: string }> = ({ title, sub }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame, fps, config: { damping: 13, mass: 0.9, stiffness: 100 } })
  const blur = interpolate(s, [0, 1], [14, 0])
  const chip = spring({ frame: frame - 4, fps, config: { damping: 12 } })
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(1200px 900px at 50% 25%, #16223f, #0b1220)', justifyContent: 'center', alignItems: 'center', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ transform: `scale(${interpolate(s, [0, 1], [0.85, 1])})`, opacity: s, filter: `blur(${blur}px)`, textAlign: 'center' }}>
        <div style={{ display: 'inline-block', transform: `scale(${chip})`, background: BRAND, color: 'white', fontWeight: 800, fontSize: 34, padding: '10px 24px', borderRadius: 14, letterSpacing: 1 }}>{APP}</div>
        <div style={{ color: 'white', fontSize: 88, fontWeight: 800, marginTop: 40 }}>{title}</div>
        <div style={{ color: '#93a4c3', fontSize: 44, marginTop: 16 }}>{sub}</div>
      </div>
    </AbsoluteFill>
  )
}

export const TutorialMobilePro: React.FC<TutorialProps> = ({ src, title, subtitle, chapters }) => {
  const { fps, durationInFrames } = useVideoConfig()
  const trim = trimMs(chapters)
  const videoFrames = Math.ceil(((chapters.videoDurationMs - trim) / 1000) * fps)
  const frame = useCurrentFrame()
  const globalProg = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(1200px 900px at 50% 20%, #16223f, #0b1220)' }}>
      <Sequence durationInFrames={MP_INTRO}><Card title={`Tutorial: ${title}`} sub={`${subtitle} · no celular`} /></Sequence>

      <Sequence from={MP_INTRO} durationInFrames={videoFrames}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 66, textAlign: 'center', color: 'white', fontFamily: 'Inter, system-ui, sans-serif' }}>
          <div style={{ fontSize: 56, fontWeight: 800 }}>{title}</div>
          <div style={{ fontSize: 30, color: '#93a4c3', marginTop: 6 }}>{APP}</div>
        </div>
        <Phone src={src} startFromFrames={Math.round((trim / 1000) * fps)} />
        {chapters.captions.map((c, i) => {
          const from = Math.max(0, Math.round(((c.startMs - trim) / 1000) * fps))
          const dur = Math.max(15, Math.round(((c.endMs - c.startMs) / 1000) * fps))
          return <Sequence key={i} from={from} durationInFrames={dur}><Caption text={c.caption} /></Sequence>
        })}
      </Sequence>

      <Sequence from={MP_INTRO + videoFrames} durationInFrames={MP_OUTRO}><Card title="É isso! 🎉" sub={`${title} — direto do celular.`} /></Sequence>

      {/* barra de progresso global fina no topo */}
      <div style={{ position: 'absolute', left: 0, top: 0, height: 8, width: `${globalProg * 100}%`, background: BRAND }} />
    </AbsoluteFill>
  )
}
