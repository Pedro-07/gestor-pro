'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  DollarSign,
  Package,
  Truck,
  Settings,
  ShoppingBag,
  ScanLine,
  Handshake,
  ClipboardList,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { useSidebarStore } from '@/store/sidebar-store'
import { useAppConfig } from '@/hooks/useAppConfig'
import { useQuery } from '@tanstack/react-query'
import { fetchPedidosNovosCount } from '@/lib/database'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/vendas', label: 'Minhas Vendas', icon: ShoppingCart },
  { href: '/vendas/pdv', label: 'PDV', icon: ScanLine },
  { href: '/pedidos', label: 'Pedidos', icon: ClipboardList },
  { href: '/consignacoes', label: 'Consignações', icon: Handshake },
  { href: '/financeiro', label: 'Financeiro', icon: DollarSign },
  { href: '/estoque', label: 'Estoque', icon: Package },
  { href: '/fornecedores', label: 'Fornecedores', icon: Truck },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
]

function usePedidosNovos() {
  const { data } = useQuery({ queryKey: ['pedidos-novos-count'], queryFn: fetchPedidosNovosCount, staleTime: 60_000 })
  return data ?? 0
}

export function Sidebar() {
  const pathname = usePathname()
  const { isOpen, isCollapsed, setOpen, toggleCollapsed } = useSidebarStore()
  const { nomeApp, logoUrl, usarFornecedor, meiosPagamento } = useAppConfig()
  const usarConsignado = meiosPagamento.consignado?.ativo !== false
  const pedidosNovos = usePedidosNovos()
  const items = navItems.filter(
    (i) =>
      (i.href !== '/fornecedores' || usarFornecedor) &&
      (i.href !== '/consignacoes' || usarConsignado)
  )

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 h-full z-50 bg-card border-r transition-all duration-300 flex flex-col',
          'lg:relative lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          isCollapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between p-4 h-16 border-b">
          <div className="flex items-center gap-2 min-w-0">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={nomeApp}
                width={32}
                height={32}
                className="rounded-lg shrink-0 object-cover"
              />
            ) : (
              <div className="bg-primary rounded-lg p-1.5 shrink-0">
                <ShoppingBag className="h-5 w-5 text-primary-foreground" />
              </div>
            )}
            {!isCollapsed && (
              <span className="font-bold text-sm truncate">{nomeApp}</span>
            )}
          </div>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
          <button
            onClick={toggleCollapsed}
            className="hidden lg:block text-muted-foreground hover:text-foreground"
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto">
          <ul className="space-y-1 px-2">
            {items.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <span className="relative shrink-0">
                      <Icon className="h-5 w-5" />
                      {item.href === '/pedidos' && pedidosNovos > 0 && isCollapsed && (
                        <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{pedidosNovos}</span>
                      )}
                    </span>
                    {!isCollapsed && <span className="flex-1">{item.label}</span>}
                    {item.href === '/pedidos' && pedidosNovos > 0 && !isCollapsed && (
                      <span className="h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{pedidosNovos}</span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <Separator />

        {!isCollapsed && (
          <div className="p-4 text-xs text-muted-foreground">
            v1.0.0
          </div>
        )}
      </aside>
    </>
  )
}

// Mobile bottom navigation
export function BottomNav() {
  const pathname = usePathname()
  const { meiosPagamento } = useAppConfig()
  const usarConsignado = meiosPagamento.consignado?.ativo !== false
  const mainItems = navItems.filter((i) => i.href !== '/consignacoes' || usarConsignado).slice(0, 5)

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t z-40">
      <ul className="flex">
        {mainItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-1 py-2 text-xs transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px]">{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
