import {
  Activity,
  Award,
  BadgeCheck,
  Calendar,
  ClipboardList,
  CreditCard,
  DoorOpen,
  FileSpreadsheet,
  LayoutDashboard,
  QrCode,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Trophy,
  UserCog,
  Users,
} from 'lucide-react'

/**
 * Piezas compartidas por la comparación y el editor de roles. Viven juntas
 * porque las dos pantallas tienen que nombrar y dibujar un módulo igual: un
 * módulo que se llama distinto en cada vista obliga a releer.
 */

const MODULE_ICONS = {
  dashboard: LayoutDashboard,
  athletes: Users,
  memberships: Award,
  registrations: ClipboardList,
  staff_applications: BadgeCheck,
  events: Calendar,
  results: Trophy,
  checkin: QrCode,
  registration_access: DoorOpen,
  payments: CreditCard,
  pricing: Tag,
  shop: ShoppingBag,
  exports: FileSpreadsheet,
  analytics: Activity,
  audit: ScrollText,
  users: UserCog,
  roles: ShieldCheck,
}

export function ModuleGlyph({ module, size = 15 }) {
  const Icon = MODULE_ICONS[module] ?? Settings
  return (
    <span className="roles-module-glyph" aria-hidden>
      <Icon size={size} strokeWidth={1.7} />
    </span>
  )
}
