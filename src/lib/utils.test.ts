import { describe, it, expect } from 'vitest'
import {
  gerarParcelasPromissoria,
  isValidCPF,
  isValidCNPJ,
  slugify,
  generateClientCode,
  generateProductCode,
} from './utils'

const somar = (valores: number[]) => Math.round(valores.reduce((s, v) => s + v, 0) * 100) / 100

describe('gerarParcelasPromissoria', () => {
  const base = { clienteNome: 'Maria', clienteTelefone: '11999999999' }

  it('divide em parcelas iguais quando a conta fecha', () => {
    const parcelas = gerarParcelasPromissoria({ ...base, total: 300, numeroParcelas: 3 })
    expect(parcelas).toHaveLength(3)
    expect(parcelas.map((p) => p.valor)).toEqual([100, 100, 100])
  })

  it('última parcela absorve a diferença de arredondamento (soma fecha com o total)', () => {
    const parcelas = gerarParcelasPromissoria({ ...base, total: 100, numeroParcelas: 3 })
    expect(parcelas.map((p) => p.valor)).toEqual([33.33, 33.33, 33.34])
    expect(somar(parcelas.map((p) => p.valor))).toBe(100)
  })

  it('soma fecha com o total para vários casos de centavos', () => {
    for (const [total, n] of [[199.9, 3], [250, 7], [99.99, 6], [1037.77, 12]] as const) {
      const parcelas = gerarParcelasPromissoria({ ...base, total, numeroParcelas: n })
      expect(somar(parcelas.map((p) => p.valor)), `total=${total} n=${n}`).toBe(total)
    }
  })

  it('entrada vira parcela nº 0 com vencimento na data base', () => {
    const dataBase = new Date('2026-11-15T12:00:00Z')
    const parcelas = gerarParcelasPromissoria({ ...base, total: 100, entrada: 40, numeroParcelas: 2, dataBase })
    expect(parcelas).toHaveLength(3)
    expect(parcelas[0]).toMatchObject({ numero: 0, valor: 40, dataVencimento: dataBase.toISOString() })
    expect(parcelas[1].valor + parcelas[2].valor).toBe(60)
  })

  it('vencimentos são mensais a partir da data base', () => {
    const dataBase = new Date('2026-01-15T12:00:00Z')
    const parcelas = gerarParcelasPromissoria({ ...base, total: 200, numeroParcelas: 2, dataBase })
    expect(new Date(parcelas[0].dataVencimento).getMonth()).toBe(1) // fevereiro
    expect(new Date(parcelas[1].dataVencimento).getMonth()).toBe(2) // março
  })

  it('todas nascem pendentes, sem pagamento e com o nome do cliente', () => {
    const parcelas = gerarParcelasPromissoria({ ...base, total: 100, numeroParcelas: 2 })
    for (const p of parcelas) {
      expect(p).toMatchObject({ status: 'pendente', valorPago: 0, pagamentos: [], clienteNome: 'Maria', totalParcelas: 2 })
    }
  })
})

describe('isValidCPF', () => {
  it('aceita CPF válido (com e sem máscara)', () => {
    expect(isValidCPF('529.982.247-25')).toBe(true)
    expect(isValidCPF('52998224725')).toBe(true)
  })
  it('rejeita dígito verificador errado, repetidos e tamanho errado', () => {
    expect(isValidCPF('529.982.247-24')).toBe(false)
    expect(isValidCPF('111.111.111-11')).toBe(false)
    expect(isValidCPF('123')).toBe(false)
    expect(isValidCPF('')).toBe(false)
  })
})

describe('isValidCNPJ', () => {
  it('aceita CNPJ válido (com e sem máscara)', () => {
    expect(isValidCNPJ('11.222.333/0001-81')).toBe(true)
    expect(isValidCNPJ('11222333000181')).toBe(true)
  })
  it('rejeita dígito verificador errado, repetidos e tamanho errado', () => {
    expect(isValidCNPJ('11.222.333/0001-80')).toBe(false)
    expect(isValidCNPJ('11111111111111')).toBe(false)
    expect(isValidCNPJ('123')).toBe(false)
  })
})

describe('slugify', () => {
  it('normaliza acentos, espaços e maiúsculas', () => {
    expect(slugify('Loja da Maria João')).toBe('loja-da-maria-joao')
    expect(slugify('  Promoção!! 50% OFF  ')).toBe('promocao-50-off')
  })
  it('limita a 40 caracteres e remove hífens das pontas', () => {
    expect(slugify('-abc-')).toBe('abc')
    expect(slugify('a'.repeat(60)).length).toBeLessThanOrEqual(40)
  })
})

describe('códigos internos', () => {
  it('generateClientCode continua a sequência e ignora códigos estranhos', () => {
    expect(generateClientCode([])).toBe('CLI-0001')
    expect(generateClientCode(['CLI-0001', 'CLI-0009', 'XYZ', ''])).toBe('CLI-0010')
  })
  it('generateProductCode usa o prefixo da categoria', () => {
    expect(generateProductCode('camiseta', [])).toBe('CAM-001')
    expect(generateProductCode('camiseta', ['CAM-001', 'CAM-007', 'CAL-002'])).toBe('CAM-008')
    expect(generateProductCode('inexistente', [])).toBe('OUT-001')
  })
})
