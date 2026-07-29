import React from 'react'
import { Composition } from 'remotion'
import { Tutorial, framesFor, FPS, type Chapters } from './Tutorial'
import { TutorialMobilePro, mpFramesFor, MP_FPS } from './TutorialMobilePro'
import { SECTIONS } from './sections'

import ch_pdv from '../public/chapters-pdv.json'
import ch_pdv_m from '../public/chapters-pdv-mobile.json'
import ch_estoque from '../public/chapters-estoque.json'
import ch_estoque_m from '../public/chapters-estoque-mobile.json'
import ch_vendas from '../public/chapters-vendas.json'
import ch_vendas_m from '../public/chapters-vendas-mobile.json'
import ch_consig from '../public/chapters-consignacoes.json'
import ch_consig_m from '../public/chapters-consignacoes-mobile.json'
import ch_rel from '../public/chapters-relatorios.json'
import ch_rel_m from '../public/chapters-relatorios-mobile.json'
import ch_cfg from '../public/chapters-configuracoes.json'
import ch_cfg_m from '../public/chapters-configuracoes-mobile.json'

const CH: Record<string, { d: Chapters; m: Chapters }> = {
  pdv: { d: ch_pdv, m: ch_pdv_m },
  estoque: { d: ch_estoque, m: ch_estoque_m },
  vendas: { d: ch_vendas, m: ch_vendas_m },
  consignacoes: { d: ch_consig, m: ch_consig_m },
  relatorios: { d: ch_rel, m: ch_rel_m },
  configuracoes: { d: ch_cfg, m: ch_cfg_m },
}

export const RemotionRoot: React.FC = () => (
  <>
    {SECTIONS.map((s) => (
      <React.Fragment key={s.id}>
        <Composition
          id={s.id}
          component={Tutorial}
          durationInFrames={framesFor(CH[s.id].d)}
          fps={FPS}
          width={1280}
          height={720}
          defaultProps={{ src: `${s.id}.webm`, title: s.title, subtitle: s.subtitle, chapters: CH[s.id].d }}
        />
        <Composition
          id={`${s.id}-mobile`}
          component={TutorialMobilePro}
          durationInFrames={mpFramesFor(CH[s.id].m)}
          fps={MP_FPS}
          width={1080}
          height={1920}
          defaultProps={{ src: `${s.id}-mobile.webm`, title: s.title, subtitle: s.subtitle, chapters: CH[s.id].m }}
        />
      </React.Fragment>
    ))}
  </>
)
