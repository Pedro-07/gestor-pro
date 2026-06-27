import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const fakePhone = '11999999999';
  const fakeEmail = 'teste@teste.com';
  
  console.log('1. Cadastrando...');
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: fakeEmail,
    password: 'password123',
    options: {
      data: {
        nome: 'Tester',
        nome_loja: 'Loja Teste',
        telefone: fakePhone,
      }
    }
  });

  if (authError) {
    console.error('Erro de cadastro:', authError.message);
  } else {
    console.log('Cadastro OK!');
  }

  console.log('2. Testando RPC com o telefone', fakePhone);
  const { data: emailEncontrado, error: rpcError } = await supabase.rpc('get_email_by_phone', { 
    p_phone: fakePhone 
  });
  
  console.log('Email Encontrado:', emailEncontrado);
  console.log('Erro RPC:', rpcError);
}

run();
