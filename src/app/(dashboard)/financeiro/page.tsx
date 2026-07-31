'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TransacoesPanel } from '@/components/panels/transacoes-panel'
import { RecebimentosPanel } from '@/components/panels/recebimentos-panel'
import RelatoriosPage from '../relatorios/relatorios-view'
import { Receipt, DollarSign, BarChart3 } from 'lucide-react'

export default function FinanceiroPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Financeiro</h1>
        <p className="text-sm text-muted-foreground">Transações, recebimentos e relatórios do seu negócio</p>
      </div>
      <Tabs defaultValue="transacoes" className="flex flex-col">
        <TabsList className="grid grid-cols-3 w-full sm:inline-flex sm:w-auto mb-2">
          <TabsTrigger value="transacoes"><Receipt className="h-4 w-4 mr-2 shrink-0" /><span className="truncate">Transações</span></TabsTrigger>
          <TabsTrigger value="recebimentos"><DollarSign className="h-4 w-4 mr-2 shrink-0" /><span className="truncate">Recebimentos</span></TabsTrigger>
          <TabsTrigger value="relatorios"><BarChart3 className="h-4 w-4 mr-2 shrink-0" /><span className="truncate">Relatórios</span></TabsTrigger>
        </TabsList>
        <TabsContent value="transacoes"><TransacoesPanel /></TabsContent>
        <TabsContent value="recebimentos"><RecebimentosPanel /></TabsContent>
        <TabsContent value="relatorios"><RelatoriosPage /></TabsContent>
      </Tabs>
    </div>
  )
}
