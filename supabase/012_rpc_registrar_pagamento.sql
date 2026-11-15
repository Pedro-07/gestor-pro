-- ============================================================================
-- MIGRATION 012 — RPC registrar_pagamento (transacional)
-- Antes, o pagamento era calculado no NAVEGADOR (valorPago + pagamentos do
-- cache) e gravado por cima com UPDATE — dois registros quase simultâneos, ou
-- uma aba desatualizada, sobrescreviam um pagamento silenciosamente.
-- Agora a parcela é travada (FOR UPDATE) e o novo saldo/status/histórico é
-- calculado AQUI, a partir do estado atual do banco.
--
-- SECURITY INVOKER: roda com o RLS do usuário logado (loja_id = auth.uid()).
-- Idempotente (CREATE OR REPLACE). Execute no SQL Editor do Supabase.
-- ============================================================================

CREATE OR REPLACE FUNCTION registrar_pagamento(
  p_parcela_id UUID,
  p_valor NUMERIC,
  p_data_pagamento TIMESTAMPTZ,
  p_forma_pagamento TEXT,
  p_observacoes TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parcela RECORD;
  v_novo_pago NUMERIC;
  v_status TEXT;
BEGIN
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'Valor do pagamento deve ser maior que zero';
  END IF;

  SELECT id, valor, "valorPago", status, pagamentos
    INTO v_parcela
    FROM parcelas WHERE id = p_parcela_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela não encontrada';
  END IF;

  IF v_parcela.status IN ('paga', 'cancelada') THEN
    RAISE EXCEPTION 'Esta parcela já está % — recarregue a página', v_parcela.status;
  END IF;

  v_novo_pago := v_parcela."valorPago" + p_valor;
  v_status := CASE WHEN v_parcela.valor - v_novo_pago <= 0 THEN 'paga' ELSE 'parcialmente_paga' END;

  UPDATE parcelas SET
    "valorPago" = v_novo_pago,
    status = v_status,
    pagamentos = COALESCE(pagamentos, '[]'::jsonb) || jsonb_build_object(
      'id', gen_random_uuid()::TEXT,
      'valor', p_valor,
      'dataPagamento', p_data_pagamento,
      'formaPagamento', p_forma_pagamento,
      'observacoes', COALESCE(p_observacoes, '')
    ),
    "updatedAt" = now()
  WHERE id = p_parcela_id;
END;
$$;

GRANT EXECUTE ON FUNCTION registrar_pagamento(UUID, NUMERIC, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;
