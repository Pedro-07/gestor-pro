import { z } from 'zod'

/**
 * Campo de texto opcional que aceita null (vindo do banco) e normaliza para
 * undefined antes de validar. Evita a classe de bug em que `z.string().optional()`
 * rejeita `null` e faz o formulário falhar em silêncio ao editar um registro.
 */
export const optionalText = z.preprocess((v) => (v == null ? undefined : v), z.string().optional())

/** Igual ao optionalText, mas com uma validação extra aplicada só quando há valor. */
export const optionalTextRefined = (check: (v: string) => boolean, msg: string) =>
  z.preprocess((v) => (v == null ? undefined : v), z.string().refine((v) => !v || check(v), msg).optional())
